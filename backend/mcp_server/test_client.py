"""
Manual test harness for the Repolens MCP server.

Spawns mcp_server.server as a subprocess via stdio, connects with the
official MCP Python SDK client, and exercises both tools end-to-end.

Run from backend/:
  python -m mcp_server.test_client
"""

from __future__ import annotations

import asyncio
import json

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def main() -> None:
    server_params = StdioServerParameters(
        command="python",
        args=["-m", "mcp_server.server"],
        env=None,
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            print("=" * 60)
            print("TEST 1: List available tools")
            print("=" * 60)
            tools_response = await session.list_tools()
            for tool in tools_response.tools:
                print(f"  - {tool.name}: {tool.description[:80]}...")

            print()
            print("=" * 60)
            print("TEST 2: lookup_cves('lodash')")
            print("=" * 60)
            result = await session.call_tool("lookup_cves", {"package_name": "lodash"})
            for content in result.content:
                if hasattr(content, "text"):
                    data = json.loads(content.text)
                    print(f"Found {len(data)} CVE(s):")
                    for cve in data:
                        print(f"  - {cve['cve_id']} [{cve['severity']}] {cve['description']}")

            print()
            print("=" * 60)
            print("TEST 3: lookup_cves('fastapi') — should be empty")
            print("=" * 60)
            result = await session.call_tool("lookup_cves", {"package_name": "fastapi"})
            for content in result.content:
                if hasattr(content, "text"):
                    data = json.loads(content.text)
                    status = "OK, no known CVEs" if len(data) == 0 else "unexpected"
                    print(f"Found {len(data)} CVE(s) — {status}")

            print()
            print("=" * 60)
            print("TEST 4: lookup_package('react')")
            print("=" * 60)
            result = await session.call_tool("lookup_package", {"package_name": "react"})
            for content in result.content:
                if hasattr(content, "text"):
                    data = json.loads(content.text)
                    print(json.dumps(data, indent=2))

            print()
            print("=" * 60)
            print("TEST 5: lookup_package('request') — deprecated package")
            print("=" * 60)
            result = await session.call_tool("lookup_package", {"package_name": "request"})
            for content in result.content:
                if hasattr(content, "text"):
                    data = json.loads(content.text)
                    deprecated = data.get("deprecated", False) if data else None
                    last_publish = data.get("last_publish") if data else "n/a"
                    weekly = data.get("weekly_downloads") if data else "n/a"
                    print(f"  Deprecated: {deprecated}")
                    print(f"  Last publish: {last_publish}")
                    print(f"  Weekly downloads (despite deprecation): {weekly}")

            print()
            print("=" * 60)
            print("TEST 6: lookup_package('nonexistent_xyz123') — should return null")
            print("=" * 60)
            result = await session.call_tool(
                "lookup_package", {"package_name": "nonexistent_xyz123"}
            )
            for content in result.content:
                if hasattr(content, "text"):
                    data = json.loads(content.text)
                    print(f"  Result: {data}")

            print()
            print("=" * 60)
            print("✅ All tests completed")
            print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
