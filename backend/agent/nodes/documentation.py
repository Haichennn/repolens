from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from agent.schemas import DocumentationAudit, Severity

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


SYSTEM_PROMPT = (
    "You are Repolens, an expert repository auditor. You evaluate the "
    "documentation quality of GitHub repositories with the rigor of a senior "
    "engineer reviewing an unfamiliar codebase for the first time. Be "
    "specific, evidence-based, and actionable."
)

HUMAN_PROMPT = """Audit the documentation quality of repository {owner}/{repo_name}.

You have access to the README content below. Evaluate it across these criteria:
1. README completeness (project description, setup, usage, license, contributing)
2. Clarity and structure (headings, examples, code blocks)
3. Tone and audience-fit (does a new contributor understand the project quickly?)
4. Presence of additional docs hints (mentions of /docs, CONTRIBUTING.md, API reference, etc.)

Score from 0-100 where:
- 90-100: Exceptional, complete, well-structured
- 70-89: Good, minor gaps
- 50-69: Adequate but several gaps
- 30-49: Poor, missing important sections
- 0-29: Critically incomplete

Map score to severity:
- 70-100 → good
- 40-69 → warning
- 0-39 → critical

Provide 3-6 specific findings (mix positive and negative) citing concrete elements from the README. Provide 2-4 prioritized recommendations.

README content:
---
{readme_text}
---"""


def audit_documentation(state: dict) -> dict:
    readme_text = state.get("readme_text") or ""

    if not readme_text.strip():
        return {
            "documentation_audit": DocumentationAudit(
                dimension="documentation",
                score=0,
                severity=Severity.CRITICAL,
                summary="No README found.",
                findings=["Repository has no README file."],
                recommendations=[
                    "Add a README with project description, setup instructions, and usage examples."
                ],
            )
        }

    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    structured_llm = llm.with_structured_output(DocumentationAudit)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("human", HUMAN_PROMPT),
        ]
    )

    chain = prompt | structured_llm
    result: DocumentationAudit = chain.invoke(
        {
            "owner": state["owner"],
            "repo_name": state["repo_name"],
            "readme_text": readme_text,
        }
    )

    if result.dimension != "documentation":
        result = result.model_copy(update={"dimension": "documentation"})

    return {"documentation_audit": result}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.nodes.documentation <github_repo_url>")
        sys.exit(1)

    from agent.graph import fetch_readme

    fetched = fetch_readme({"repo_url": sys.argv[1]})

    if fetched.get("error") and not fetched.get("readme_text"):
        print(f"❌ Error fetching README: {fetched['error']}")
        sys.exit(1)

    audit_input = {
        "owner": fetched["owner"],
        "repo_name": fetched["repo_name"],
        "readme_text": fetched.get("readme_text", ""),
    }

    output = audit_documentation(audit_input)
    audit: DocumentationAudit = output["documentation_audit"]
    print(audit.model_dump_json(indent=2))
