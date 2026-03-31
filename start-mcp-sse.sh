#!/bin/bash
# Launch Clementine's MCP server in HTTP+SSE mode for remote access.
# Designed to run on the Mac mini and be accessed over Tailscale.
#
# Usage:
#   ./start-mcp-sse.sh            # foreground
#   ./start-mcp-sse.sh --daemon   # background with log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${HOME}/.clementine/.env"
LOG_FILE="${HOME}/.clementine/logs/mcp-sse.log"

# Load env
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

export MCP_HTTP_PORT="${MCP_HTTP_PORT:-3100}"

if [ "${1:-}" = "--daemon" ]; then
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "[$(date)] Starting MCP SSE server on port ${MCP_HTTP_PORT} (daemon mode)" >> "$LOG_FILE"
  nohup node "${SCRIPT_DIR}/dist/tools/mcp-server.js" >> "$LOG_FILE" 2>&1 &
  echo "MCP SSE server started (PID $!, port ${MCP_HTTP_PORT}, log: ${LOG_FILE})"
else
  echo "Starting MCP SSE server on port ${MCP_HTTP_PORT}..."
  node "${SCRIPT_DIR}/dist/tools/mcp-server.js"
fi
