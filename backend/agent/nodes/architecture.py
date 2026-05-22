from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from agent.schemas import ArchitectureAudit, Severity
from agent.utils.repo_inspector import fetch_repo_structure

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


SYSTEM_PROMPT = (
    "You are Repolens, an expert repository auditor evaluating software "
    "architecture and code organization. Apply the rigor of a senior staff "
    "engineer reviewing an unfamiliar codebase for architectural soundness. "
    "Be specific, evidence-based, and actionable."
)

HUMAN_PROMPT = """Audit the architecture and code organization of repository {owner}/{repo_name}.

Evaluate across these criteria:
1. File and folder organization (clear separation of concerns, conventional layout for the stack)
2. Tech stack choices (frameworks, libraries — are they reasonable for the apparent goals?)
3. Configuration hygiene (presence of dependency manifests, Docker, CI/CD, env templates)
4. Modularity and structure (is the code organized into logical modules or thrown into a flat directory?)
5. Consistency (naming conventions, language choices, monorepo structure if applicable)

Score from 0-100:
- 90-100: Exceptional architecture, clear separation, professional layout
- 70-89: Good, minor improvements possible
- 50-69: Adequate but several concerns
- 30-49: Poor, structural issues affecting maintainability
- 0-29: Critically disorganized

Map score to severity: 70-100 → good, 40-69 → warning, 0-39 → critical.

Also populate:
- detected_languages: list the languages (Python, TypeScript, etc.) you see from the file tree and config files
- primary_framework: the main framework identifier (e.g. "Next.js + FastAPI", "Django monolith", "Express + React"), or null if unclear
- has_tests_folder: true if you see a tests/, __tests__/, or spec/ directory
- has_ci_config: true if you see .github/workflows/, .gitlab-ci.yml, .circleci/, or similar

Provide 4-6 specific findings (mix positive and negative) citing concrete files or folders. Provide 2-4 prioritized recommendations.

---
Repository structure:
{file_tree}

---
Detected languages (from GitHub): {languages_list}

---
Key configuration files:
{config_files_formatted}
---"""


def _format_config_files(config_files: dict[str, str]) -> str:
    if not config_files:
        return "(no recognized config files found)"
    parts = []
    for path, content in config_files.items():
        parts.append(f"### {path}\n{content}\n\n")
    return "".join(parts)


def audit_architecture(state: dict) -> dict:
    repo_structure: dict[str, Any] | None = state.get("repo_structure")
    if repo_structure is None:
        repo_structure = fetch_repo_structure(state["repo_url"])

    if "error" in repo_structure:
        return {
            "architecture_audit": ArchitectureAudit(
                dimension="architecture",
                score=0,
                severity=Severity.CRITICAL,
                summary=f"Could not access repo: {repo_structure['error']}",
                findings=[f"Repository inspection failed: {repo_structure['error']}"],
                recommendations=[
                    "Verify the repository URL is correct and publicly accessible, "
                    "or provide a GITHUB_TOKEN with appropriate scope."
                ],
            ),
            "repo_structure": repo_structure,
        }

    languages_list = ", ".join(repo_structure["languages"]) or "(none detected)"
    config_files_formatted = _format_config_files(repo_structure["config_files"])

    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    structured_llm = llm.with_structured_output(ArchitectureAudit)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", HUMAN_PROMPT),
        ]
    )

    chain = prompt | structured_llm
    result: ArchitectureAudit = chain.invoke(
        {
            "owner": repo_structure["owner"],
            "repo_name": repo_structure["repo_name"],
            "file_tree": repo_structure["file_tree"],
            "languages_list": languages_list,
            "config_files_formatted": config_files_formatted,
        }
    )

    if result.dimension != "architecture":
        result = result.model_copy(update={"dimension": "architecture"})

    return {"architecture_audit": result, "repo_structure": repo_structure}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.nodes.architecture <github_repo_url>")
        sys.exit(1)

    output = audit_architecture({"repo_url": sys.argv[1]})
    audit: ArchitectureAudit = output["architecture_audit"]
    print(audit.model_dump_json(indent=2))
