#!/usr/bin/env bash
#
# Boots the Feature Map Explorer dev tool: Vite SPA + Hono dev API.
#
# Two-process design (the simpler of the options listed in the plan): the
# Hono API runs on FEATURE_MAP_API_PORT, the Vite SPA runs on
# FEATURE_MAP_PORT and proxies /api/* to the API. Both bind to all
# interfaces by default so the tool is reachable from any host or IP on
# the local network. Set FEATURE_MAP_HOST and FEATURE_MAP_API_HOST to
# restrict (e.g. to 127.0.0.1).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

PORT="${FEATURE_MAP_PORT:-4317}"
API_PORT="${FEATURE_MAP_API_PORT:-4318}"
VITE_HOST="${FEATURE_MAP_HOST:-0.0.0.0}"
API_HOST="${FEATURE_MAP_API_HOST:-0.0.0.0}"

cleanup() {
	# Kill every process in this group; ignore errors when children are
	# already gone.
	kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
	cd "${REPO_ROOT}"
	PORT="${API_PORT}" HOST="${API_HOST}" \
		bun run tools/feature-map-explorer/server/server.ts
) &

(
	cd "${REPO_ROOT}"
	KORRI_FEATURE_MAP_API_PROXY="http://localhost:${API_PORT}" \
		bun run vite \
		--config tools/feature-map-explorer/vite.config.mjs \
		--port "${PORT}" \
		--host "${VITE_HOST}" \
		--clearScreen false
) &

wait
