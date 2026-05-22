#!/bin/bash
# Launcher script for the Repolens MCP server.
# Useful when an MCP client (like MCP Inspector) needs to spawn the server
# from an absolute path with the venv activated.
# Not used in production (the Security audit node spawns the MCP server
# directly via Python's subprocess + venv-aware Python interpreter).
cd "$(dirname "$0")"
source ../venv/bin/activate
exec python -m mcp_server.server
