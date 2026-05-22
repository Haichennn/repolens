from __future__ import annotations

import json
import logging
import os
import traceback

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: F401  (JSONResponse reserved for V2)

from agent.graph import app as audit_graph
from agent.graph import audit_repo_streaming
from agent.nodes.due_diligence import assess_dependencies
from agent.nodes.memo import generate_memo
from agent.schemas import DecisionMemo, DueDiligenceReport, RepoAuditReport

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("repolens.api")

app = FastAPI(title="Repolens")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # V1: allow all; tighten in V2 to specific frontend domain
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "service": "Repolens",
        "tagline": "Agentic AI auditor for GitHub repositories",
        "endpoints": {
            "/health": "Health check",
            "/status": "Service status + configuration",
            "/audit": "Audit a GitHub repo (query param: repo_url)",
            "/docs": "Interactive API documentation"
        },
        "github": "https://github.com/Haichennn/repolens"
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "repolens"}


@app.get("/status")
async def status():
    """Return basic status info about the Repolens API and agent."""
    return {
        "service": "repolens",
        "version": "0.1.0",
        "status": "ready",
        "audit_dimensions": [
            "documentation",
            "architecture",
            "maintenance",
            "testing",
            "security",
        ],
        "github_token_configured": bool(os.getenv("GITHUB_TOKEN")),
        "anthropic_key_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@app.get("/audit", response_model=RepoAuditReport)
def audit_repo(
    repo_url: str = Query(..., description="GitHub repository URL to audit"),
):
    """
    Run the full Repolens audit (5 dimensions) on the given GitHub repository.

    This runs synchronously and may take 60-120 seconds because the Security
    audit spawns an MCP server subprocess and queries it for each dependency.

    Returns the complete RepoAuditReport with all 5 sub-audits + weighted overall score.
    """
    if not repo_url.startswith(("https://github.com/", "http://github.com/")):
        raise HTTPException(
            status_code=400,
            detail="repo_url must be a valid GitHub URL (https://github.com/owner/repo)",
        )

    logger.info(f"Starting audit for {repo_url}")

    try:
        result = audit_graph.invoke({"repo_url": repo_url})
        report = result.get("final_report")

        if report is None:
            logger.error(f"Audit completed but no report generated for {repo_url}")
            raise HTTPException(
                status_code=500,
                detail="Audit completed but no report was generated.",
            )

        logger.info(
            f"Audit complete: {repo_url} → score {report.overall_score}/100 "
            f"[{report.overall_severity.value}]"
        )
        return report

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Audit failed for {repo_url}: {exc}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Audit failed: {type(exc).__name__}: {str(exc)[:200]}",
        )


@app.get("/audit/stream")
async def audit_repo_stream(
    repo_url: str = Query(..., description="GitHub repository URL to audit (SSE stream)"),
):
    """
    Stream the Repolens audit as Server-Sent Events.

    Each event carries:
      event: node_complete | error
      data:  JSON object with the node name plus the node's payload flattened in

    The stream closes after the `aggregate` event fires (or on error). Clients
    should listen for `event: aggregate` as the signal that the full audit is done.
    """
    if not repo_url.startswith(("https://github.com/", "http://github.com/")):
        raise HTTPException(
            status_code=400,
            detail="repo_url must be a valid GitHub URL (https://github.com/owner/repo)",
        )

    logger.info(f"Starting SSE stream for {repo_url}")

    async def event_generator():
        try:
            async for event in audit_repo_streaming(repo_url):
                event_type = event["type"]
                node = event["node"]
                data = event["data"]

                if data is None:
                    payload: dict = {"node": node}
                elif hasattr(data, "model_dump"):
                    payload = {"node": node, **data.model_dump(mode="json")}
                elif isinstance(data, dict):
                    payload = {"node": node, **data}
                else:
                    payload = {"node": node, "value": str(data)}

                yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

            logger.info(f"SSE stream complete for {repo_url}")
        except Exception as exc:
            logger.error(
                f"SSE audit failed for {repo_url}: {exc}\n{traceback.format_exc()}"
            )
            error_payload = json.dumps(
                {"error": f"{type(exc).__name__}: {str(exc)[:200]}"}
            )
            yield f"event: error\ndata: {error_payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/memo", response_model=DecisionMemo)
def memo(report: RepoAuditReport):
    """Generate a decision memo from a completed audit report."""
    logger.info(f"Generating memo for: {report.repo_url}")
    try:
        memo = generate_memo(report)
        logger.info(f"Memo generated. Verdict: {memo.verdict}")
        return memo
    except Exception as exc:
        logger.error(f"Memo generation failed: {exc}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Memo generation failed: {str(exc)[:200]}",
        )


@app.post("/due-diligence", response_model=DueDiligenceReport)
async def due_diligence(report: RepoAuditReport):
    """Generate dependency due diligence report."""
    logger.info(f"Generating due diligence for: {report.repo_url}")
    try:
        result = await assess_dependencies(report)
        logger.info(
            f"Due diligence: {result.overall_risk_level} risk, "
            f"{result.high_risk_count} high-risk deps"
        )
        return result
    except Exception as exc:
        logger.error(
            f"Due diligence failed for {report.repo_url}: {exc}\n{traceback.format_exc()}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Due diligence failed: {str(exc)[:200]}",
        )
