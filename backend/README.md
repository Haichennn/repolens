# Repolens Backend

Backend service for Repolens — orchestrates the multi-agent audit pipeline and exposes a FastAPI interface.

## Stack

- **LangChain / LangGraph** — agent orchestration
- **MCP** — tool server for GitHub repo access
- **FastAPI** — HTTP API
- **Anthropic Claude** — LLM backbone

## Layout

```
backend/
├── agent/         # LangGraph orchestration + audit sub-agents
│   ├── graph.py
│   └── nodes/     # 5 audit dimensions (architecture, security, docs, maintenance, testing)
├── mcp_server/    # MCP server for repo tools
├── api/           # FastAPI app
│   └── main.py
└── tests/
```

## Local setup

```bash
pip install -r requirements.txt
cp .env.example .env  # then fill in your keys
uvicorn api.main:app --reload
```

Health check: `GET http://localhost:8000/health`
