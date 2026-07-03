#!/usr/bin/env nix-shell
#!nix-shell -i bash -p nodejs_22 jq
# Run the generate-design-takes workflow under Node 22, reusing the local Pi
# ChatGPT/Codex login for the openai-codex provider. Reads one JSON input
# argument, forwards the workflow's stdout (the result JSON) unchanged, and
# sends Flue's run events to stderr.
#
# Usage: run-workflow.sh '<input-json>'
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

input="${1:-}"
if [ -z "$input" ]; then
  echo "run-workflow.sh: missing input JSON argument" >&2
  exit 2
fi

# Pull the current Codex OAuth access token from the Pi credential file. This is
# a bearer token; keep it out of argv and logs.
auth_file="${PI_AUTH_JSON:-$HOME/.pi/agent/auth.json}"
if [ -f "$auth_file" ]; then
  OPENAI_CODEX_TOKEN="$(jq -r '.["openai-codex"].access // empty' "$auth_file")"
  export OPENAI_CODEX_TOKEN
fi

export LAB_AI_MODEL="${LAB_AI_MODEL:-openai-codex/gpt-5.5}"
workflow="${LAB_WORKFLOW:-generate-design-takes}"

exec npx flue run "$workflow" --input "$input"
