#!/usr/bin/env bash
# Controllable launch target for tests.
#
# The real ShellLauncher (product/platform/library/shell-launcher.ts, Unit 4 of the
# personal-MVP plan) spawns this script for real via Bun.spawn. The launcher's
# code path is exercised end-to-end; only the *target binary* — what would be
# runemu.sh in production — is a stand-in.
#
# Contract:
#   - Echoes its argv, one quoted token per line, to stderr so callers can
#     assert on the exact arguments the launcher composed.
#   - Exits with the integer in $KORRI_FAKE_GAME_EXIT (default: 0).
#
# See docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md.

set -u

echo "fake-game launched with: $*" 1>&2
for arg in "$@"; do
  printf 'argv: %s\n' "$arg" 1>&2
done

exit "${KORRI_FAKE_GAME_EXIT:-0}"
