#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ACCEPTANCE="$ROOT/clients/android/overlay-acceptance.sh"
PREDICATES="$ROOT/clients/android/overlay-evidence-predicates.sh"
# shellcheck source=../../clients/android/overlay-evidence-predicates.sh disable=SC1091
source "$PREDICATES"

valid_records=$'unrelated\nevent=overlay-window-create result=success\nevent=physical-guide-key key=BUTTON_MODE keyCode=110 action=1 deviceId=9 consumed=true sessionAccepted=true showing=true'
missing_guide='event=overlay-window-create result=success'
missing_create='event=physical-guide-key key=BUTTON_MODE keyCode=110 action=1 deviceId=9 consumed=true sessionAccepted=true showing=true'

positive="$(korri_positive_overlay_predicate "$valid_records")"
grep -F 'event=physical-guide-key key=BUTTON_MODE keyCode=110 action=1 deviceId=9 consumed=true sessionAccepted=true showing=true' <<<"$positive" >/dev/null
grep -F 'event=overlay-window-create result=success' <<<"$positive" >/dev/null
[[ "$(grep -c . <<<"$positive")" -eq 2 ]]

probe_capture_contract() {
  local records="$1"
  local exact_checkpoint_predicate=''
  exact_checkpoint_predicate="$(korri_positive_overlay_predicate "$records" || true)"
  [[ -n "$exact_checkpoint_predicate" ]] || {
    echo 'required checkpoint predicate positive-overlay is absent for fixture' >&2
    return 1
  }
}

assert_explicit_failure() {
  local label="$1"
  local records="$2"
  local stderr_file
  stderr_file="$(mktemp)"
  if probe_capture_contract "$records" 2>"$stderr_file"; then
    echo "positive overlay predicate accepted $label fixture" >&2
    rm -f "$stderr_file"
    exit 1
  fi
  grep -F 'required checkpoint predicate positive-overlay is absent for fixture' \
    "$stderr_file" >/dev/null || {
    echo "positive overlay predicate failed silently for $label fixture" >&2
    cat "$stderr_file" >&2
    rm -f "$stderr_file"
    exit 1
  }
  rm -f "$stderr_file"
}

assert_explicit_failure missing-guide "$missing_guide"
assert_explicit_failure missing-window-create "$missing_create"

# Optional predicate collection must not terminate under set -e before the
# explicit absent-predicate diagnostic, while negative greps remain direct.
# shellcheck disable=SC2016 # Literal source-contract needles.
grep -F 'korri_positive_overlay_predicate "$required_lifecycle_records" || true' \
  "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal sed range, not a shell expression.
optional_blocks="$(sed -n \
  '/exact_checkpoint_predicate="$(grep -E \\/,/| tail -1/p' "$ACCEPTANCE")"
[[ "$(grep -c '^      exact_checkpoint_predicate=.*grep -E' <<<"$optional_blocks")" -eq 2 ]]
[[ "$(grep -Fc '| tail -1 || true)' <<<"$optional_blocks")" -eq 2 ]] || {
  echo 'an optional grep predicate lacks || true' >&2
  printf '%s\n' "$optional_blocks" >&2
  exit 1
}
# shellcheck disable=SC2016 # Literal source-contract needle.
for needle in \
  '! grep -Eq "launchId=$expected_launch_id .*event=request-show reason=accepted"' \
  "! grep -Eq 'event=request-show reason=accepted'"; do
  grep -F "$needle" "$ACCEPTANCE" >/dev/null || {
    echo "negative fail-closed grep missing: $needle" >&2
    exit 1
  }
done

printf 'Overlay evidence predicate fixtures passed\n'
