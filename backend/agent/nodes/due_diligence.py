from __future__ import annotations

import asyncio
import os
from typing import Any, Literal

import httpx
from github import Github
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel

from agent.schemas import DependencyAssessment, DueDiligenceReport, RepoAuditReport
from agent.utils.registry_clients import (
    classify_popularity,
    fetch_npm,
    fetch_pypi,
    is_commercial_compatible,
)
from agent.utils.repo_inspector import fetch_dependencies, parse_repo_url


async def _assess_one(
    name: str,
    version: str | None,
    ecosystem: Literal["pypi", "npm"],
    client: httpx.AsyncClient,
) -> dict[str, Any]:
    """Fetch all signals for a single package."""
    if ecosystem == "pypi":
        data = await fetch_pypi(name, client)
    else:
        data = await fetch_npm(name, client)

    return {
        "package_name": name,
        "ecosystem": ecosystem,
        "declared_version": version,
        "monthly_downloads": data.get("monthly_downloads"),
        "popularity_tier": classify_popularity(data.get("monthly_downloads"), ecosystem),
        "license": data.get("license"),
        "license_compatible_commercial": is_commercial_compatible(data.get("license")),
        "last_release_date": data.get("last_release_date"),
        "days_since_last_release": data.get("days_since_last_release"),
        "summary": data.get("summary"),
    }


_LLM_PROMPT = """You are evaluating dependencies for supply-chain risk in a serious software audit.

For each dependency below, assess:
1. risk_level: "low" (popular, actively maintained, permissive license), "medium" (one concern), "high" (multiple concerns), "critical" (abandoned, dangerous license, or community-replaced)
2. risk_factors: 1-3 short bullets explaining the assessment. Cite specific metrics.
3. alternative_packages: ONLY if risk_level is "high" or "critical", suggest 1-3 alternative package names that solve the same problem within the same ecosystem
4. alternative_reasoning: ONE sentence explaining why those alternatives are better, if applicable

DEPENDENCIES:

{deps_block}

Return assessments in the SAME ORDER as input dependencies. Cite specific numbers (downloads, days since release). Be terse — no generic PM-speak."""


class _AssessmentsList(BaseModel):
    items: list[DependencyAssessment]


async def assess_dependencies(report: RepoAuditReport) -> DueDiligenceReport:
    """Run due diligence on all dependencies of a repo audit."""

    github_token = os.getenv("GITHUB_TOKEN")
    gh = Github(github_token) if github_token else Github()

    owner, repo_name = parse_repo_url(report.repo_url)
    repo = gh.get_repo(f"{owner}/{repo_name}")

    # fetch_dependencies returns {dependencies: [{name, version, ecosystem, dev}, ...], ...}
    deps_info = fetch_dependencies(repo)
    deps_raw = deps_info["dependencies"]
    deps: list[tuple[str, str, str]] = [
        (d["name"], d["version"], d["ecosystem"]) for d in deps_raw
    ]

    if not deps:
        return DueDiligenceReport(
            repo_url=report.repo_url,
            total_dependencies=0,
            dependencies=[],
            overall_risk_level="low",
            overall_summary="No dependencies declared in supported manifests (requirements.txt, pyproject.toml, package.json).",
        )

    py_count = sum(1 for d in deps if d[2] == "pypi")
    node_count = sum(1 for d in deps if d[2] == "npm")

    # Fetch metadata for all deps in parallel
    async with httpx.AsyncClient() as client:
        tasks = [
            _assess_one(name, version, ecosystem, client)
            for name, version, ecosystem in deps
        ]
        raw_assessments = await asyncio.gather(*tasks)

    # Build prompt block
    deps_block = "\n".join(
        f"- [{a['ecosystem']}] {a['package_name']} v{a['declared_version'] or 'unpinned'} | "
        f"downloads: {a['monthly_downloads'] or '?'}/mo | "
        f"license: {a['license'] or '?'} | "
        f"last release: {a['days_since_last_release'] if a['days_since_last_release'] is not None else '?'} days ago | "
        f"{a.get('summary') or 'no description'}"
        for a in raw_assessments
    )

    llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        temperature=0.3,
        max_tokens=8000,
    )
    structured_llm = llm.with_structured_output(_AssessmentsList)
    response = structured_llm.invoke(_LLM_PROMPT.format(deps_block=deps_block))

    # Merge LLM judgments with our deterministic data — LLM owns risk_level,
    # risk_factors, alternatives; everything else comes from registry APIs.
    final_assessments: list[DependencyAssessment] = []
    for raw, llm_a in zip(raw_assessments, response.items):
        merged = DependencyAssessment(
            package_name=raw["package_name"],
            ecosystem=raw["ecosystem"],
            declared_version=raw["declared_version"],
            last_release_date=raw["last_release_date"],
            days_since_last_release=raw["days_since_last_release"],
            monthly_downloads=raw["monthly_downloads"],
            popularity_tier=raw["popularity_tier"],
            license=raw["license"],
            license_compatible_commercial=raw["license_compatible_commercial"],
            risk_level=llm_a.risk_level,
            risk_factors=llm_a.risk_factors,
            alternative_packages=llm_a.alternative_packages,
            alternative_reasoning=llm_a.alternative_reasoning,
        )
        final_assessments.append(merged)

    # Aggregate
    high = sum(1 for a in final_assessments if a.risk_level == "high")
    critical = sum(1 for a in final_assessments if a.risk_level == "critical")
    medium = sum(1 for a in final_assessments if a.risk_level == "medium")

    abandoned = [
        a.package_name
        for a in final_assessments
        if a.days_since_last_release and a.days_since_last_release > 365
    ]
    blockers = [
        a.package_name
        for a in final_assessments
        if a.license_compatible_commercial is False
    ]

    if critical > 0:
        overall_risk: Literal["low", "medium", "high", "critical"] = "critical"
    elif high >= 2 or len(blockers) > 0:
        overall_risk = "high"
    elif high == 1 or medium >= 3:
        overall_risk = "medium"
    else:
        overall_risk = "low"

    summary_prompt = f"""Write a 2-3 sentence executive summary of supply-chain health:
- Total {len(deps)} dependencies ({py_count} Python + {node_count} Node)
- {high + critical} high/critical risk
- {medium} medium risk
- {len(abandoned)} potentially abandoned: {', '.join(abandoned[:5]) if abandoned else 'none'}
- {len(blockers)} commercial blockers: {', '.join(blockers) if blockers else 'none'}
- Overall: {overall_risk}

Cite numbers. ~50 words."""

    summary_llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        temperature=0.3,
        max_tokens=500,
    )
    summary_response = summary_llm.invoke(summary_prompt)
    summary = (
        summary_response.content
        if hasattr(summary_response, "content")
        else str(summary_response)
    )

    return DueDiligenceReport(
        repo_url=report.repo_url,
        total_dependencies=len(deps),
        python_dependencies=py_count,
        node_dependencies=node_count,
        dependencies=final_assessments,
        overall_risk_level=overall_risk,
        overall_summary=summary if isinstance(summary, str) else str(summary),
        high_risk_count=high + critical,
        medium_risk_count=medium,
        abandoned_packages=abandoned,
        commercial_blockers=blockers,
    )
