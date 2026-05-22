# Repolens Roadmap

## V1 — current sprint (May 22 to June 5, 2026)
Single-repo audit across 5 dimensions, delivered as an interactive dashboard.

- [x] Day 1: Scaffold + LangChain hello-world agent
- [x] Day 2: First LangGraph workflow
- [x] Day 3: Pydantic schemas + Documentation audit
- [x] Day 4 part 1: Architecture audit + repo_inspector
- [ ] Day 4 part 2-4: Maintenance, Testing audits
- [ ] Day 5: MCP server (CVE + package registry) + Security audit
- [ ] Day 6: LangGraph orchestration (5 parallel sub-agents)
- [ ] Day 7: Backend deployed
- [ ] Day 8-10: Next.js drill-down dashboard
- [ ] Day 11-12: Polish + production deploy
- [ ] Day 13: Case study + showcase PDF
- [ ] Day 14: Final demo + portfolio integration

---

## V2 — post-launch (planned start: August 2026)

The audit pattern in V1 evaluates **one repo against absolute criteria**. V2 evolves it into **decision-support for real engineering workflows** — the actual moments where engineers need a tool like this.

### V2 ship commitment

I commit to shipping the top 2 features below. The remaining 3 are in the backlog and will be evaluated based on user feedback from the first two.

### V2 priority backlog (ranked by engineer pain × shippability)

**1. Decision Memo Generator** (priority pick)
Generate a markdown decision document comparing 2-N repos for a specific use case. Output is paste-ready for Notion, RFCs, internal wikis.
- Input: 2-N repo URLs + decision context ("we need a RAG framework for legal docs")
- Output: comparison table + risk assessment + recommendation + open questions
- Why first: engineers hate writing decision docs; a 95%-written draft is pure value

**2. Dependency Due-Diligence** (priority pick)
Audit a single package by name (not just repo URL). Run before adding a new dependency to production.
- Input: package name + ecosystem (npm, PyPI, etc.)
- Output: full Repolens audit + license risk + transitive dependency footprint + security incident history
- Why second: extends Repolens input beyond repo URLs, opening 10× the use cases

### V2 backlog (evaluate after first two ship)

**3. Onboarding Tour Guide**
Generate a reading-order roadmap for an unfamiliar repo, including entry points, hot files, and danger zones.

**4. Comparative Ranking**
Find and rank alternatives to a seed repo, surfaced as a comparison matrix.

**5. Maintainer Culture Audit**
Evaluate social/communication health of a project for prospective contributors.

### V2 cross-cutting improvements (always-on, no separate ship)

- Beginner-friendliness signals folded into the Documentation audit
- API design signals folded into the Architecture audit

---

## V3 — vision

Repolens becomes a **dependency due-diligence platform**: paste a `package.json` or `requirements.txt`, get an audit of every dependency's health, security, and trajectory. The single-repo audit and comparative ranking become primitives composed into higher-level decision workflows.

---

## V3 Vision (post-V2 ship)

**Local repo audit (pre-push)**
Currently Repolens audits public GitHub URLs. But users often need to audit a repo BEFORE pushing — for example, doing a final quality check before submitting code to a manager or mentor. The workflow is: select a local folder or upload a zip, Repolens runs the same 5-dimensional audit on local files, returns a structured report. Requires file upload UI, local file system traversal in the backend, and bypassing the GitHub API path. This is the natural next infrastructure step — bringing Repolens into the pre-commit / pre-PR workflow.

**Audit history + score trajectory**
Users often re-audit the same repo iteratively as they fix issues. Track audits per repo over time, render score curves, surface "improved by X points" deltas. Persistence layer (Postgres) required.

**Repolens as Claude Skill**
Package Repolens as an installable Skill so users can audit and surface findings inside their existing IDE (Cursor, Claude Code, Codex) without context switching. The web UI stays as demo and standalone tool; the Skill is the daily-driver distribution channel.
