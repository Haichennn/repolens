# Repolens Roadmap

## V1 (current sprint — May 22 to June 5, 2026)
Single-repo audit across 5 dimensions, delivered as an interactive dashboard.

- [x] Day 1: Scaffold + LangChain hello-world agent
- [x] Day 2: First LangGraph workflow (state, nodes, edges)
- [x] Day 3: Pydantic schemas + Documentation audit
- [x] Day 4 (part 1): Architecture audit + repo_inspector utility
- [ ] Day 4 (part 2-4): Maintenance, Testing audits
- [ ] Day 5: MCP server (CVE + package registry) + Security audit
- [ ] Day 6: LangGraph orchestration (5 parallel sub-agents + conditional flow)
- [ ] Day 7: Backend deployed (Railway)
- [ ] Day 8-10: Next.js frontend with drill-down dashboard
- [ ] Day 11-12: Polish + production-ready deploy
- [ ] Day 13: Case study + showcase PDF
- [ ] Day 14: Final demo + portfolio integration

## V2 (post-launch, July 2026+)

The audit pattern in V1 evaluates **one repo against absolute criteria**. V2 evolves it into **decision-support for selecting between alternatives** — the actual pain engineers face when picking dependencies.

- [ ] **Comparative ranking** — given a category or seed repo, find and rank similar alternatives
  - Use case: "Find alternatives to LangChain" → ranked comparison matrix
  - Surfaces: popularity (stars, forks), maintenance health, community signals, technical fit
  - Auto-discover candidates via GitHub topics + similar-repo heuristics

- [ ] **Beginner-friendliness audit** — separate dimension evaluating learnability for newcomers
  - Signals: quickstart presence, examples folder, "good first issue" count, community channels, error message quality, type hint coverage, tutorial links

- [ ] **API design audit** — evaluate API surface quality
  - Routing pattern detection (REST vs GraphQL vs RPC, versioning strategy)
  - Public API surface summary (endpoints, key methods, learning curve)
  - Internal architecture signals (error handling consistency, auth mechanism, rate limiting)

- [ ] **Audit history per repo** — track score evolution over time, surface regressions
- [ ] **Custom audit dimensions** — user-defined rubrics for domain-specific evaluation
- [ ] **CI integration** — webhook-based audit-on-PR

## V3 (vision)

Repolens becomes a **dependency due-diligence platform**: paste a `package.json` or `requirements.txt`, get an audit of every dependency's health, security, and trajectory. The single-repo audit and comparative ranking become primitives composed into higher-level decision workflows.
