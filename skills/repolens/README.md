# Repolens Skill

A Claude Skill that lets you audit GitHub repositories from inside Cursor, Claude Code, or any Skill-aware client — no website visit needed.

## Installation

**Claude Code:**

```bash
git clone https://github.com/Haichennn/repolens
cp -r repolens/skills/repolens ~/.claude/skills/
```

**Cursor / Claude Desktop:**

See the [Anthropic Skills documentation](https://docs.claude.com/en/docs/build-with-claude/skills) for current installation steps in your client.

## Usage

After install, just talk to Claude normally:

```
You: "Audit github.com/fastapi/fastapi"
Claude: [Calls Repolens, returns structured audit]

You: "Should we adopt LangChain or LlamaIndex for our RAG project?"
Claude: [Audits both, generates comparison + decision memo]

You: "Check the supply-chain risk of github.com/django/django"
Claude: [Runs due diligence, highlights abandoned deps + commercial blockers]
```

## What this skill exposes

| Feature | Endpoint | Use case |
|---|---|---|
| Audit | `/audit` | 5-dimensional repo health check |
| Streaming audit | `/audit/stream` | Same as above, server-sent events for progressive UI |
| Decision Memo | `/memo` | Convert audit into adopt / caution / pass verdict |
| Due Diligence | `/due-diligence` | Per-dependency risk + license + alternatives |
| Comparison | (parallel `/audit` calls) | Compare multiple repos side-by-side |

## Limitations

See `SKILL.md` for current limitations.

## Why a Skill?

Repolens has a web UI (https://repolens-audit.vercel.app) and a public API. The Skill is a third channel: distribution-as-instruction. Instead of users switching contexts to the website, they invoke Repolens inside their existing IDE / editing flow.

This makes Repolens part of the user's daily-driver tools — not a separate destination.
