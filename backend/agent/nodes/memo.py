from __future__ import annotations

from langchain_anthropic import ChatAnthropic

from agent.schemas import DecisionMemo, RepoAuditReport

_MEMO_PROMPT = """You are a senior software engineer writing a concise decision memo for your team about whether to adopt a particular open-source repository.

You have been given a structured audit report with 5 dimensions (documentation, architecture, maintenance, testing, security). Your job is to synthesize this into a short, scannable memo that a manager can read in 30 seconds and make a decision.

REPOSITORY: {repo_url}
OVERALL SCORE: {overall_score}/100 ({overall_severity})

DIMENSION SCORES:
- Documentation: {doc_score}/100 ({doc_severity}) — {doc_summary}
- Architecture: {arch_score}/100 ({arch_severity}) — {arch_summary}
- Maintenance: {maint_score}/100 ({maint_severity}) — {maint_summary}
- Testing: {test_score}/100 ({test_severity}) — {test_summary}
- Security: {sec_score}/100 ({sec_severity}) — {sec_summary}

KEY FINDINGS ACROSS ALL DIMENSIONS:
{key_findings}

YOUR TASK:

Generate a structured DecisionMemo with:

1. verdict: One of "adopt", "adopt_with_caution", "pass"
   - "adopt" if overall_score >= 80 AND no critical-severity dimensions
   - "adopt_with_caution" if overall_score >= 55 OR has remediable concerns
   - "pass" if overall_score < 55 OR has critical security/maintenance risks

2. verdict_rationale: One sentence (~20 words) explaining the verdict.

3. strengths: 3-4 bullets, each ~15 words. Cite specific dimension scores or findings. Example: "Strong architecture (78/100) with clean monorepo separation and modern stack."

4. concerns: 3-4 bullets, each ~15 words. Cite the dimension flagging it.

5. next_steps_if_adopting: 2-3 concrete actions a team should take. Example: "Pin dependencies in your own requirements.lock before deploying."

6. red_flags_to_monitor: 2-3 things to watch over time. Example: "Maintainer activity — if commits stop for 30+ days, reassess."

Be specific. Cite numbers and dimensions. Don't write generic management-speak. Senior engineers write memos that are dense with evidence.

Total memo should be ~200 words. Be terse but evidence-rich."""


def generate_memo(report: RepoAuditReport) -> DecisionMemo:
    """Generate a decision memo from a completed audit report."""

    findings_lines = []
    for dim_name, dim in [
        ("Documentation", report.documentation),
        ("Architecture", report.architecture),
        ("Maintenance", report.maintenance),
        ("Testing", report.testing),
        ("Security", report.security),
    ]:
        if dim and dim.findings:
            top_findings = "; ".join(dim.findings[:3])
            findings_lines.append(f"[{dim_name}] {top_findings}")
    key_findings = "\n".join(findings_lines)

    llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        temperature=0.3,
        max_tokens=2000,
    )
    structured_llm = llm.with_structured_output(DecisionMemo)

    prompt = _MEMO_PROMPT.format(
        repo_url=report.repo_url,
        overall_score=report.overall_score,
        overall_severity=report.overall_severity,
        doc_score=report.documentation.score if report.documentation else "N/A",
        doc_severity=report.documentation.severity if report.documentation else "N/A",
        doc_summary=report.documentation.summary if report.documentation else "Not audited",
        arch_score=report.architecture.score if report.architecture else "N/A",
        arch_severity=report.architecture.severity if report.architecture else "N/A",
        arch_summary=report.architecture.summary if report.architecture else "Not audited",
        maint_score=report.maintenance.score if report.maintenance else "N/A",
        maint_severity=report.maintenance.severity if report.maintenance else "N/A",
        maint_summary=report.maintenance.summary if report.maintenance else "Not audited",
        test_score=report.testing.score if report.testing else "N/A",
        test_severity=report.testing.severity if report.testing else "N/A",
        test_summary=report.testing.summary if report.testing else "Not audited",
        sec_score=report.security.score if report.security else "N/A",
        sec_severity=report.security.severity if report.security else "N/A",
        sec_summary=report.security.summary if report.security else "Not audited",
        key_findings=key_findings,
    )

    memo = structured_llm.invoke(prompt)

    # Force repo_url and overall_score to match input (LLM might hallucinate these)
    memo.repo_url = report.repo_url
    memo.overall_score = report.overall_score

    return memo
