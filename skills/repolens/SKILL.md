---
name: repolens
description: Audit any GitHub repository for documentation, architecture, maintenance, testing, and security quality. Generates structured reports, decision memos, and dependency due diligence. Use this skill when the user wants to evaluate, compare, or understand the health of a GitHub repository before adopting, contributing, or making technical decisions.
---

# Repolens Skill

Repolens is an agentic AI repository auditor. It evaluates GitHub repositories across 5 dimensions (documentation, architecture, maintenance, testing, security) and can generate decision memos and dependency due diligence reports.

## When to use this skill

Use Repolens when the user wants to:
- Evaluate a GitHub repository's health before adopting it
- Compare multiple repos (e.g., choosing between competing libraries)
- Understand supply-chain risk for a project's dependencies
- Generate a decision memo for stakeholders about whether to adopt a repo
- Get a structured "should we use this?" assessment

Triggers in user language: "audit", "evaluate", "review", "is this repo good", "should we use", "compare these libraries", "is this safe to adopt", "check dependencies".

## API endpoints

Base URL: `https://repolens-production-61e0.up.railway.app`

### 1. Audit a single repo

```bash
curl -s "https://repolens-production-61e0.up.railway.app/audit?repo_url=https://github.com/OWNER/REPO"
```

Returns a `RepoAuditReport` JSON with:
- `overall_score` (0-100), `overall_severity` ("good" | "warning" | "critical")
- For each of 5 dimensions: `score`, `severity`, `summary`, `findings[]`, `recommendations[]`

Takes 30-70 seconds depending on repo size. For long waits, you can use the SSE endpoint instead:

```bash
curl -N "https://repolens-production-61e0.up.railway.app/audit/stream?repo_url=https://github.com/OWNER/REPO"
```

Returns server-sent events as each audit dimension completes.

### 2. Generate decision memo from an audit

```bash
curl -s -X POST "https://repolens-production-61e0.up.railway.app/memo" \
  -H "Content-Type: application/json" \
  -d @audit.json
```

Where `audit.json` is the output of /audit. Returns a `DecisionMemo` JSON:
- `verdict`: "adopt" | "adopt_with_caution" | "pass"
- `verdict_rationale`: one-sentence reasoning
- `strengths`, `concerns`, `next_steps_if_adopting`, `red_flags_to_monitor` (arrays of strings)

Takes ~10 seconds.

### 3. Dependency Due Diligence

```bash
curl -s -X POST "https://repolens-production-61e0.up.railway.app/due-diligence" \
  -H "Content-Type: application/json" \
  -d @audit.json
```

Returns a `DueDiligenceReport` with per-dependency analysis:
- `total_dependencies`, `python_dependencies`, `node_dependencies`
- `overall_risk_level`: "low" | "medium" | "high" | "critical"
- `dependencies[]` — each with `package_name`, `ecosystem` (pypi/npm), `risk_level`, `risk_factors`, `alternative_packages`, license, popularity tier, days since last release
- `abandoned_packages[]`, `commercial_blockers[]`

Takes ~45 seconds (parallel registry lookups + LLM risk assessment).

### 4. Compare multiple repos

Run /audit in parallel for each repo, then synthesize. There's no dedicated endpoint — call /audit N times concurrently:

```bash
curl -s "...?repo_url=https://github.com/owner1/repo1" > audit1.json &
curl -s "...?repo_url=https://github.com/owner2/repo2" > audit2.json &
curl -s "...?repo_url=https://github.com/owner3/repo3" > audit3.json &
wait
```

Then compare `overall_score` and per-dimension scores across the JSON outputs.

## Standard workflows

### Quick audit
User says: "audit github.com/fastapi/fastapi"
→ Call /audit, present overall score + severity, list top 2 strengths + top 2 concerns.

### Adoption decision
User says: "should we use LangChain?"
→ Call /audit, then /memo. Lead with the verdict, then memo body. If verdict is "pass" or "adopt_with_caution", emphasize the concerns and red flags.

### Supply chain review
User says: "is this safe to put in production?" or "audit the dependencies"
→ Call /audit, then /due-diligence. Highlight abandoned packages, commercial blockers, high-risk deps. Suggest alternatives where the report provides them.

### Library comparison
User says: "compare langchain, llama-index, and haystack"
→ Call /audit for each repo in parallel. Present a comparison table (overall scores + per-dimension). Identify winner per dimension and overall.

## Presentation guidelines

Keep responses scannable:
- Lead with overall_score and severity badge
- Use bullets for findings/concerns (not paragraphs)
- Cite specific scores: "Documentation (72/100): missing setup instructions"
- For comparisons, use a table or aligned columns
- If a long curl is running, tell the user it'll take ~30-70s and offer to do something else meanwhile

When integrating recommendations into the user's code: read the relevant files first, then propose specific edits. Don't just dump Repolens recommendations verbatim — translate them to actions in the user's actual codebase.

## Limitations

- Only works on public GitHub repos (requires GITHUB_TOKEN on the backend; rate-limited)
- Dependency Due Diligence supports Python (PyPI) and JavaScript/TypeScript (npm) only — Go, Rust, Java not yet supported
- Production API is hosted on Railway free tier — may have cold-start latency on first call
- For very large repos (10K+ files), the audit may not fully index everything

## Source

Web UI: https://repolens-audit.vercel.app  
GitHub: https://github.com/Haichennn/repolens  
API docs: https://repolens-production-61e0.up.railway.app/docs
