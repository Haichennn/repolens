from __future__ import annotations

import os
import sys
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any, Optional, TypedDict

from dotenv import load_dotenv
from github import Github, GithubException
from langgraph.graph import END, START, StateGraph

from agent.nodes.architecture import audit_architecture
from agent.nodes.documentation import audit_documentation
from agent.nodes.maintenance import audit_maintenance
from agent.nodes.security import audit_security
from agent.nodes.testing import audit_testing
from agent.schemas import (
    ArchitectureAudit,
    DocumentationAudit,
    MaintenanceAudit,
    RepoAuditReport,
    SecurityAudit,
    Severity,
    TestingAudit,
)
from agent.utils.repo_inspector import parse_repo_url

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_PATH)


class AuditState(TypedDict, total=False):
    repo_url: str

    owner: str
    repo_name: str
    readme_text: str
    fetch_error: Optional[str]

    documentation_audit: Optional[DocumentationAudit]
    architecture_audit: Optional[ArchitectureAudit]
    maintenance_audit: Optional[MaintenanceAudit]
    testing_audit: Optional[TestingAudit]
    security_audit: Optional[SecurityAudit]

    final_report: Optional[RepoAuditReport]


def fetch_repo(state: AuditState) -> dict:
    """
    Fetch repo metadata + README once. The actual audit nodes do their own
    additional fetches (architecture pulls file tree, maintenance pulls
    commits, etc.) — this just primes the basic identity + README.
    """
    try:
        owner, repo_name = parse_repo_url(state["repo_url"])
    except Exception as exc:
        return {"fetch_error": f"URL parse failed: {exc}"}

    token = os.getenv("GITHUB_TOKEN")
    gh = Github(token) if token else Github()

    try:
        repo = gh.get_repo(f"{owner}/{repo_name}")
        try:
            readme = repo.get_readme()
            readme_text = readme.decoded_content.decode("utf-8", errors="replace")[:3000]
        except GithubException:
            readme_text = ""

        return {
            "owner": owner,
            "repo_name": repo_name,
            "readme_text": readme_text,
        }
    except GithubException as exc:
        return {"fetch_error": f"Repo access failed: {exc}"}


def aggregate(state: AuditState) -> dict:
    """
    Combine the 5 audit results into a single RepoAuditReport.
    Overall score is a weighted average; severity follows from score thresholds.
    """
    if state.get("fetch_error"):
        return {
            "final_report": RepoAuditReport(
                repo_url=state["repo_url"],
                owner=state.get("owner", "unknown"),
                repo_name=state.get("repo_name", "unknown"),
                overall_score=0,
                overall_severity=Severity.CRITICAL,
            )
        }

    doc = state.get("documentation_audit")
    arch = state.get("architecture_audit")
    maint = state.get("maintenance_audit")
    test = state.get("testing_audit")
    sec = state.get("security_audit")

    weights = {
        "documentation": 0.15,
        "architecture": 0.25,
        "maintenance": 0.20,
        "testing": 0.15,
        "security": 0.25,
    }

    components = [
        (doc.score if doc else None, "documentation"),
        (arch.score if arch else None, "architecture"),
        (maint.score if maint else None, "maintenance"),
        (test.score if test else None, "testing"),
        (sec.score if sec else None, "security"),
    ]

    valid = [(score, weights[dim]) for score, dim in components if score is not None]
    if valid:
        total_weight = sum(w for _, w in valid)
        weighted_sum = sum(s * w for s, w in valid)
        overall_score = round(weighted_sum / total_weight)
    else:
        overall_score = 0

    if overall_score >= 70:
        overall_severity = Severity.GOOD
    elif overall_score >= 40:
        overall_severity = Severity.WARNING
    else:
        overall_severity = Severity.CRITICAL

    report = RepoAuditReport(
        repo_url=state["repo_url"],
        owner=state["owner"],
        repo_name=state["repo_name"],
        documentation=doc,
        architecture=arch,
        maintenance=maint,
        testing=test,
        security=sec,
        overall_score=overall_score,
        overall_severity=overall_severity,
    )

    return {"final_report": report}


def build_graph():
    graph = StateGraph(AuditState)

    graph.add_node("fetch", fetch_repo)
    graph.add_node("documentation", audit_documentation)
    graph.add_node("architecture", audit_architecture)
    graph.add_node("maintenance", audit_maintenance)
    graph.add_node("testing", audit_testing)
    graph.add_node("security", audit_security)
    graph.add_node("aggregate", aggregate)

    graph.add_edge(START, "fetch")

    graph.add_edge("fetch", "documentation")
    graph.add_edge("fetch", "architecture")
    graph.add_edge("fetch", "maintenance")
    graph.add_edge("fetch", "testing")
    graph.add_edge("fetch", "security")

    graph.add_edge("documentation", "aggregate")
    graph.add_edge("architecture", "aggregate")
    graph.add_edge("maintenance", "aggregate")
    graph.add_edge("testing", "aggregate")
    graph.add_edge("security", "aggregate")

    graph.add_edge("aggregate", END)

    return graph.compile()


app = build_graph()


# ─────────────────────────────────────────────────────────────────────────
# Streaming API: per-node-completion events for SSE-style real-time UIs
# ─────────────────────────────────────────────────────────────────────────

_NODE_TO_STATE_KEY: dict[str, str] = {
    "documentation": "documentation_audit",
    "architecture": "architecture_audit",
    "maintenance": "maintenance_audit",
    "testing": "testing_audit",
    "security": "security_audit",
    "aggregate": "final_report",
}


def _extract_node_data(node_name: str, state_update: dict) -> Any:
    """Map an astream event's state_update to the payload we emit for each node."""
    if node_name == "fetch":
        if "fetch_error" in state_update:
            return {"error": state_update["fetch_error"]}
        return {
            "owner": state_update.get("owner"),
            "repo_name": state_update.get("repo_name"),
        }

    key = _NODE_TO_STATE_KEY.get(node_name)
    if key is not None:
        return state_update.get(key)

    return state_update


async def audit_repo_streaming(repo_url: str) -> AsyncGenerator[dict, None]:
    """
    Stream per-node-completion events as the audit graph runs.

    Yields dicts of shape::

        {"type": "node_complete",
         "node": "fetch" | "documentation" | "architecture" | "maintenance"
                 | "testing" | "security" | "aggregate",
         "data": <payload>}

    Payloads:
      - fetch:       {"owner": str, "repo_name": str} or {"error": str}
      - audit nodes: the corresponding Pydantic model (DocumentationAudit, …)
      - aggregate:   the full RepoAuditReport
    """
    initial_state: AuditState = {"repo_url": repo_url}

    async for event in app.astream(initial_state):
        # astream (default mode="updates") yields {node_name: state_update}
        for node_name, state_update in event.items():
            yield {
                "type": "node_complete",
                "node": node_name,
                "data": _extract_node_data(node_name, state_update),
            }


# ─────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args:
        print("Usage:")
        print("  python -m agent.graph <github_url>           # sync audit")
        print("  python -m agent.graph --viz                  # print mermaid graph")
        print("  python -m agent.graph --stream [github_url]  # streaming audit (debug)")
        sys.exit(1)

    if args[0] in ("--viz", "--graph"):
        print("Mermaid graph (paste into https://mermaid.live):")
        print()
        print(app.get_graph().draw_mermaid())
        sys.exit(0)

    if args[0] == "--stream":
        import asyncio
        import time

        stream_url = args[1] if len(args) > 1 else "https://github.com/fastapi/fastapi"
        start = time.time()
        print(f"Streaming audit of {stream_url}")
        print()

        async def _run_stream() -> None:
            async for event in audit_repo_streaming(stream_url):
                elapsed = time.time() - start
                data = event.get("data")

                if hasattr(data, "score") and hasattr(data, "severity"):
                    summary = f"score={data.score:>3} severity={data.severity.value}"
                elif hasattr(data, "overall_score") and hasattr(data, "overall_severity"):
                    summary = (
                        f"overall={data.overall_score}/100 "
                        f"[{data.overall_severity.value}]"
                    )
                elif isinstance(data, dict):
                    if "error" in data:
                        summary = f"error: {data['error']}"
                    else:
                        summary = " ".join(f"{k}={v}" for k, v in data.items() if v is not None)
                else:
                    summary = "(no data)"

                print(
                    f"[+{elapsed:6.2f}s] {event['type']:14s} | "
                    f"{event['node']:14s} | {summary}"
                )

        asyncio.run(_run_stream())
        sys.exit(0)

    if len(args) != 1:
        print("Usage: python -m agent.graph <github_url>")
        sys.exit(1)

    result = app.invoke({"repo_url": args[0]})

    report = result.get("final_report")
    if report is None:
        print("❌ No report generated.")
        sys.exit(1)

    print()
    print("=" * 70)
    print(f"📦 Repolens Audit: {report.owner}/{report.repo_name}")
    print("=" * 70)
    print(
        f"\n🎯 Overall Score: {report.overall_score}/100 "
        f"[{report.overall_severity.value.upper()}]\n"
    )

    for dim_name, audit in [
        ("Documentation", report.documentation),
        ("Architecture", report.architecture),
        ("Maintenance", report.maintenance),
        ("Testing", report.testing),
        ("Security", report.security),
    ]:
        if audit is None:
            print(f"  ⚠️  {dim_name:14} — (skipped or failed)")
        else:
            if audit.severity == Severity.GOOD:
                icon = "✅"
            elif audit.severity == Severity.WARNING:
                icon = "⚠️ "
            else:
                icon = "🔴"
            print(
                f"  {icon} {dim_name:14} {audit.score:3}/100  "
                f"[{audit.severity.value}]  {audit.summary[:80]}"
            )

    print()
    print("=" * 70)
    print("Full JSON report:")
    print("=" * 70)
    print(report.model_dump_json(indent=2))
