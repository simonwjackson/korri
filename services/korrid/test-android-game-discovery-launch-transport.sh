#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
DISCOVERY="$ROOT/services/korrid/android-game-discovery-check.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

cat >"$TMP/spec.pretty.json" <<'JSON'
{
  "_tag": "RetroArchLaunch",
  "payload": {
    "path": "/sdcard/korri-u9-discovery-a/U9 First.gba",
    "args": ["quoted \" value", "semi;colon", "dollar$literal", "space value"]
  }
}
JSON

{
  cat <<'SH'
#!/usr/bin/env bash
set -euo pipefail
RUN_DIR="$FAKE_RUN_DIR"
run_discovery_instrumentation() {
  : >"$FAKE_ARG_LOG"
  for argument in "$@"; do
    printf '%s\n' "$argument" >>"$FAKE_ARG_LOG"
  done
}
SH
  awk '/^launch_local_spec\(\) \{/{emit=1} emit{print} emit && /^}/{exit}' "$DISCOVERY"
  printf '%s\n' 'launch_local_spec "$(cat "$FAKE_SPEC_FILE")"'
} >"$TMP/launch-transport-wrapper"
chmod +x "$TMP/launch-transport-wrapper"

export FAKE_RUN_DIR="$TMP/run"
export FAKE_ARG_LOG="$TMP/args.log"
export FAKE_SPEC_FILE="$TMP/spec.pretty.json"
mkdir -p "$FAKE_RUN_DIR"

"$TMP/launch-transport-wrapper" >"$TMP/stdout.log" 2>"$TMP/stderr.log"

if [[ -s "$TMP/stdout.log" || -s "$TMP/stderr.log" ]]; then
  echo 'launch transport helper printed transport payload material' >&2
  exit 1
fi

mapfile -t args <"$FAKE_ARG_LOG"
if [[ "${#args[@]}" -ne 4 \
  || "${args[0]}" != 'launchLocal' \
  || "${args[1]}" != '-e' \
  || "${args[2]}" != 'launchSpecBase64' ]]; then
  echo 'launchLocal instrumentation arguments changed from the base64 extra contract' >&2
  exit 1
fi

launch_spec_base64="${args[3]}"
if [[ -z "$launch_spec_base64" || "$launch_spec_base64" == *$'\n'* || "$launch_spec_base64" == *$'\r'* ]]; then
  echo 'launch spec base64 transport was empty or wrapped' >&2
  exit 1
fi
if grep -F 'launchSpecJson' "$FAKE_ARG_LOG" >/dev/null; then
  echo 'launchLocal instrumentation used the raw launchSpecJson transport' >&2
  exit 1
fi

compact_expected="$(jq -c . "$TMP/spec.pretty.json")"
compact_actual="$(base64 -d <<<"$launch_spec_base64")"
if [[ "$compact_actual" != "$compact_expected" ]]; then
  echo 'launch spec base64 transport did not round-trip to compact JSON' >&2
  exit 1
fi
if [[ "$(cat "$FAKE_RUN_DIR/launch-spec.json")" != "$compact_expected" ]]; then
  echo 'launch spec receipt file did not store compact JSON' >&2
  exit 1
fi

printf 'Android game discovery launch transport contract passed\n'
