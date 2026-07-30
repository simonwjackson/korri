#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM_URL="${RETROARCH_UPSTREAM_URL:-https://github.com/libretro/RetroArch.git}"
UPSTREAM_REF="${RETROARCH_UPSTREAM_REF:-v1.22.2}"
UPSTREAM_COMMIT="${RETROARCH_UPSTREAM_COMMIT:-69a4f0ea1e8aaf442ae4858f2e7f2b31a1776576}"
UPSTREAM_DIR="${RETROARCH_UPSTREAM_DIR:-$HERE/upstream}"
PATCH_DIR="${RETROARCH_PATCH_DIR:-$HERE/patches}"

if [[ -e "$UPSTREAM_DIR" && ! -d "$UPSTREAM_DIR/.git" ]]; then
  echo "refusing to replace non-git upstream directory: $UPSTREAM_DIR" >&2
  exit 1
fi

if [[ ! -d "$UPSTREAM_DIR/.git" ]]; then
  mkdir -p "$(dirname "$UPSTREAM_DIR")"
  git clone --quiet --no-checkout --depth 1 --branch "$UPSTREAM_REF" \
    "$UPSTREAM_URL" "$UPSTREAM_DIR"
else
  git -C "$UPSTREAM_DIR" remote set-url origin "$UPSTREAM_URL"
  git -C "$UPSTREAM_DIR" fetch --quiet --depth 1 origin "$UPSTREAM_REF"
fi

if git -C "$UPSTREAM_DIR" rev-parse --verify 'FETCH_HEAD^{commit}' >/dev/null 2>&1; then
  actual_commit="$(git -C "$UPSTREAM_DIR" rev-parse --verify 'FETCH_HEAD^{commit}')"
else
  actual_commit="$(git -C "$UPSTREAM_DIR" rev-parse --verify 'HEAD^{commit}')"
fi
if [[ "$actual_commit" != "$UPSTREAM_COMMIT" ]]; then
  echo "RetroArch pin mismatch: expected $UPSTREAM_COMMIT, fetched $actual_commit from $UPSTREAM_REF" >&2
  exit 1
fi

# upstream/ is a generated worktree. Reset tracked files to the verified pin,
# but retain ignored Gradle/NDK outputs so incremental builds stay useful.
git -C "$UPSTREAM_DIR" checkout --quiet --detach "$UPSTREAM_COMMIT"
git -C "$UPSTREAM_DIR" reset --quiet --hard "$UPSTREAM_COMMIT"
git -C "$UPSTREAM_DIR" clean -qfd

shopt -s nullglob
patches=("$PATCH_DIR"/[0-9][0-9][0-9][0-9]-*.patch)
for patch in "${patches[@]}"; do
  name="$(basename "$patch")"
  echo "Applying $name"
  if ! git -C "$UPSTREAM_DIR" apply --check --unidiff-zero --whitespace=error-all "$patch"; then
    echo "Patch failed exact application: $name" >&2
    exit 1
  fi
  git -C "$UPSTREAM_DIR" apply --unidiff-zero --whitespace=error-all "$patch"
done

printf 'RetroArch %s ready at %s with %d Korri patch(es)\n' \
  "$UPSTREAM_COMMIT" "$UPSTREAM_DIR" "${#patches[@]}"
