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

from agent.schemas import Severity, TestingAudit
from agent.utils.repo_inspector import fetch_testing_signals, parse_repo_url

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


SYSTEM_PROMPT = (
    "You are Repolens, an expert repository auditor evaluating testing "
    "discipline and quality assurance practices. You assess whether a "
    "project takes testing seriously, has reasonable coverage relative to "
    "its scope, and runs tests automatically in CI. Apply the rigor of a "
    "senior engineer reviewing whether a codebase is production-ready."
)

HUMAN_PROMPT = """Audit the testing discipline of repository {owner}/{repo_name}.

Evaluate across these criteria:
1. Test presence (is there a tests/ folder? are there any test files at all?)
2. Test-to-source ratio (does the test count match the project's source scope?)
3. Test framework hygiene (modern framework? configured properly?)
4. CI/CD enforcement (do tests actually run on every push? or is CI absent?)
5. Coverage transparency (does the project publicly track coverage via badge?)

Score from 0-100:
- 90-100: Comprehensive tests, CI enforced, coverage badge, multiple test types
- 70-89: Solid test discipline with minor gaps
- 50-69: Basic tests exist but coverage thin or CI missing
- 30-49: Minimal testing, mostly unverified code
- 0-29: No tests or tests-as-scaffolding-only (empty test folders, etc.)

Map score to severity: 70-100 → good, 40-69 → warning, 0-39 → critical.

Provide 4-6 specific findings citing actual numbers and file paths. Provide 2-4 prioritized recommendations.

For early-stage personal projects with few source files, do NOT penalize harshly for low test count if the source itself is small — calibrate expectations to project size. But if there are 50+ source files and 0 tests, that is a structural issue worth flagging clearly.

---
Testing signals:
- Tests folder present: {has_tests_folder}
- Test files detected: {test_file_count}
- Source files detected (excluding tests/configs/docs): {source_file_count}
- Test-to-source ratio: {test_to_source_ratio_pct}%
- Detected test frameworks: {detected_test_frameworks_str}
- CI/CD config present: {has_ci_config}
- Sample CI files: {sample_ci_files_str}
- Coverage badge in README: {has_coverage_badge}
- Sample test files: {sample_test_files_str}
---"""


def _format_ratio_pct(ratio: float | None) -> str:
    if ratio is None:
        return "n/a"
    return f"{ratio * 100:.1f}"


def _join_or(values: list[str], empty_label: str) -> str:
    return ", ".join(values) if values else empty_label


def _critical_audit(summary: str, finding: str, recommendation: str) -> TestingAudit:
    return TestingAudit(
        dimension="testing",
        score=0,
        severity=Severity.CRITICAL,
        summary=summary,
        findings=[finding],
        recommendations=[recommendation],
    )


def audit_testing(state: dict) -> dict:
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    if not (owner and repo_name):
        try:
            owner, repo_name = parse_repo_url(state["repo_url"])
        except ValueError as exc:
            return {
                "testing_audit": _critical_audit(
                    summary=f"Could not access repo: {exc}",
                    finding=f"Invalid repository URL: {exc}",
                    recommendation=(
                        "Provide a valid GitHub URL in the form "
                        "https://github.com/{owner}/{repo}."
                    ),
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
            "testing_audit": _critical_audit(
                summary=f"Could not access repo: {message}",
                finding=f"GitHub API error while opening {owner}/{repo_name}: {message}",
                recommendation=(
                    "Verify the repository URL is correct and publicly accessible, "
                    "or provide a GITHUB_TOKEN with appropriate scope."
                ),
            )
        }

    readme_text = state.get("readme_text")
    if readme_text is None:
        try:
            readme = repo.get_readme()
            readme_text = readme.decoded_content.decode("utf-8", errors="replace")
        except GithubException:
            readme_text = ""

    signals: dict[str, Any] = fetch_testing_signals(repo, readme_text)

    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    structured_llm = llm.with_structured_output(TestingAudit)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", HUMAN_PROMPT),
        ]
    )

    chain = prompt | structured_llm
    result: TestingAudit = chain.invoke(
        {
            "owner": owner,
            "repo_name": repo_name,
            "has_tests_folder": signals["has_tests_folder"],
            "test_file_count": signals["test_file_count"],
            "source_file_count": signals["source_file_count"],
            "test_to_source_ratio_pct": _format_ratio_pct(signals["test_to_source_ratio"]),
            "detected_test_frameworks_str": _join_or(
                signals["detected_test_frameworks"], "(none detected)"
            ),
            "has_ci_config": signals["has_ci_config"],
            "sample_ci_files_str": _join_or(signals["sample_ci_files"], "(none)"),
            "has_coverage_badge": signals["has_coverage_badge"],
            "sample_test_files_str": _join_or(
                signals["sample_test_files"], "(no test files found)"
            ),
        }
    )

    result = result.model_copy(
        update={
            "dimension": "testing",
            "has_tests_folder": signals["has_tests_folder"],
            "test_file_count": signals["test_file_count"],
            "source_file_count": signals["source_file_count"],
            "test_to_source_ratio": signals["test_to_source_ratio"],
            "detected_test_frameworks": signals["detected_test_frameworks"],
            "has_ci_config": signals["has_ci_config"],
            "has_coverage_badge": signals["has_coverage_badge"],
        }
    )

    return {"testing_audit": result}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.nodes.testing <github_repo_url>")
        sys.exit(1)

    output = audit_testing({"repo_url": sys.argv[1]})
    audit: TestingAudit = output["testing_audit"]
    print(audit.model_dump_json(indent=2))
