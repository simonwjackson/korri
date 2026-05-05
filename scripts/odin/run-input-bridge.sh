#!/usr/bin/env bash
# Backward-compatible launcher for the Korri native input endpoint.
# The implementation now lives in korri-inputd, which owns both the renderer
# WebSocket bridge and global input policy.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/run-inputd.sh"
