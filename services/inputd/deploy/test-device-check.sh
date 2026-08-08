#!/usr/bin/env bash
set -euo pipefail

# This file is also the deterministic SSH/SCP command harness used below.
case "$(basename "$0")" in
  ssh-command-harness)
    args=("$@")
    for ((index = 0; index < ${#args[@]}; index++)); do
      if [[ "${args[$index]}" == cat && "${args[$((index + 1))]:-}" == /etc/machine-id ]]; then
        printf '%s\n' "${HARNESS_MACHINE_ID:-0123456789abcdef0123456789abcdef}"
        exit 0
      fi
      if [[ "${args[$index]}" == hostname ]]; then
        printf '%s\n' "${HARNESS_HOSTNAME:-zao}"
        exit 0
      fi
      if [[ "${args[$index]}" == mktemp ]]; then
        printf '/tmp/korri-device-gate.harness\n'
        exit 0
      fi
      if [[ "${args[$index]}" == --remote ]]; then
        action="${args[$((index + 1))]:-}"
        printf '%s\n' "$action" >>"$HARNESS_LOG"
        case "$action" in
          inspect)
            cat <<'EOF'
identity machine-id=0123456789abcdef0123456789abcdef hostname=zao
generation current=/nix/store/rollback-nixos-system-zao default=/nix/store/rollback-nixos-system-zao
package-identities:
inputplumber.service package=/nix/store/inputplumber/bin/inputplumber
korri-inputd.service package=not-running
units:
system/inputplumber.service LoadState=loaded ActiveState=active StatusText=
user/korrid.service LoadState=loaded ActiveState=active StatusText=
input-topology:
groups:
cgroup-v2:
dbus:
sunshine:
active=active pairing-state-present=yes
korrid:
catalog-outcome=Ok game-count=2
session-outcome=Ok session-state=NoActiveSession
real-controller=yes temporary-artifacts-dirty=no
EOF
            ;;
          preflight)
            candidate="${args[$((index + 2))]}"
            rollback="${args[$((index + 3))]}"
            printf 'candidate=%s\n' "$candidate"
            printf 'candidate-switch=%s\n' "${HARNESS_CANDIDATE_SWITCH:-yes}"
            printf 'rollback=%s\n' "$rollback"
            printf 'rollback-switch=%s\n' "${HARNESS_ROLLBACK_SWITCH:-yes}"
            printf 'real-controller=%s\n' "${HARNESS_REAL_CONTROLLER:-yes}"
            printf 'temporary-artifacts-dirty=%s\n' "${HARNESS_DIRTY:-no}"
            ;;
          old-user-state) printf 'active=true\nenabled=true\n' ;;
          boot-id) printf '%s' "${HARNESS_BOOT_ID:-boot-one}" ;;
          current-generation) printf '%s\n' "${HARNESS_CURRENT_GENERATION:-/nix/store/rollback-nixos-system-zao}" ;;
          automated-gates) printf 'automated-gates=pass normalized-target=/dev/input/event9 raw-readable=0 inputd-status=Ready catalog=Ok\n' ;;
          rollback-gates) printf 'rollback-gates=pass inputplumber=active old-korrid=active sunshine=active catalog=Ok normalized-count=1\n' ;;
          activate-test|inject-health-failure|restore|persistent-switch) ;;
          *) printf 'unexpected remote action: %s\n' "$action" >&2; exit 1 ;;
        esac
        exit 0
      fi
    done
    # Cleanup's exact remote rm command is intentionally not a mutation stage.
    exit 0
    ;;
  scp-command-harness)
    exit 0
    ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/device-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SELF="$(realpath "$0")"
ln -s "$SELF" "$TMP/ssh-command-harness"
ln -s "$SELF" "$TMP/scp-command-harness"
export KORRI_DEVICE_GATE_SSH="$TMP/ssh-command-harness"
export KORRI_DEVICE_GATE_SCP="$TMP/scp-command-harness"
export KORRI_DEVICE_GATE_TEST_HARNESS=1
export HARNESS_LOG="$TMP/commands.log"
MACHINE_ID=0123456789abcdef0123456789abcdef
HOSTNAME=zao
CANDIDATE=/nix/store/candidate-nixos-system-zao
ROLLBACK=/nix/store/rollback-nixos-system-zao
GAMEPLAY_USER=gameplay

run_gate() {
  "$GATE" \
    --host zao \
    --expected-machine-id "$MACHINE_ID" \
    --expected-hostname "$HOSTNAME" \
    "$@"
}

assert_fails_with() {
  local expected="$1"
  shift
  : >"$TMP/failure.stdout"
  : >"$TMP/failure.stderr"
  if "$@" >"$TMP/failure.stdout" 2>"$TMP/failure.stderr"; then
    printf 'expected command to fail: %s\n' "$*" >&2
    exit 1
  fi
  grep -F "$expected" "$TMP/failure.stderr" >/dev/null || {
    printf 'missing failure text %q; stderr follows:\n' "$expected" >&2
    cat "$TMP/failure.stderr" >&2
    exit 1
  }
}

assert_no_mutation() {
  if grep -E 'activate-test|persistent-switch|restore|inject-health-failure' "$HARNESS_LOG" >/dev/null; then
    printf 'unexpected mutation command; log follows:\n' >&2
    cat "$HARNESS_LOG" >&2
    exit 1
  fi
}

: >"$HARNESS_LOG"
assert_fails_with 'an explicit --host is required' \
  "$GATE" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME"
[[ ! -s "$HARNESS_LOG" ]]

: >"$HARNESS_LOG"
assert_fails_with 'remote machine-id mismatch' \
  "$GATE" --host zao --expected-machine-id ffffffffffffffffffffffffffffffff --expected-hostname zao
assert_no_mutation

: >"$HARNESS_LOG"
inspection="$(run_gate)"
grep -F 'inspection=complete mutation=none' <<<"$inspection" >/dev/null
grep -Fx inspect "$HARNESS_LOG" >/dev/null
assert_no_mutation

common=(
  --candidate "$CANDIDATE"
  --rollback-generation "$ROLLBACK"
  --gameplay-user "$GAMEPLAY_USER"
  --ledger "$TMP/ledger"
)
confirm="CONFIRM-$(printf '%s' "$MACHINE_ID|$HOSTNAME|$CANDIDATE" | sha256sum | cut -c1-16)"
hitl=()
for gate in \
  normalized-gameplay \
  health-recovery-ambiguity \
  dbus-spoof-and-exclusive-grab \
  exact-stop-and-races \
  direct-action-isolation \
  sunshine-video-controller-recovery \
  catalog-and-session; do
  token="PASS-$(printf '%s' "$MACHINE_ID|$HOSTNAME|$CANDIDATE|$gate" | sha256sum | cut -c1-16)"
  hitl+=(--hitl "$gate=$token")
done

: >"$HARNESS_LOG"
assert_fails_with 'confirmation token is missing' \
  run_gate --mode candidate-test "${common[@]}" "${hitl[@]}"
assert_no_mutation

: >"$HARNESS_LOG"
export HARNESS_DIRTY=yes
assert_fails_with 'dirty or untracked U7 temporary devices/profiles' \
  run_gate --mode candidate-test "${common[@]}" --confirm "$confirm" "${hitl[@]}"
unset HARNESS_DIRTY
assert_no_mutation

: >"$HARNESS_LOG"
export HARNESS_ROLLBACK_SWITCH=no
assert_fails_with 'rollback generation has no switch-to-configuration' \
  run_gate --mode candidate-test "${common[@]}" --confirm "$confirm" "${hitl[@]}"
unset HARNESS_ROLLBACK_SWITCH
assert_no_mutation

: >"$HARNESS_LOG"
export HARNESS_REAL_CONTROLLER=no
assert_fails_with 'require a real supported controller' \
  run_gate --mode persistent-switch "${common[@]}" --confirm "$confirm" "${hitl[@]}"
unset HARNESS_REAL_CONTROLLER
assert_no_mutation

rm -rf "$TMP/ledger"
: >"$HARNESS_LOG"
run_gate --mode candidate-test "${common[@]}" --confirm "$confirm" "${hitl[@]}" >/dev/null
grep -Fx 'state=candidate-green' "$TMP/ledger/state" >/dev/null
[[ "$(stat -c %a "$TMP/ledger")" == 700 ]]
[[ "$(stat -c %a "$TMP/ledger/baseline.txt")" == 600 ]]
grep -Fx activate-test "$HARNESS_LOG" >/dev/null
grep -Fx automated-gates "$HARNESS_LOG" >/dev/null
grep -Fx restore "$HARNESS_LOG" >/dev/null

: >"$HARNESS_LOG"
run_gate --mode inject-health-failure "${common[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=automatic-rollback-green' "$TMP/ledger/state" >/dev/null
grep -Fx inject-health-failure "$HARNESS_LOG" >/dev/null

: >"$HARNESS_LOG"
run_gate --mode rollback "${common[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-await-reboot' "$TMP/ledger/state" >/dev/null

export HARNESS_BOOT_ID=boot-two
export HARNESS_CURRENT_GENERATION="$ROLLBACK"
run_gate --mode rollback-reboot-verify "${common[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-reboot-green' "$TMP/ledger/state" >/dev/null

export HARNESS_REAL_CONTROLLER=yes
run_gate --mode persistent-switch "${common[@]}" --confirm "$confirm" "${hitl[@]}" >/dev/null
grep -Fx 'state=candidate-await-reboot' "$TMP/ledger/state" >/dev/null

export HARNESS_BOOT_ID=boot-three
export HARNESS_CURRENT_GENERATION="$CANDIDATE"
run_gate --mode candidate-reboot-verify "${common[@]}" --confirm "$confirm" "${hitl[@]}" >/dev/null
grep -Fx 'state=complete' "$TMP/ledger/state" >/dev/null

printf 'inputd device gate shell tests passed\n'
