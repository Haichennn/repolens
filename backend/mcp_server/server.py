"""
Repolens MCP Server
===================

Exposes 2 tools to MCP-compatible LLMs for security auditing:
  - lookup_cves: query CVE database
  - lookup_package: query package registry metadata

Transport: stdio (the standard MCP transport for locally-spawned servers).

Quick test (from backend/):
  python -m mcp_server.server

The server will start and wait for MCP messages on stdin. To actually
exercise the tools, use an MCP client (the Security audit node will be
the production client; for manual testing use the MCP Inspector).
"""

from __future__ import annotations

import asyncio
import json

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from mcp_server.mock_data import lookup_cves, lookup_package

app = Server("repolens-mcp")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="lookup_cves",
            description=(
                "Look up known CVEs (Common Vulnerabilities and Exposures) for a software package. "
                "Returns a list of vulnerability entries with cve_id, severity (LOW/MEDIUM/HIGH/CRITICAL), "
                "CVSS score, affected versions, fixed version, and description. "
                "Returns an empty list if no known CVEs exist for the package. "
                "Use this when auditing a repository's dependencies for security issues."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "package_name": {
                        "type": "string",
                        "description": "Package name (e.g. 'lodash', 'requests', 'django')",
                    },
                    "version": {
                        "type": "string",
                        "description": "Optional version string (e.g. '4.17.10'). Currently informational only.",
                    },
                },
                "required": ["package_name"],
            },
        ),
        Tool(
            name="lookup_package",
            description=(
                "Look up package registry metadata for a software package. "
                "Returns ecosystem (npm/PyPI), latest_version, license, weekly_downloads, "
                "maintainer_count, last_publish date, and deprecated status. "
                "Returns null if the package is not in the registry. "
                "Use this to assess a dependency's health, maintenance, and licensing posture."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "package_name": {
                        "type": "string",
                        "description": "Package name (e.g. 'lodash', 'requests', 'django')",
                    }
                },
                "required": ["package_name"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "lookup_cves":
        package_name = arguments.get("package_name", "")
        version = arguments.get("version")
        if not package_name:
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"error": "package_name is required"}),
                )
            ]
        result = lookup_cves(package_name, version)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "lookup_package":
        package_name = arguments.get("package_name", "")
        if not package_name:
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"error": "package_name is required"}),
                )
            ]
        result = lookup_package(package_name)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    else:
        return [
            TextContent(
                type="text",
                text=json.dumps({"error": f"Unknown tool: {name}"}),
            )
        ]


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
