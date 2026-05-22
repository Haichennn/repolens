# Repolens

> Agentic AI system that audits any GitHub repository across architecture, security, documentation, maintenance, and testing dimensions.

## Live Demo

**Production API**: https://repolens-production-61e0.up.railway.app

Try it now:
- [`/`](https://repolens-production-61e0.up.railway.app/) — service info
- [`/health`](https://repolens-production-61e0.up.railway.app/health) — health check
- [`/status`](https://repolens-production-61e0.up.railway.app/status) — runtime configuration
- [`/audit?repo_url=https://github.com/Haichennn/repolens`](https://repolens-production-61e0.up.railway.app/audit?repo_url=https://github.com/Haichennn/repolens) — full audit of this repo (takes ~30s)
- [`/docs`](https://repolens-production-61e0.up.railway.app/docs) — interactive API documentation

Or via curl:

```bash
curl "https://repolens-production-61e0.up.railway.app/audit?repo_url=https://github.com/fastapi/fastapi"
```

## Example Audit Output

Running Repolens against its own repository (dogfooding):

```json
{
  "owner": "Haichennn",
  "repo_name": "repolens",
  "overall_score": 62,
  "overall_severity": "warning",
  "documentation": { "score": 42, "severity": "warning" },
  "architecture":  { "score": 72, "severity": "good" },
  "maintenance":   { "score": 62, "severity": "warning" },
  "testing":       { "score": 42, "severity": "warning" },
  "security":      { "score": 78, "severity": "good" }
}
```

The Security audit flagged unpinned dependencies; the Testing audit correctly identified an empty tests/ folder; the Architecture audit recognized the new Dockerfile and bumped the score. *The tool surfaces real issues in its own codebase.*

---

**Status**: 🚧 In active development (May - June 2026)

Built with LangChain, LangGraph, MCP, FastAPI, Next.js, and the Anthropic Claude API.

## Architecture

```mermaid
graph TD
    Start([User submits GitHub URL])
    fetch[fetch_repo]
    documentation[Documentation Audit]
    architecture[Architecture Audit]
    maintenance[Maintenance Audit]
    testing[Testing Audit]
    security[Security Audit]
    aggregate[Weighted Aggregation]
    End([RepoAuditReport])
    
    Start --> fetch
    fetch --> documentation
    fetch --> architecture
    fetch --> maintenance
    fetch --> testing
    fetch --> security
    documentation --> aggregate
    architecture --> aggregate
    maintenance --> aggregate
    testing --> aggregate
    security --> aggregate
    aggregate --> End
    
    classDef audit fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef io fill:#fef3c7,stroke:#d97706,color:#92400e
    class documentation,architecture,maintenance,testing,security audit
    class fetch,aggregate io
```

> Built with LangGraph (state-passing graph orchestration), LangChain (structured output via `with_structured_output`), Pydantic schemas, and a custom MCP server exposing CVE database + package registry tools to the Security audit sub-agent.

## License

MIT
