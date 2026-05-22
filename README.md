# Repolens

> Agentic AI system that audits any GitHub repository across architecture, security, documentation, maintenance, and testing dimensions.

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
