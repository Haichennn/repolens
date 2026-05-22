from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from github import Github, GithubException
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from agent.schemas import SecurityAudit, Severity
from agent.utils.repo_inspector import fetch_dependencies, parse_repo_url

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_PATH)


async def _collect_mcp_data(dependencies: list[dict]) -> dict[str, dict]:
    """
    Spawn the MCP server once, query lookup_cves + lookup_package for each
    dependency, return {dep_name: {"cves": [...], "registry": {...}}}.

    Sequential within one session is fine — the MCP server is local and fast,
    and parallelism here would add complexity without much speedup.
    """
    server_params = StdioServerParameters(
        command="python",
        args=["-m", "mcp_server.server"],
        env=None,
    )

    results: dict[str, dict] = {}

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                for dep in dependencies:
                    name = dep["name"]
                    version = dep.get("version", "")

                    lookup_name = (
                        name.split("/")[-1] if name.startswith("@") else name
                    )

                    try:
                        cve_result = await session.call_tool(
                            "lookup_cves",
                            {"package_name": lookup_name, "version": version},
                        )
                        cve_data: Any = []
                        for content in cve_result.content:
                            if hasattr(content, "text"):
                                cve_data = json.loads(content.text)
                                break
                    except Exception as exc:
                        cve_data = []
                        print(
                            f"MCP lookup_cves failed for {lookup_name}: {exc}",
                            file=sys.stderr,
                        )

                    try:
                        pkg_result = await session.call_tool(
                            "lookup_package",
                            {"package_name": lookup_name},
                        )
                        pkg_data: Any = None
                        for content in pkg_result.content:
                            if hasattr(content, "text"):
                                pkg_data = json.loads(content.text)
                                break
                    except Exception as exc:
                        pkg_data = None
                        print(
                            f"MCP lookup_package failed for {lookup_name}: {exc}",
                            file=sys.stderr,
                        )

                    results[name] = {
                        "cves": cve_data if isinstance(cve_data, list) else [],
                        "registry": pkg_data if isinstance(pkg_data, dict) else None,
                        "version": version,
                        "ecosystem": dep.get("ecosystem", "unknown"),
                        "dev": dep.get("dev", False),
                    }
    except Exception as exc:
        print(f"MCP session failed: {exc}", file=sys.stderr)

    return results


def _summarize_mcp_results(mcp_data: dict[str, dict]) -> dict[str, Any]:
    severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    vulnerable_deps: list[str] = []
    deprecated_deps: list[str] = []

    for dep_name, info in mcp_data.items():
        if info["cves"]:
            vulnerable_deps.append(dep_name)
            for cve in info["cves"]:
                sev = cve.get("severity", "").upper()
                if sev in severity_counts:
                    severity_counts[sev] += 1
        if info["registry"] and info["registry"].get("deprecated"):
            deprecated_deps.append(dep_name)

    return {
        "severity_counts": severity_counts,
        "vulnerable_deps": vulnerable_deps,
        "deprecated_deps": deprecated_deps,
    }


def _format_mcp_findings(
    mcp_data: dict[str, dict],
    dependencies: list[dict],
    max_deps_in_context: int = 50,
) -> str:
    """
    Format MCP findings as a compact text block for the LLM.
    For repos with many deps, prioritize: deps WITH CVEs first, then deprecated,
    then a sample of clean deps for context.
    """
    lines: list[str] = []
    with_cves = [(n, d) for n, d in mcp_data.items() if d["cves"]]
    deprecated = [
        (n, d)
        for n, d in mcp_data.items()
        if d["registry"]
        and d["registry"].get("deprecated")
        and not d["cves"]
    ]
    clean = [
        (n, d)
        for n, d in mcp_data.items()
        if not d["cves"]
        and not (d["registry"] and d["registry"].get("deprecated"))
    ]

    if with_cves:
        lines.append("### Dependencies with known CVEs:")
        for name, info in with_cves:
            lines.append(
                f"- {name} {info['version']} ({info['ecosystem']}, dev={info['dev']}):"
            )
            for cve in info["cves"]:
                lines.append(
                    f"    * {cve['cve_id']} [{cve['severity']}] CVSS "
                    f"{cve.get('cvss_score', 'n/a')} — {cve['description']}"
                )
                lines.append(
                    f"      affected: {cve.get('affected_versions', 'n/a')}, "
                    f"fixed in: {cve.get('fixed_in', 'n/a')}"
                )
    else:
        lines.append("### Dependencies with known CVEs: (none found)")

    lines.append("")

    if deprecated:
        lines.append("### Deprecated dependencies:")
        for name, info in deprecated:
            reg = info["registry"] or {}
            lines.append(
                f"- {name} ({info['ecosystem']}): last published "
                f"{reg.get('last_publish', 'n/a')}, still "
                f"{reg.get('weekly_downloads', 0):,} weekly downloads"
            )

    remaining = max_deps_in_context - len(with_cves) - len(deprecated)
    if remaining > 0 and clean:
        lines.append("")
        lines.append(
            f"### Clean dependencies (sample of {min(remaining, len(clean))} of {len(clean)}):"
        )
        for name, info in clean[:remaining]:
            reg = info["registry"] or {}
            license_str = (
                reg.get("license", "unknown license") if reg else "no registry data"
            )
            lines.append(
                f"- {name} {info['version']} ({info['ecosystem']}, {license_str})"
            )

    return "\n".join(lines)


def audit_security(state: dict) -> dict:
    repo_url = state["repo_url"]

    try:
        owner, repo_name = parse_repo_url(repo_url)
    except Exception as exc:
        return {
            "security_audit": SecurityAudit(
                dimension="security",
                score=0,
                severity=Severity.CRITICAL,
                summary=f"Could not parse repo URL: {exc}",
                findings=[f"URL parse error: {exc}"],
                recommendations=["Verify the GitHub URL is correct"],
            )
        }

    token = os.getenv("GITHUB_TOKEN")
    gh = Github(token) if token else Github()
    try:
        repo = gh.get_repo(f"{owner}/{repo_name}")
    except GithubException as exc:
        return {
            "security_audit": SecurityAudit(
                dimension="security",
                score=0,
                severity=Severity.CRITICAL,
                summary=f"Could not access repo: {exc}",
                findings=[f"GitHub API error: {exc}"],
                recommendations=["Verify the repository exists and is accessible"],
            )
        }

    deps_info = fetch_dependencies(repo)
    dependencies = deps_info["dependencies"]
    manifest_files = deps_info["manifest_files_found"]

    if not dependencies:
        return {
            "security_audit": SecurityAudit(
                dimension="security",
                score=70,
                severity=Severity.WARNING,
                summary="No dependency manifests detected — cannot perform a meaningful security audit.",
                findings=[
                    "No requirements.txt, pyproject.toml, or package.json found at standard locations.",
                    "Either this repository has no external dependencies, or the manifests live in non-standard paths.",
                ],
                recommendations=[
                    "If this repo has dependencies, add a standard manifest file at the repo root.",
                    "If genuinely dependency-free, document this explicitly in the README.",
                ],
                dependencies_analyzed=0,
                manifest_files_found=manifest_files,
            )
        }

    mcp_data = asyncio.run(_collect_mcp_data(dependencies))
    stats = _summarize_mcp_results(mcp_data)
    mcp_findings_text = _format_mcp_findings(mcp_data, dependencies)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are Repolens, an expert repository auditor evaluating security posture. "
                "You assess a repository's dependency hygiene, vulnerability exposure, and supply-chain risk. "
                "Apply the rigor of a senior security engineer doing pre-adoption review. Be specific, evidence-based, "
                "and actionable. Treat one HIGH or CRITICAL CVE as a serious flag; treat deprecated dependencies "
                "with high download counts as supply-chain risk worth calling out explicitly.",
            ),
            (
                "human",
                "Audit the security posture of repository {owner}/{repo_name}.\n\n"
                "Evaluate across:\n"
                "1. Known vulnerabilities in declared dependencies (CVE severity + count)\n"
                "2. Deprecated dependencies still in active use\n"
                "3. Manifest coverage (are dependencies declared at all?)\n"
                "4. License hygiene (mix of permissive and copyleft, any unusual licenses)\n\n"
                "Score 0-100:\n"
                "- 90-100: No known CVEs, no deprecated deps, all manifests present\n"
                "- 70-89: Clean overall, minor concerns (e.g. one MEDIUM CVE)\n"
                "- 50-69: One or more HIGH CVEs, or deprecated deps in production\n"
                "- 30-49: CRITICAL CVEs present, multiple HIGH CVEs, or major manifest gaps\n"
                "- 0-29: Multiple CRITICAL CVEs, abandoned dependencies, or no security hygiene\n\n"
                "Map score to severity: 70-100 → good, 40-69 → warning, 0-39 → critical.\n\n"
                "Provide 4-6 specific findings citing concrete CVE IDs, severities, and dependency names. "
                "Provide 2-4 prioritized recommendations (e.g. specific version bumps).\n\n"
                "---\n"
                "Manifest files found: {manifest_files}\n"
                "Total dependencies analyzed: {total_deps}\n"
                "Dependencies with CVEs: {vulnerable_count}\n"
                "CVE severity counts: CRITICAL={critical}, HIGH={high}, MEDIUM={medium}, LOW={low}\n"
                "Deprecated dependencies: {deprecated_list}\n\n"
                "{mcp_findings}\n"
                "---",
            ),
        ]
    )

    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    structured_llm = llm.with_structured_output(SecurityAudit)
    chain = prompt | structured_llm

    result: SecurityAudit = chain.invoke(
        {
            "owner": owner,
            "repo_name": repo_name,
            "manifest_files": ", ".join(manifest_files) if manifest_files else "(none)",
            "total_deps": len(dependencies),
            "vulnerable_count": len(stats["vulnerable_deps"]),
            "critical": stats["severity_counts"]["CRITICAL"],
            "high": stats["severity_counts"]["HIGH"],
            "medium": stats["severity_counts"]["MEDIUM"],
            "low": stats["severity_counts"]["LOW"],
            "deprecated_list": ", ".join(stats["deprecated_deps"])
            if stats["deprecated_deps"]
            else "(none)",
            "mcp_findings": mcp_findings_text,
        }
    )

    result.dimension = "security"
    result.dependencies_analyzed = len(dependencies)
    result.vulnerable_dependencies = len(stats["vulnerable_deps"])
    result.critical_cve_count = stats["severity_counts"]["CRITICAL"]
    result.high_cve_count = stats["severity_counts"]["HIGH"]
    result.medium_cve_count = stats["severity_counts"]["MEDIUM"]
    result.deprecated_dependencies = stats["deprecated_deps"]
    result.manifest_files_found = manifest_files

    return {"security_audit": result}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m agent.nodes.security <github_url>")
        sys.exit(1)
    result = audit_security({"repo_url": sys.argv[1]})
    print(result["security_audit"].model_dump_json(indent=2))
