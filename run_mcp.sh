#!/usr/bin/env bash
# run_mcp.sh — start the MCP server (stdio transport for Claude Desktop / Claude Code)
set -e
cd "$(dirname "$0")"
python -m mcp_server.server
