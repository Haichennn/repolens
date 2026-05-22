from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from github import Github
from github.GithubException import GithubException
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from agent.schemas import MaintenanceAudit, Severity
from agent.utils.repo_inspector import fetch_maintenance_metrics, parse_repo_url

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


SYSTEM_PROMPT = (
    "You are Repolens, an expert repository auditor evaluating maintenance "
    "health and project sustainability. You assess whether a repository is "
    "actively maintained, has a healthy contributor base, and is responsive "
    "to issues. Apply the rigor of a senior engineer doing due diligence "
    "before adopting a dependency. Use popularity metrics (stars/forks) only "
    "as CONTEXT to calibrate what's normal — do NOT let high stars inflate a "
    "maintenance score if activity is actually low."
)

HUMAN_PROMPT = """Audit the maintenance health of repository {owner}/{repo_name}.

Evaluate ONLY these criteria for scoring:
1. Activity recency (last commit, is the project alive?)
2. Commit cadence (sustained vs sporadic vs dormant)
3. Contributor health and bus factor
4. Issue responsiveness signal (relative to project size)
5. Release discipline (tagged releases in past year)

Score from 0-100:
- 90-100: Vibrant, multi-contributor, recent releases, low bus-factor
- 70-89: Healthy and active, minor concerns
- 50-69: Adequate but signs of slowing
- 30-49: Stagnating, possibly abandoned
- 0-29: Effectively abandoned or critically unhealthy

Map score to severity: 70-100 → good, 40-69 → warning, 0-39 → critical.

Use popularity metrics (stars/forks/watchers) as CONTEXT to calibrate expectations:
- A small/personal project with low star count + healthy commits = good maintenance, do NOT penalize for low popularity
- A massive popular project with 1000+ open issues may still be well-maintained if response rates are reasonable
- DO note in findings whether activity matches the apparent popularity (e.g. high stars but dormant = critical concern)

Provide 4-6 specific findings citing the actual numbers. Provide 2-4 prioritized recommendations.

---
Maintenance metrics:
- Days since last commit: {days_since_last_commit}
- Last commit message: {last_commit_message}
- Commits in past 90 days: {commits_last_90_days}
- Total contributors (top 30 sampled): {total_contributors}
- Top contributor's share of contributions: {top_contributor_share_pct}%
- Open issues: {open_issues_count}
- Recent releases: {recent_releases_summary}
- Release in past 12 months: {has_recent_releases}

Popularity context (do not factor into score, only use to calibrate):
- Stars: {stars}
- Forks: {forks}
- Watchers (active subscribers): {watchers}
---"""


def _format_top_contributor_share(share: float | None) -> str:
    if share is None:
        return "n/a"
    return f"{share * 100:.1f}"


def _format_recent_releases(releases: list[dict[str, Any]]) -> str:
    if not releases:
        return "(none)"
    parts = []
    for release in releases:
        tag = release.get("tag_name") or "(no tag)"
        iso = release.get("published_at_iso")
        date_str = iso[:10] if isinstance(iso, str) and len(iso) >= 10 else "unknown"
        parts.append(f"{tag} ({date_str})")
    return ", ".join(parts)


def _format_days_since(days: int | None) -> str:
    return "n/a" if days is None else str(days)


def _resolve_owner_repo(state: dict) -> tuple[str, str]:
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    if owner and repo_name:
        return owner, repo_name
    return parse_repo_url(state["repo_url"])


def audit_maintenance(state: dict) -> dict:
    try:
        owner, repo_name = _resolve_owner_repo(state)
    except ValueError as exc:
        return {
            "maintenance_audit": MaintenanceAudit(
                dimension="maintenance",
                score=0,
                severity=Severity.CRITICAL,
                summary=f"Could not access repo: {exc}",
                findings=[f"Invalid repository URL: {exc}"],
                recommendations=[
                    "Provide a valid GitHub URL in the form "
                    "https://github.com/{owner}/{repo}."
                ],
            )
        }

    token = os.getenv("GITHUB_TOKEN")
    gh = Github(token) if token else Github()

    try:
        repo = gh.get_repo(f"{owner}/{repo_name}")
    except GithubException as exc:
        message = (
            exc.data.get("message", str(exc))
            if hasattr(exc, "data") and isinstance(exc.data, dict)
            else str(exc)
        )
        return {
            "maintenance_audit": MaintenanceAudit(
                dimension="maintenance",
                score=0,
                severity=Severity.CRITICAL,
                summary=f"Could not access repo: {message}",
                findings=[f"GitHub API error while opening {owner}/{repo_name}: {message}"],
                recommendations=[
                    "Verify the repository URL is correct and publicly accessible, "
                    "or provide a GITHUB_TOKEN with appropriate scope."
                ],
            )
        }

    metrics = fetch_maintenance_metrics(repo)

    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    structured_llm = llm.with_structured_output(MaintenanceAudit)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", HUMAN_PROMPT),
        ]
    )

    chain = prompt | structured_llm
    result: MaintenanceAudit = chain.invoke(
        {
            "owner": owner,
            "repo_name": repo_name,
            "days_since_last_commit": _format_days_since(metrics["days_since_last_commit"]),
            "last_commit_message": metrics["last_commit_message"] or "(unknown)",
            "commits_last_90_days": metrics["commits_last_90_days"],
            "total_contributors": metrics["total_contributors"],
            "top_contributor_share_pct": _format_top_contributor_share(
                metrics["top_contributor_share"]
            ),
            "open_issues_count": metrics["open_issues_count"],
            "recent_releases_summary": _format_recent_releases(metrics["recent_releases"]),
            "has_recent_releases": metrics["has_recent_releases"],
            "stars": metrics["stars"],
            "forks": metrics["forks"],
            "watchers": metrics["watchers"],
        }
    )

    result = result.model_copy(
        update={
            "dimension": "maintenance",
            "days_since_last_commit": metrics["days_since_last_commit"],
            "commits_last_90_days": metrics["commits_last_90_days"],
            "top_contributor_share": metrics["top_contributor_share"],
            "total_contributors": metrics["total_contributors"],
            "open_issues_count": metrics["open_issues_count"],
            "has_recent_releases": metrics["has_recent_releases"],
            "stars": metrics["stars"],
            "forks": metrics["forks"],
            "watchers": metrics["watchers"],
        }
    )

    return {"maintenance_audit": result}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.nodes.maintenance <github_repo_url>")
        sys.exit(1)

    output = audit_maintenance({"repo_url": sys.argv[1]})
    audit: MaintenanceAudit = output["maintenance_audit"]
    print(audit.model_dump_json(indent=2))
