#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash android-tools bun cargo-ndk clang coreutils gawk git gnugrep gnused
# shellcheck shell=bash
# Runs the real native bridge contract test against an isolated headless emulator.
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ANDROID_CLIENT="$ROOT/clients/android"
ANDROID_LIBS="$ANDROID_CLIENT/app/src/main/jniLibs"
BRIDGE_VERSION_PROJECTION="$ANDROID_CLIENT/test/bridge-contract-version.ts"
AVD_PACKAGE="system-images;android-34;google_apis;x86_64"
AVD_NAME="korri-bridge-contract-$$"
EMULATOR_PORT="${KORRI_BRIDGE_EMULATOR_PORT:-5554}"
SERIAL="emulator-$EMULATOR_PORT"
BOOT_TIMEOUT_SECONDS="${KORRI_BRIDGE_BOOT_TIMEOUT_SECONDS:-240}"
RUN_DIR=""
EMULATOR_PID=""
EMULATOR_LOG=""
LOCK_DIR="$ROOT/.cache/android-bridge-contract-check.lock"
LOCK_ACQUIRED=false
BUILD_ANDROID_HOME="${ANDROID_HOME:-}"
BUILD_ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-}"
BUILD_ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-}"
BUILD_KORRI_NIX_SDK="${KORRI_NIX_SDK:-}"

if [[ -z "$BUILD_ANDROID_HOME" || -z "$BUILD_ANDROID_SDK_ROOT" || -z "$BUILD_ANDROID_NDK_ROOT" ]]; then
  echo "bridge contract check requires the Android build SDK environment; run through nix run .#android-bridge-contract-check" >&2
  exit 1
fi
: "${KORRI_EMULATOR_NIX_SDK:?bridge contract check needs KORRI_EMULATOR_NIX_SDK}"
: "${KORRI_NDK_VERSION:?bridge contract check needs KORRI_NDK_VERSION}"

cleanup() {
  local status=$?
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e

  if [[ -n "$EMULATOR_PID" ]]; then
    adb -s "$SERIAL" emu kill >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
      kill "$EMULATOR_PID" >/dev/null 2>&1 || true
      sleep 1
    fi
    if kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
      kill -9 "$EMULATOR_PID" >/dev/null 2>&1 || true
      sleep 0.5
    fi
    if kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
      echo "bridge contract check failed to stop emulator process $EMULATOR_PID" >&2
      cleanup_failed=true
    fi
    wait "$EMULATOR_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$RUN_DIR" && -e "$RUN_DIR" ]]; then
    rm -rf "$RUN_DIR" || cleanup_failed=true
  fi
  if [[ "$LOCK_ACQUIRED" == true ]]; then
    rmdir "$LOCK_DIR" || cleanup_failed=true
  fi

  if [[ "$cleanup_failed" == true && "$status" -eq 0 ]]; then
    echo "bridge contract check cleanup failed after successful test run" >&2
    exit 1
  fi
  if [[ "$cleanup_failed" == true ]]; then
    echo "bridge contract check cleanup also failed; preserving primary failure status $status" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail_with_emulator_diagnostics() {
  local message="$1"
  echo "$message" >&2
  echo "-- adb devices" >&2
  adb devices -l >&2 || true
  if [[ -n "$EMULATOR_LOG" && -f "$EMULATOR_LOG" ]]; then
    echo "-- emulator log tail ($EMULATOR_LOG)" >&2
    tail -120 "$EMULATOR_LOG" >&2 || true
  fi
  exit 1
}

acquire_lock() {
  mkdir -p "$(dirname "$LOCK_DIR")"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "android-bridge-contract-check uses fixed emulator port $EMULATOR_PORT and another run appears active: $LOCK_DIR" >&2
    echo "If this is stale, remove it only after verifying no bridge contract check emulator is running." >&2
    exit 1
  fi
  LOCK_ACQUIRED=true
}

reject_unsafe_emulator_concurrency() {
  local devices
  devices="$(adb devices | sed -n '2,$p' | awk '$1 ~ /^emulator-/ { print $1 " " $2 }')"
  if [[ -n "$devices" ]]; then
    echo "android-bridge-contract-check owns emulator port $EMULATOR_PORT and refuses to run while another emulator is visible:" >&2
    printf '%s\n' "$devices" >&2
    echo "Stop the existing emulator before rerunning this MVP check." >&2
    exit 1
  fi
}

materialize_emulator_sdk() {
  export KORRI_NIX_SDK="$KORRI_EMULATOR_NIX_SDK"
  export KORRI_ANDROID_SDK_NAME="android-emulator"
  # shellcheck source=/dev/null
  source "$ROOT/nix/android-sdk-env.sh"
  EMULATOR_ANDROID_HOME="$ANDROID_HOME"
  EMULATOR_ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"

  use_build_sdk_env
}

use_build_sdk_env() {
  export ANDROID_HOME="$BUILD_ANDROID_HOME"
  export ANDROID_SDK_ROOT="$BUILD_ANDROID_SDK_ROOT"
  export ANDROID_NDK_ROOT="$BUILD_ANDROID_NDK_ROOT"
  export KORRI_NIX_SDK="$BUILD_KORRI_NIX_SDK"
  export KORRI_ANDROID_SDK_NAME="android"
}

use_emulator_sdk_env() {
  export ANDROID_HOME="$EMULATOR_ANDROID_HOME"
  export ANDROID_SDK_ROOT="$EMULATOR_ANDROID_SDK_ROOT"
  export KORRI_NIX_SDK="$KORRI_EMULATOR_NIX_SDK"
  export KORRI_ANDROID_SDK_NAME="android-emulator"
}

create_avd() {
  local image_dir="$EMULATOR_ANDROID_SDK_ROOT/system-images/android-34/google_apis/x86_64"
  local avdmanager=""
  local candidate

  for candidate in "$EMULATOR_ANDROID_SDK_ROOT"/cmdline-tools/*/bin/avdmanager; do
    if [[ -x "$candidate" ]]; then
      avdmanager="$candidate"
      break
    fi
  done

  [[ -x "$EMULATOR_ANDROID_SDK_ROOT/emulator/emulator" ]] \
    || fail_with_emulator_diagnostics "Composed Android SDK is missing emulator binary: $EMULATOR_ANDROID_SDK_ROOT/emulator/emulator"
  [[ -d "$image_dir" ]] \
    || fail_with_emulator_diagnostics "Composed Android SDK is missing $AVD_PACKAGE at $image_dir"
  [[ -n "$avdmanager" ]] \
    || fail_with_emulator_diagnostics "Composed Android SDK is missing avdmanager under $EMULATOR_ANDROID_SDK_ROOT/cmdline-tools/*/bin"

  use_emulator_sdk_env
  mkdir -p "$ANDROID_AVD_HOME" "$ANDROID_EMULATOR_HOME"
  printf 'no\n' | "$avdmanager" create avd \
    --force \
    --name "$AVD_NAME" \
    --package "$AVD_PACKAGE" >/dev/null
}

boot_emulator() {
  local emulator="$EMULATOR_ANDROID_SDK_ROOT/emulator/emulator"
  use_emulator_sdk_env
  echo "== boot API 34 google_apis x86_64 emulator ($SERIAL)"
  if [[ ! -e /dev/kvm ]]; then
    echo "-- /dev/kvm is absent; emulator will rely on software acceleration and may time out under the bounded boot wait" >&2
  fi
  "$emulator" \
    -avd "$AVD_NAME" \
    -port "$EMULATOR_PORT" \
    -no-window \
    -no-audio \
    -no-boot-anim \
    -gpu swiftshader_indirect \
    -no-snapshot \
    -wipe-data \
    >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!

  timeout "$BOOT_TIMEOUT_SECONDS" adb -s "$SERIAL" wait-for-device \
    || fail_with_emulator_diagnostics "Timed out waiting for $SERIAL to become reachable via adb"

  local deadline=$((SECONDS + BOOT_TIMEOUT_SECONDS))
  local boot_completed=""
  while (( SECONDS < deadline )); do
    if ! kill -0 "$EMULATOR_PID" >/dev/null 2>&1; then
      fail_with_emulator_diagnostics "Emulator process exited before Android boot completed"
    fi
    boot_completed="$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$boot_completed" == "1" ]]; then
      adb -s "$SERIAL" shell input keyevent 82 >/dev/null 2>&1 || true
      echo "-- emulator boot completed"
      return 0
    fi
    sleep 2
  done

  fail_with_emulator_diagnostics "Timed out after ${BOOT_TIMEOUT_SECONDS}s waiting for Android boot completion; last sys.boot_completed='$boot_completed'"
}

project_bridge_version() {
  cd "$ANDROID_CLIENT"
  bun "$BRIDGE_VERSION_PROJECTION" | tr -d '\r\n'
}

bundle_portal_assets() {
  echo "== bundle portal assets"
  cd "$ROOT/clients/portal"
  bun run build
  rm -rf "$ANDROID_CLIENT/app/src/main/assets/portal"
  cp -r dist "$ANDROID_CLIENT/app/src/main/assets/portal"
}

build_x86_64_korrid() {
  echo "== build x86_64 embedded korrid library"
  use_build_sdk_env
  export ANDROID_NDK_HOME="$BUILD_ANDROID_NDK_ROOT"
  cd "$ROOT/services/korrid"
  cargo ndk -t x86_64 -o "$ANDROID_LIBS" build --release --lib
  test -f "$ANDROID_LIBS/x86_64/libkorrid.so"
}

run_contract_test() {
  local bridge_version="$1"
  echo "== run KorriNativeBridgeContractTest against $SERIAL (bridgeVersion=$bridge_version)"
  use_build_sdk_env
  export ANDROID_SERIAL="$SERIAL"
  cd "$ANDROID_CLIENT"
  ./gradlew \
    :app:connectedDebugAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.bridgeVersion="$bridge_version" \
    -Pandroid.testInstrumentationRunnerArguments.class=com.limelight.KorriNativeBridgeContractTest
}

acquire_lock
reject_unsafe_emulator_concurrency
RUN_DIR="$(mktemp -d -t korri-bridge-contract.XXXXXXXXXX)"
EMULATOR_LOG="$RUN_DIR/emulator.log"
export ANDROID_AVD_HOME="$RUN_DIR/avd"
export ANDROID_EMULATOR_HOME="$RUN_DIR/emulator-home"

materialize_emulator_sdk
create_avd
boot_emulator

bridge_version="$(project_bridge_version)"
if ! [[ "$bridge_version" =~ ^[0-9]+$ ]]; then
  echo "Projected BRIDGE_VERSION is not an integer: $bridge_version" >&2
  exit 1
fi
bundle_portal_assets
build_x86_64_korrid
run_contract_test "$bridge_version"

echo "bridge contract check passed on $SERIAL"
