#!/usr/bin/env bash
# Materialise the writable Android SDK layout AGP expects and export its paths.
# This file is sourced by devshells and Nix tasks because apps do not run
# shellHooks.
#
# Expects KORRI_NIX_SDK and KORRI_NDK_VERSION. KORRI_ROOT defaults to $PWD.

set -euo pipefail

: "${KORRI_NIX_SDK:?sdk-env.sh needs KORRI_NIX_SDK}"
: "${KORRI_NDK_VERSION:?sdk-env.sh needs KORRI_NDK_VERSION}"
KORRI_ROOT="${KORRI_ROOT:-$PWD}"

if [ ! -d "$KORRI_NIX_SDK/ndk-bundle" ]; then
  printf 'sdk-env.sh: expected NDK at %s/ndk-bundle\n' "$KORRI_NIX_SDK" >&2
  return 1
fi

SDK_DIR="$KORRI_ROOT/.android-sdk"

if [ ! -d "$SDK_DIR" ] || [ ! -e "$SDK_DIR/ndk/$KORRI_NDK_VERSION" ]; then
  rm -rf "$SDK_DIR"
  mkdir -p "$SDK_DIR"

  for item in "$KORRI_NIX_SDK"/*; do
    name="$(basename "$item")"
    case "$name" in
      # `ndk` must be a real directory so the version link below does not try
      # to write through a symlink into the read-only Nix store.
      platforms | ndk | ndk-bundle | licenses) continue ;;
      *) ln -sf "$item" "$SDK_DIR/$name" ;;
    esac
  done

  mkdir -p "$SDK_DIR/platforms"
  for platform in "$KORRI_NIX_SDK/platforms"/*; do
    ln -sf "$platform" "$SDK_DIR/platforms/$(basename "$platform")"
  done

  # Nix ships android-36.1 while AGP asks for android-36.
  if [ -d "$KORRI_NIX_SDK/platforms/android-36.1" ] && [ ! -e "$SDK_DIR/platforms/android-36" ]; then
    ln -sf "$KORRI_NIX_SDK/platforms/android-36.1" "$SDK_DIR/platforms/android-36"
  fi

  mkdir -p "$SDK_DIR/ndk"
  ln -sf "$KORRI_NIX_SDK/ndk-bundle" "$SDK_DIR/ndk/$KORRI_NDK_VERSION"

  # Licences must be writable real files because Gradle reads and rewrites them.
  mkdir -p "$SDK_DIR/licenses"
  if [ -d "$KORRI_NIX_SDK/licenses" ]; then
    for license in "$KORRI_NIX_SDK/licenses"/*; do
      cat "$license" > "$SDK_DIR/licenses/$(basename "$license")"
    done
  fi
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_NDK_ROOT="$SDK_DIR/ndk/$KORRI_NDK_VERSION"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$PATH"
