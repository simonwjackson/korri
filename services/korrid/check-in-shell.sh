#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash curl coreutils
# THROWAWAY PROTOTYPE implementation; invoked by run-spike.sh in its devshell.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CRATE="$ROOT/services/korrid"
GENERATED_TS="$ROOT/contracts/generated/korrid.ts"
ANDROID_LIBS="$ROOT/clients/android/app/src/main/jniLibs"

cd "$CRATE"
cargo fmt --check
cargo check
cargo test
typeshare . --lang=typescript --output-file="$GENERATED_TS"
# Typeshare 1.13 emits trailing spaces and an extra final blank line.
sed -i -e 's/[[:space:]]\+$//' -e '${/^$/d;}' "$GENERATED_TS"

cd "$ROOT/clients/portal"
bun run typecheck

cd "$CRATE"
cargo build --release --bin korrid
export KORRID_MODE="brain"
export KORRID_RPC_CAPABILITY="check-capability"
export KORRID_ADDRESS="127.0.0.1:49117"
export KORRID_SPIKE_URL="http://$KORRID_ADDRESS"
"$CARGO_TARGET_DIR/release/korrid" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
smoke_ready=false
for _ in $(seq 1 20); do
  if curl --fail --silent "$KORRID_SPIKE_URL/rpc" \
      -H 'content-type: application/json' \
      -H "authorization: Bearer $KORRID_RPC_CAPABILITY" \
      -d '{"_tag":"system.health","payload":{}}' >/dev/null; then
    smoke_ready=true
    break
  fi
  sleep 0.25
done
if [[ "$smoke_ready" != true ]]; then
  echo "korrid smoke server did not become ready" >&2
  exit 1
fi
local_games="$(curl --fail --silent "$KORRID_SPIKE_URL/rpc" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $KORRID_RPC_CAPABILITY" \
  -d '{"_tag":"app.local-games.list","payload":{}}')"
if [[ "$local_games" != *'"id":"wl4"'* ]]; then
  echo "korrid smoke did not exercise brain-only local games" >&2
  exit 1
fi

cd "$ROOT/clients/portal"
bun src/korrid/smoke.ts

# The installed proof is the whole app, not only its hidden RPC. Use the
# canonical cross-area recipe so Gradle cannot silently package no portal.
cd "$ROOT"
just portal-bundle
test -f "$ROOT/clients/android/app/src/main/assets/portal/index.html"

cd "$CRATE"
cargo ndk -t arm64-v8a -o "$ANDROID_LIBS" build --release --lib

cd "$ROOT/clients/android"
./gradlew assembleDebug
APK="$ROOT/clients/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk"
# grep must drain the whole listing: with pipefail, `grep -q` exiting at
# the first match SIGPIPEs unzip and fails the pipeline spuriously.
unzip -l "$APK" | grep 'assets/portal/index.html' >/dev/null

printf 'Rust cdylib: '
du -h "$ANDROID_LIBS/arm64-v8a/libkorrid.so" | cut -f1
printf 'APK: '
du -h app/build/outputs/apk/debug/app-arm64-v8a-debug.apk | cut -f1

if [[ "${1:-}" == "--device" ]]; then
  "$CRATE/android-smoke.sh"
fi
