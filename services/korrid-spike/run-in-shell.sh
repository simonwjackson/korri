#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash curl coreutils
# THROWAWAY PROTOTYPE implementation; invoked by run-spike.sh in its devshell.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CRATE="$ROOT/services/korrid-spike"
GENERATED_TS="$ROOT/contracts/generated/korrid-spike.ts"
ANDROID_LIBS="$ROOT/clients/android/app/src/main/jniLibs"

cd "$CRATE"
cargo fmt --check
cargo check
typeshare . --lang=typescript --output-file="$GENERATED_TS"
# Typeshare 1.13 emits trailing spaces and an extra final blank line.
sed -i -e 's/[[:space:]]\+$//' -e '${/^$/d;}' "$GENERATED_TS"

cd "$ROOT/clients/portal"
bun run typecheck

cd "$CRATE"
cargo build --release --bin korrid-spike
"$CARGO_TARGET_DIR/release/korrid-spike" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:43117/rpc \
      -H 'content-type: application/json' \
      -d '{"_tag":"system.health","payload":{}}' >/dev/null; then
    break
  fi
  sleep 0.25
done

cd "$ROOT/clients/portal"
bun src/spike/rust-korrid-client.ts

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
unzip -l "$APK" | grep -q 'assets/portal/index.html'

printf 'Rust cdylib: '
du -h "$ANDROID_LIBS/arm64-v8a/libkorrid_spike.so" | cut -f1
printf 'APK: '
du -h app/build/outputs/apk/debug/app-arm64-v8a-debug.apk | cut -f1

if [[ "${1:-}" == "--device" ]]; then
  "$CRATE/android-smoke.sh"
fi
