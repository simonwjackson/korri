#!/usr/bin/env bash
set -Eeuo pipefail

# This file is also the modeled SSH/SCP endpoint used by the tests below.
case "$(basename "$0")" in
  ssh-command-harness)
    command="${*: -1}"
    printf 'ssh-command=%s\n' "$command" >>"$HARNESS_LOG"
    # Model the remote login shell. If production quoting regresses, this eval
    # makes the adversarial tests execute their sentinel and fail.
    eval "set -- $command"
    if [[ "${1:-}" == cat && "${2:-}" == /etc/machine-id ]]; then
      printf '%s\n' "${HARNESS_MACHINE_ID:-0123456789abcdef0123456789abcdef}"
      exit 0
    fi
    if [[ "${1:-}" == hostname ]]; then
      printf '%s\n' "${HARNESS_HOSTNAME:-u7-test-host}"
      exit 0
    fi
    if [[ "${1:-}" == mktemp ]]; then
      printf '/tmp/korri-device-gate.harness1\n'
      exit 0
    fi
    if [[ "${1:-}" == rm ]]; then
      exit 0
    fi
    if [[ "${2:-}" == --remote ]]; then
      action="${3:-}"
      shift 3
      {
        printf 'action=%s argv=' "$action"
        printf '%q ' "$@"
        printf '\n'
      } >>"$HARNESS_LOG"
      case "$action" in
        inspect)
          printf 'identity machine-id=%s hostname=%s\n' \
            "${HARNESS_MACHINE_ID:-0123456789abcdef0123456789abcdef}" \
            "${HARNESS_HOSTNAME:-u7-test-host}"
          printf 'generation current=%s default=%s\n' "$ROLLBACK" "$ROLLBACK"
          printf 'units:\nsystem/inputplumber.service LoadState=loaded ActiveState=active SubState=running UnitFileState=enabled StatusText=\n'
          printf 'user/korrid.service LoadState=loaded ActiveState=inactive SubState=dead UnitFileState=disabled StatusText=\n'
          printf 'user/sunshine.service LoadState=loaded ActiveState=active SubState=running UnitFileState=enabled StatusText=\n'
          printf 'real-controller=%s temporary-artifacts-dirty=%s catalog=Ok\n' \
            "${HARNESS_REAL_CONTROLLER:-yes}" "${HARNESS_DIRTY:-no}"
          ;;
        predicates)
          printf 'generation.current=%s\n' "${HARNESS_PREDICATE_GENERATION:-$ROLLBACK}"
          printf 'generation.default=%s\n' "${HARNESS_PREDICATE_DEFAULT:-$ROLLBACK}"
          printf 'old-user.active=%s\n' "${HARNESS_OLD_ACTIVE:-false}"
          printf 'old-user.enabled=%s\n' "${HARNESS_OLD_ENABLED:-false}"
          printf 'topology.target=%s\n' "${HARNESS_TARGET_TOPOLOGY:-target-baseline}"
          printf 'topology.raw=%s\n' "${HARNESS_RAW_TOPOLOGY:-raw-baseline}"
          printf 'input.acl-readability=%s\n' "${HARNESS_ACL_BASELINE:-acl-baseline}"
          printf 'input.sources-artifacts=%s\n' "${HARNESS_ARTIFACTS_BASELINE:-artifacts-clean}"
          printf 'inputplumber.active=%s\n' "${HARNESS_IP_ACTIVE:-active}"
          printf 'inputplumber.enabled=%s\n' "${HARNESS_IP_ENABLED:-enabled}"
          printf 'sunshine.active=%s\n' "${HARNESS_SUNSHINE_ACTIVE:-active}"
          printf 'sunshine.enabled=%s\n' "${HARNESS_SUNSHINE_ENABLED:-enabled}"
          printf 'catalog.health=%s\n' "${HARNESS_CATALOG:-Ok}"
          ;;
        preflight)
          candidate="$1"
          rollback="$2"
          printf 'candidate=%s\n' "$candidate"
          printf 'candidate-switch=%s\n' "${HARNESS_CANDIDATE_SWITCH:-yes}"
          printf 'rollback=%s\n' "$rollback"
          printf 'rollback-switch=%s\n' "${HARNESS_ROLLBACK_SWITCH:-yes}"
          printf 'real-controller=%s\n' "${HARNESS_REAL_CONTROLLER:-yes}"
          printf 'temporary-artifacts-dirty=%s\n' "${HARNESS_DIRTY:-no}"
          ;;
        boot-id)
          if [[ -n "${HARNESS_BOOT_COUNT_FILE:-}" ]]; then
            count="$(cat "$HARNESS_BOOT_COUNT_FILE" 2>/dev/null || printf 0)"
            count=$((count + 1))
            printf '%s\n' "$count" >"$HARNESS_BOOT_COUNT_FILE"
            [[ "$count" != "${HARNESS_FAIL_BOOT_ID_AT:-0}" ]] || exit 71
          elif [[ "${HARNESS_FAIL_BOOT_ID:-no}" == yes ]]; then
            exit 71
          fi
          printf '%s' "${HARNESS_BOOT_ID:-boot-one}"
          ;;
        current-generation)
          printf '%s\n' "${HARNESS_CURRENT_GENERATION:-$ROLLBACK}"
          ;;
        automated-gates)
          if [[ "${HARNESS_AUTOMATED_INTERRUPT:-no}" == yes ]]; then
            printf 'modeled interruption immediately after activation\n' >&2
            exit 130
          fi
          [[ "${HARNESS_TOPOLOGY_MODEL:-one}" == one ]] || {
            printf 'modeled topology has %s normalized targets\n' "$HARNESS_TOPOLOGY_MODEL" >&2
            exit 61
          }
          [[ "${HARNESS_PROVENANCE_MODEL:-valid}" == valid ]] || {
            printf 'modeled target provenance/capability fingerprint is invalid\n' >&2
            exit 62
          }
          [[ "${HARNESS_ACL_MODEL:-normalized-only}" == normalized-only ]] || {
            printf 'modeled gameplay ACL exposes raw input\n' >&2
            exit 63
          }
          [[ "${HARNESS_CATALOG:-Ok}" == Ok ]] || exit 64
          printf 'automated-gates=pass raw-readable=0 inputd-status=Ready catalog=Ok\n'
          printf 'normalized-fingerprint=%s\n' "${HARNESS_FINGERPRINT:-node=/dev/input/event9 sysfs=/sys/devices/virtual/input/input9/event9 dev=13:73 inode=1:9 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes}"
          ;;
        normalized-fingerprint)
          if [[ "${HARNESS_REPLACE_TARGET:-no}" == yes ]]; then
            printf '%s\n' 'node=/dev/input/event10 sysfs=/sys/devices/virtual/input/input10/event10 dev=13:74 inode=1:10 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes'
          else
            printf '%s\n' "${HARNESS_FINGERPRINT:-node=/dev/input/event9 sysfs=/sys/devices/virtual/input/input9/event9 dev=13:73 inode=1:9 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes}"
          fi
          ;;
        rollback-gates)
          printf 'rollback-gates=pass\n'
          ;;
        activate-test|inject-health-failure|restore|persistent-switch)
          grep -Fx 'state=pending-mutation' "$HARNESS_LEDGER/state" >/dev/null || {
            printf 'mutation was not armed in the ledger: %s\n' "$action" >&2
            exit 65
          }
          if [[ "$action" == restore ]]; then
            [[ "${2:-}" == "${HARNESS_OLD_ACTIVE:-false}" ]]
            [[ "${3:-}" == "${HARNESS_OLD_ENABLED:-false}" ]]
          fi
          if [[ "$action" == activate-test && "${HARNESS_MUTATION_SLEEP:-0}" != 0 ]]; then
            sleep "$HARNESS_MUTATION_SLEEP"
          fi
          ;;
        *) printf 'unexpected remote action: %s\n' "$action" >&2; exit 70 ;;
      esac
      exit 0
    fi
    printf 'unexpected SSH argv: %q\n' "$command" >&2
    exit 69
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
export HARNESS_LOG="$TMP/commands.log"
MACHINE_ID=0123456789abcdef0123456789abcdef
HOSTNAME=u7-test-host
CANDIDATE=/nix/store/00000000000000000000000000000000-nixos-system-u7-test-host-1
ROLLBACK=/nix/store/11111111111111111111111111111111-nixos-system-u7-test-host-0
GAMEPLAY_USER=gameplay
export CANDIDATE ROLLBACK

run_gate() {
  "$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" "$@"
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
  if grep -E 'action=(activate-test|persistent-switch|restore|inject-health-failure)' "$HARNESS_LOG" >/dev/null; then
    printf 'unexpected mutation; log follows:\n' >&2
    cat "$HARNESS_LOG" >&2
    exit 1
  fi
}

common_for() {
  local ledger="$1"
  printf '%s\0' --candidate "$CANDIDATE" --rollback-generation "$ROLLBACK" \
    --gameplay-user "$GAMEPLAY_USER" --ledger "$ledger"
}
confirm="CONFIRM-$(printf '%s' "$MACHINE_ID|$HOSTNAME|$CANDIDATE" | sha256sum | cut -c1-16)"

: >"$HARNESS_LOG"
assert_fails_with 'an explicit --host is required' "$GATE" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME"
[[ ! -s "$HARNESS_LOG" ]]

# Candidate and rollback paths are rejected before the first SSH call. These
# values would create sentinels if interpolated into a remote shell command.
for which in candidate rollback; do
  : >"$HARNESS_LOG"
  sentinel="$TMP/${which}-executed"
  if [[ "$which" == candidate ]]; then
    bad_candidate="${CANDIDATE};touch${IFS}$sentinel"
    assert_fails_with 'strictly valid Nix store generation path' run_gate --mode candidate-test \
      --candidate "$bad_candidate" --rollback-generation "$ROLLBACK" --gameplay-user "$GAMEPLAY_USER" --ledger "$TMP/path-ledger"
  else
    bad_rollback="${ROLLBACK}\$(touch $sentinel)"
    assert_fails_with 'strictly valid Nix store generation path' run_gate --mode candidate-test \
      --candidate "$CANDIDATE" --rollback-generation "$bad_rollback" --gameplay-user "$GAMEPLAY_USER" --ledger "$TMP/path-ledger"
  fi
  [[ ! -e "$sentinel" && ! -s "$HARNESS_LOG" ]]
done
: >"$HARNESS_LOG"
assert_fails_with 'invalid host target' "$GATE" --host "host;touch-$TMP/host-executed" \
  --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME"
[[ ! -e "$TMP/host-executed" && ! -s "$HARNESS_LOG" ]]

: >"$HARNESS_LOG"
assert_fails_with 'remote machine-id mismatch' "$GATE" --host "$HOSTNAME" \
  --expected-machine-id ffffffffffffffffffffffffffffffff --expected-hostname "$HOSTNAME"
assert_no_mutation

: >"$HARNESS_LOG"
inspection="$(run_gate)"
grep -F 'inspection=complete mutation=none' <<<"$inspection" >/dev/null
assert_no_mutation

# A valid Nix name containing shell metacharacters remains one exact argv item.
quoted_candidate='/nix/store/22222222222222222222222222222222-nixos-system-u7-test-host?variant=one'
quoted_ledger="$TMP/ledger with quote'and space"
export HARNESS_LEDGER="$quoted_ledger"
: >"$HARNESS_LOG"
assert_fails_with 'confirmation token is missing' run_gate --mode candidate-test \
  --candidate "$quoted_candidate" --rollback-generation "$ROLLBACK" --gameplay-user "$GAMEPLAY_USER" --ledger "$quoted_ledger"
grep -F "$(printf '%q' "$quoted_candidate")" "$HARNESS_LOG" >/dev/null
assert_no_mutation
rm -rf "$quoted_ledger"

run_failure_model() {
  local name="$1" variable="$2" value="$3" expected="$4" ledger
  ledger="$TMP/$name-ledger"
  local -a args
  mapfile -d '' -t args < <(common_for "$ledger")
  export HARNESS_LEDGER="$ledger"
  export "$variable=$value"
  : >"$HARNESS_LOG"
  assert_fails_with "$expected" run_gate --mode candidate-test "${args[@]}" --confirm "$confirm"
  grep -Fx 'state=failed-needs-inspection' "$ledger/state" >/dev/null
  grep -F 'action=restore' "$HARNESS_LOG" >/dev/null
  unset "$variable"
}
run_failure_model topology HARNESS_TOPOLOGY_MODEL two 'modeled topology has two normalized targets'
run_failure_model provenance HARNESS_PROVENANCE_MODEL invalid 'modeled target provenance/capability fingerprint is invalid'
run_failure_model acl HARNESS_ACL_MODEL raw-readable 'modeled gameplay ACL exposes raw input'

# An interruption immediately after activation leaves a durable failure state,
# performs rollback, and blocks retry until an exact baseline reconcile.
interrupt_ledger="$TMP/interruption-ledger"
mapfile -d '' -t interrupt_args < <(common_for "$interrupt_ledger")
export HARNESS_LEDGER="$interrupt_ledger" HARNESS_AUTOMATED_INTERRUPT=yes
: >"$HARNESS_LOG"
assert_fails_with 'mutation failed; fresh reconcile is required' run_gate --mode candidate-test \
  "${interrupt_args[@]}" --confirm "$confirm"
grep -Fx 'state=failed-needs-inspection' "$interrupt_ledger/state" >/dev/null
grep -F 'action=activate-test' "$HARNESS_LOG" >/dev/null
grep -F 'action=restore' "$HARNESS_LOG" >/dev/null
unset HARNESS_AUTOMATED_INTERRUPT
assert_fails_with 'fresh reconcile is required before retry' run_gate --mode candidate-test \
  "${interrupt_args[@]}" --confirm "$confirm"
export HARNESS_RAW_TOPOLOGY=changed-after-rollback
assert_fails_with 'rollback predicates differ' run_gate --mode reconcile "${interrupt_args[@]}"
unset HARNESS_RAW_TOPOLOGY
run_gate --mode reconcile "${interrupt_args[@]}" >/dev/null
[[ "$(awk -F= '$1 == "state" {print $2}' "$interrupt_ledger/state")" == '' ]]

# Every remote mutation has TERM/KILL timeout behavior and timeout failure uses
# the same rollback/reconcile path.
timeout_ledger="$TMP/timeout-ledger"
mapfile -d '' -t timeout_args < <(common_for "$timeout_ledger")
export HARNESS_LEDGER="$timeout_ledger" HARNESS_MUTATION_SLEEP=3 KORRI_DEVICE_GATE_MUTATION_TIMEOUT=1
assert_fails_with 'mutation failed; fresh reconcile is required' run_gate --mode candidate-test \
  "${timeout_args[@]}" --confirm "$confirm"
grep -Fx 'state=failed-needs-inspection' "$timeout_ledger/state" >/dev/null
unset HARNESS_MUTATION_SLEEP KORRI_DEVICE_GATE_MUTATION_TIMEOUT

# Run a mutation through the real /dev/tty path. The driver reads the private
# nonce from the 0600 ledger and sends the displayed one-time tokens over a PTY.
run_interactive() {
  local mode="$1" ledger_state="$2" ledger="$3" transcript="$4"
  shift 4
  local fifo="$TMP/tty-fifo-$RANDOM" command='' nonce boot token gate
  local -a argv=("$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" --mode "$mode" "$@")
  mkfifo "$fifo"
  printf -v command '%q ' "${argv[@]}"
  script -qefc "$command" /dev/null <"$fifo" >"$transcript" 2>&1 &
  local script_pid=$!
  exec 3>"$fifo"
  for _ in $(seq 1 200); do
    nonce="$(awk -F= '$1 == "attempt_nonce" {print $2}' "$ledger/state" 2>/dev/null || true)"
    boot="$(awk -F= '$1 == "boot_id" {print $2}' "$ledger/state" 2>/dev/null || true)"
    [[ "$nonce" =~ ^[0-9a-f]{64}$ && -n "$boot" ]] && break
    kill -0 "$script_pid" 2>/dev/null || break
    sleep 0.02
  done
  [[ "$nonce" =~ ^[0-9a-f]{64}$ && -n "$boot" ]]
  trap '' PIPE
  for gate in normalized-gameplay health-recovery-ambiguity dbus-spoof-and-exclusive-grab exact-stop-and-races direct-action-isolation sunshine-video-controller-recovery catalog-and-session; do
    token="PASS-$(printf '%s' "$MACHINE_ID|$HOSTNAME|$CANDIDATE|$nonce|$boot|$ledger_state|$gate" | sha256sum | cut -c1-16)"
    printf '%s\n' "$token" >&3 || break
  done
  exec 3>&-
  trap - PIPE
  local status=0
  wait "$script_pid" || status=$?
  if grep -F "$nonce" "$transcript" >/dev/null; then
    return 1
  fi
  return "$status"
}

flow_ledger="$TMP/flow-ledger"
mapfile -d '' -t flow_args < <(common_for "$flow_ledger")
export HARNESS_LEDGER="$flow_ledger"
run_interactive candidate-test pending-mutation "$flow_ledger" "$TMP/candidate.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=candidate-green' "$flow_ledger/state" >/dev/null
[[ "$(stat -c %a "$flow_ledger")" == 700 ]]
[[ "$(stat -c %a "$flow_ledger/baseline.predicates")" == 600 ]]
[[ "$(wc -l <"$flow_ledger/consumed-gates")" -eq 7 ]]

run_gate --mode inject-health-failure "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=automatic-rollback-green' "$flow_ledger/state" >/dev/null
run_gate --mode rollback "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-await-reboot' "$flow_ledger/state" >/dev/null
export HARNESS_BOOT_ID=boot-two HARNESS_CURRENT_GENERATION="$ROLLBACK"
run_gate --mode rollback-reboot-verify "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-reboot-green' "$flow_ledger/state" >/dev/null

run_interactive persistent-switch pending-mutation "$flow_ledger" "$TMP/persistent.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=candidate-await-reboot' "$flow_ledger/state" >/dev/null
export HARNESS_BOOT_ID=boot-three HARNESS_CURRENT_GENERATION="$CANDIDATE"
run_interactive candidate-reboot-verify candidate-reboot-verifying "$flow_ledger" "$TMP/candidate-reboot.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=complete' "$flow_ledger/state" >/dev/null
[[ "$(wc -l <"$flow_ledger/consumed-gates")" -eq 21 ]]
[[ "$(sort -u "$flow_ledger/consumed-gates" | wc -l)" -eq 21 ]]

# Replacement between automated proof and acceptance fails and rolls back.
replacement_ledger="$TMP/replacement-ledger"
mapfile -d '' -t replacement_args < <(common_for "$replacement_ledger")
export HARNESS_LEDGER="$replacement_ledger" HARNESS_REPLACE_TARGET=yes
if run_interactive candidate-test pending-mutation "$replacement_ledger" "$TMP/replacement.tty" \
  "${replacement_args[@]}" --confirm "$confirm"; then
  printf 'replacement acceptance unexpectedly passed\n' >&2
  exit 1
fi
grep -F 'normalized target was replaced before acceptance' "$TMP/replacement.tty" >/dev/null
grep -Fx 'state=failed-needs-inspection' "$replacement_ledger/state" >/dev/null
unset HARNESS_REPLACE_TARGET

# A failed boot-ID fetch after persistent acceptance does not roll back. The
# accepted pending state resumes without repeating the switch or HITL gates.
cp -a "$flow_ledger" "$TMP/resume-ledger"
resume_ledger="$TMP/resume-ledger"
export HARNESS_LEDGER="$resume_ledger"
# Return the copied ledger to the prerequisite state.
awk 'BEGIN{done=0} /^state=/{print "state=rollback-reboot-green"; done=1; next} {print} END{if(!done) print "state=rollback-reboot-green"}' \
  "$resume_ledger/state" >"$resume_ledger/state.next"
mv "$resume_ledger/state.next" "$resume_ledger/state"
export HARNESS_BOOT_COUNT_FILE="$TMP/boot-count" HARNESS_FAIL_BOOT_ID_AT=2
: >"$HARNESS_BOOT_COUNT_FILE"
printf '0\n' >"$HARNESS_BOOT_COUNT_FILE"
if run_interactive persistent-switch pending-mutation "$resume_ledger" "$TMP/pending-accepted.tty" \
  "${flow_args[@]/$flow_ledger/$resume_ledger}" --confirm "$confirm"; then
  printf 'failed boot-ID fetch unexpectedly passed\n' >&2
  exit 1
fi
grep -Fx 'state=candidate-accepted-pending-boot' "$resume_ledger/state" >/dev/null
if grep -F 'mutation failed; fresh reconcile' "$TMP/pending-accepted.tty" >/dev/null; then
  printf 'accepted pending state incorrectly rolled back\n' >&2
  exit 1
fi
unset HARNESS_BOOT_COUNT_FILE HARNESS_FAIL_BOOT_ID_AT
: >"$HARNESS_LOG"
run_gate --mode persistent-switch "${flow_args[@]/$flow_ledger/$resume_ledger}" --confirm "$confirm" >/dev/null
grep -Fx 'state=candidate-await-reboot' "$resume_ledger/state" >/dev/null
if grep -E 'action=(persistent-switch|activate-test)' "$HARNESS_LOG" >/dev/null; then
  printf 'accepted pending resumption repeated mutation\n' >&2
  exit 1
fi

printf 'inputd device gate shell tests passed\n'
