from __future__ import annotations

import logging
import os
import traceback

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse  # noqa: F401  (reserved for V2 custom error responses)

from agent.graph import app as audit_graph
from agent.schemas import RepoAuditReport

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
