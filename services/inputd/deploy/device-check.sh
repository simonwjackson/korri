#!/usr/bin/env bash
set -Eeuo pipefail

# Repository-side, explicit-target gate for the first Linux InputPlumber rollout.
# This file is copied to a private remote directory and also acts as its remote
# helper. The public mode never sends shell programs through SSH.

SSH_BIN="${KORRI_DEVICE_GATE_SSH:-ssh}"
SCP_BIN="${KORRI_DEVICE_GATE_SCP:-scp}"
POLL_ATTEMPTS="${KORRI_DEVICE_GATE_POLL_ATTEMPTS:-40}"
POLL_DELAY="${KORRI_DEVICE_GATE_POLL_DELAY:-0.25}"
NORMALIZED_NAME='Microsoft X-Box 360 pad'

fail() {
  printf 'device gate: %s\n' "$*" >&2
  exit 1
}

remote_wait_unit() {
  local unit="$1"
  local expected_status="${2:-}"
  local active status
  for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
    active="$(systemctl show "$unit" -p ActiveState --value 2>/dev/null || true)"
    status="$(systemctl show "$unit" -p StatusText --value 2>/dev/null || true)"
    if [[ "$active" == active && ( -z "$expected_status" || "$status" == "$expected_status" ) ]]; then
      return 0
    fi
    sleep "$POLL_DELAY"
  done
  printf 'timed out waiting for %s ActiveState=active StatusText=%s\n' "$unit" "${expected_status:-<any>}" >&2
  return 1
}

remote_generation() {
  realpath -e /run/current-system
}

remote_user_unit_active() {
  systemctl --user is-active --quiet korrid.service 2>/dev/null
}

remote_stop_old_user_unit() {
  if remote_user_unit_active; then
    systemctl --user stop korrid.service
  fi
}

remote_restore_old_user_unit() {
  local was_active="$1"
  local was_enabled="$2"
  if [[ "$was_enabled" == true ]]; then
    systemctl --user enable korrid.service >/dev/null
  else
    systemctl --user disable korrid.service >/dev/null 2>&1 || true
  fi
  if [[ "$was_active" == true ]]; then
    systemctl --user start korrid.service
  else
    systemctl --user stop korrid.service >/dev/null 2>&1 || true
  fi
}

remote_normalized_nodes() {
  local event name bustype vendor product version
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    [[ -r "$event/device/name" ]] || continue
    name="$(<"$event/device/name")"
    bustype="$(cat "$event/device/id/bustype" 2>/dev/null || true)"
    vendor="$(cat "$event/device/id/vendor" 2>/dev/null || true)"
    product="$(cat "$event/device/id/product" 2>/dev/null || true)"
    version="$(cat "$event/device/id/version" 2>/dev/null || true)"
    if [[ "$name" == "$NORMALIZED_NAME" && "$bustype:$vendor:$product:$version" == '0003:045e:028e:0001' ]]; then
      printf '/dev/input/%s\n' "${event##*/}"
    fi
  done
}

remote_has_real_controller() {
  local event node name properties
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    node="/dev/input/${event##*/}"
    [[ -r "$event/device/name" ]] || continue
    name="$(<"$event/device/name")"
    [[ "$name" == "$NORMALIZED_NAME" ]] && continue
    properties="$(udevadm info --query=property --name="$node" 2>/dev/null || true)"
    if grep -Fx 'ID_INPUT_JOYSTICK=1' <<<"$properties" >/dev/null; then
      return 0
    fi
  done
  return 1
}

remote_temporary_artifacts_dirty() {
  local event name
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    [[ -r "$event/device/name" ]] || continue
    name="$(<"$event/device/name")"
    [[ "$name" == 'Korri U7 Synthetic Controller' ]] && return 0
  done
  compgen -G '/run/korri-u7-device-gate.*' >/dev/null && return 0
  compgen -G '/tmp/korri-u7-device-gate.*' >/dev/null && return 0
  return 1
}

remote_unit_snapshot() {
  local scope="$1"
  local unit="$2"
  local prefix=()
  [[ "$scope" == user ]] && prefix=(--user)
  printf '%s/%s LoadState=%s ActiveState=%s SubState=%s UnitFileState=%s StatusText=%s FragmentPath=%s\n' \
    "$scope" "$unit" \
    "$(systemctl "${prefix[@]}" show "$unit" -p LoadState --value 2>/dev/null || true)" \
    "$(systemctl "${prefix[@]}" show "$unit" -p ActiveState --value 2>/dev/null || true)" \
    "$(systemctl "${prefix[@]}" show "$unit" -p SubState --value 2>/dev/null || true)" \
    "$(systemctl "${prefix[@]}" show "$unit" -p UnitFileState --value 2>/dev/null || true)" \
    "$(systemctl "${prefix[@]}" show "$unit" -p StatusText --value 2>/dev/null || true)" \
    "$(systemctl "${prefix[@]}" show "$unit" -p FragmentPath --value 2>/dev/null || true)"
}

remote_process_identity() {
  local unit="$1"
  local pid executable
  pid="$(systemctl show "$unit" -p MainPID --value 2>/dev/null || true)"
  executable=''
  if [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then
    executable="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
  fi
  printf '%s package=%s\n' "$unit" "${executable:-not-running}"
}

remote_inspect() {
  local machine_id hostname event node name phys uniq bustype vendor product version props
  machine_id="$(tr -d '\n' </etc/machine-id)"
  hostname="$(hostname)"
  printf 'identity machine-id=%s hostname=%s\n' "$machine_id" "$hostname"
  printf 'generation current=%s default=%s\n' \
    "$(remote_generation)" \
    "$(readlink -f /nix/var/nix/profiles/system 2>/dev/null || true)"
  printf '%s\n' 'generations:'
  nix-env --list-generations -p /nix/var/nix/profiles/system 2>/dev/null || true
  printf '%s\n' 'package-identities:'
  remote_process_identity inputplumber.service
  remote_process_identity korri-inputd.service
  remote_process_identity korrid.service
  printf 'inputplumber data-root=%s\n' "$(systemctl show inputplumber.service -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^XDG_DATA_DIRS=//p' | head -1)"
  printf '%s\n' 'units:'
  remote_unit_snapshot system inputplumber.service
  remote_unit_snapshot system korri-inputd.service
  remote_unit_snapshot system korrid.service
  remote_unit_snapshot system korrid-control.socket
  remote_unit_snapshot user korrid.service
  remote_unit_snapshot user sunshine.service
  remote_unit_snapshot user x11-headless.service
  printf '%s\n' 'input-topology:'
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    node="/dev/input/${event##*/}"
    [[ -r "$event/device/name" ]] || continue
    name="$(<"$event/device/name")"
    phys="$(cat "$event/device/phys" 2>/dev/null || true)"
    uniq="$(cat "$event/device/uniq" 2>/dev/null || true)"
    bustype="$(cat "$event/device/id/bustype" 2>/dev/null || true)"
    vendor="$(cat "$event/device/id/vendor" 2>/dev/null || true)"
    product="$(cat "$event/device/id/product" 2>/dev/null || true)"
    version="$(cat "$event/device/id/version" 2>/dev/null || true)"
    props="$(udevadm info --query=property --name="$node" 2>/dev/null | grep -E '^(ID_BUS|ID_INPUT_JOYSTICK|ID_PATH|ID_SERIAL)=' | tr '\n' ',' || true)"
    printf '%s name=%q id=%s:%s:%s:%s phys=%q uniq=%q provenance=%q permissions=%s acl=' \
      "$node" "$name" "$bustype" "$vendor" "$product" "$version" "$phys" "$uniq" "$props" \
      "$(stat -Lc '%a:%U:%G:%t:%T' "$node" 2>/dev/null || true)"
    getfacl -cp "$node" 2>/dev/null | tr '\n' ',' || true
    printf '\n'
  done
  printf '%s\n' 'groups:'
  getent group | sed -E 's/^([^:]+):[^:]*:/\1:<redacted-password-field>:/ '
  printf '%s\n' 'cgroup-v2:'
  printf 'filesystem=%s\n' "$(stat -fc %T /sys/fs/cgroup 2>/dev/null || true)"
  for unit in inputplumber.service korri-inputd.service korrid.service; do
    printf '%s ControlGroup=%s Delegate=%s\n' "$unit" \
      "$(systemctl show "$unit" -p ControlGroup --value 2>/dev/null || true)" \
      "$(systemctl show "$unit" -p Delegate --value 2>/dev/null || true)"
  done
  printf '%s\n' 'dbus:'
  printf 'owner=%s interface=org.shadowblip.Input.DBusDevice path=/org/shadowblip/InputPlumber/devices/target/dbus0\n' \
    "$(busctl --system get-name-owner org.shadowblip.InputPlumber 2>/dev/null || true)"
  busctl --system introspect org.shadowblip.InputPlumber /org/shadowblip/InputPlumber/devices/target/dbus0 org.shadowblip.Input.DBusDevice --no-pager 2>/dev/null \
    | awk '$2 == "signal" {print "dbus-signal=" $1}' || true
  printf '%s\n' 'sunshine:'
  printf 'active=%s pairing-state-present=%s\n' \
    "$(systemctl --user is-active sunshine.service 2>/dev/null || true)" \
    "$([[ -s "$HOME/.config/sunshine/sunshine_state.json" ]] && printf yes || printf no)"
  printf '%s\n' 'korrid:'
  curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:43117/rpc \
    -H 'content-type: application/json' -d '{"_tag":"app.catalog.snapshot","payload":{}}' 2>/dev/null \
    | jq -r '"catalog-outcome=" + (.outcome._tag // "unknown") + " game-count=" + ((.outcome.payload.games // []) | length | tostring)' || printf 'catalog-outcome=unavailable game-count=unknown\n'
  curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:43117/rpc \
    -H 'content-type: application/json' -d '{"_tag":"app.session.status","payload":{}}' 2>/dev/null \
    | jq -r '"session-outcome=" + (.outcome._tag // "unknown") + " session-state=" + (.outcome.payload._tag // .outcome.failure.code // "unknown")' || printf 'session-outcome=unavailable session-state=unknown\n'
  printf 'real-controller=%s temporary-artifacts-dirty=%s\n' \
    "$(remote_has_real_controller && printf yes || printf no)" \
    "$(remote_temporary_artifacts_dirty && printf yes || printf no)"
}

remote_preflight() {
  local candidate="$1"
  local rollback="$2"
  local candidate_real rollback_real
  candidate_real="$(realpath -e -- "$candidate" 2>/dev/null || true)"
  rollback_real="$(realpath -e -- "$rollback" 2>/dev/null || true)"
  printf 'candidate=%s\n' "$candidate_real"
  printf 'candidate-switch=%s\n' "$([[ -x "$candidate_real/bin/switch-to-configuration" ]] && printf yes || printf no)"
  printf 'rollback=%s\n' "$rollback_real"
  printf 'rollback-switch=%s\n' "$([[ -x "$rollback_real/bin/switch-to-configuration" ]] && printf yes || printf no)"
  printf 'real-controller=%s\n' "$(remote_has_real_controller && printf yes || printf no)"
  printf 'temporary-artifacts-dirty=%s\n' "$(remote_temporary_artifacts_dirty && printf yes || printf no)"
}

remote_activate_test() {
  local candidate="$1"
  local old_user_was_active="$2"
  local old_user_was_enabled="$3"
  remote_stop_old_user_unit
  if ! sudo -n "$candidate/bin/switch-to-configuration" test; then
    remote_restore_old_user_unit "$old_user_was_active" "$old_user_was_enabled"
    return 1
  fi
}

remote_restore() {
  local rollback="$1"
  local old_user_was_active="$2"
  local old_user_was_enabled="$3"
  local persistent="$4"
  if [[ "$persistent" == true ]]; then
    sudo -n nix-env -p /nix/var/nix/profiles/system --set "$rollback"
    sudo -n "$rollback/bin/switch-to-configuration" switch
  else
    sudo -n "$rollback/bin/switch-to-configuration" test
  fi
  remote_restore_old_user_unit "$old_user_was_active" "$old_user_was_enabled"
  [[ "$(remote_generation)" == "$rollback" ]]
}

remote_automated_gates() {
  local gameplay_user="$1"
  local nodes node event name readable_raw=0
  remote_wait_unit inputplumber.service
  remote_wait_unit korri-inputd.service Ready
  remote_wait_unit korrid.service
  mapfile -t nodes < <(remote_normalized_nodes)
  [[ "${#nodes[@]}" -eq 1 ]] || fail "expected exactly one normalized target; found ${#nodes[@]}"
  node="${nodes[0]}"
  sudo -n -u "$gameplay_user" test -r "$node" || fail 'gameplay user cannot read normalized target'
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    name="$(cat "$event/device/name" 2>/dev/null || true)"
    [[ "$name" == "$NORMALIZED_NAME" ]] && continue
    if udevadm info --query=property --name="/dev/input/${event##*/}" 2>/dev/null | grep -Fx 'ID_INPUT_JOYSTICK=1' >/dev/null \
      && sudo -n -u "$gameplay_user" test -r "/dev/input/${event##*/}"; then
      readable_raw=$((readable_raw + 1))
    fi
  done
  [[ "$readable_raw" -eq 0 ]] || fail "gameplay user can read $readable_raw raw controller node(s)"
  [[ "$(busctl --system get-name-owner org.shadowblip.InputPlumber 2>/dev/null || true)" == :* ]] || fail 'InputPlumber has no unique DBus owner'
  busctl --system introspect org.shadowblip.InputPlumber /org/shadowblip/InputPlumber/devices/target/dbus0 org.shadowblip.Input.DBusDevice --no-pager 2>/dev/null \
    | grep -F 'InputEvent' >/dev/null || fail 'InputPlumber DBus target interface is unavailable'
  [[ "$(stat -fc %T /sys/fs/cgroup)" == cgroup2fs ]] || fail 'cgroup v2 is unavailable'
  [[ "$(systemctl show korri-inputd.service -p Delegate --value)" == pids ]] || fail 'inputd pids delegation is unavailable'
  curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:43117/rpc \
    -H 'content-type: application/json' -d '{"_tag":"app.catalog.snapshot","payload":{}}' \
    | jq -e '.outcome._tag == "Ok"' >/dev/null || fail 'korrid catalog is unhealthy'
  printf 'automated-gates=pass normalized-target=%s raw-readable=0 inputd-status=Ready catalog=Ok\n' "$node"
}

remote_rollback_gates() {
  remote_wait_unit inputplumber.service
  remote_user_unit_active || fail 'old korrid user unit is not active after rollback'
  systemctl --user is-active --quiet sunshine.service || fail 'Sunshine user unit is not active after rollback'
  remote_temporary_artifacts_dirty && fail 'temporary U7 artifacts remain after rollback'
  curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:43117/rpc \
    -H 'content-type: application/json' -d '{"_tag":"app.catalog.snapshot","payload":{}}' \
    | jq -e '.outcome._tag == "Ok"' >/dev/null || fail 'rollback korrid catalog is unhealthy'
  printf 'rollback-gates=pass inputplumber=active old-korrid=active sunshine=active catalog=Ok normalized-count=%s\n' \
    "$(remote_normalized_nodes | wc -l)"
}

remote_inject_health_failure() {
  local rollback="$1"
  local old_user_was_active="$2"
  local old_user_was_enabled="$3"
  sudo -n systemctl stop inputplumber.service
  local status=''
  for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
    status="$(systemctl show korri-inputd.service -p StatusText --value 2>/dev/null || true)"
    [[ "$status" == Recovering || "$status" == Missing ]] && break
    sleep "$POLL_DELAY"
  done
  [[ "$status" == Recovering || "$status" == Missing ]] || fail 'inputd did not fail closed after provider health failure'
  remote_restore "$rollback" "$old_user_was_active" "$old_user_was_enabled" false
}

remote_persistent_switch() {
  local candidate="$1"
  remote_stop_old_user_unit
  systemctl --user disable korrid.service >/dev/null 2>&1 || true
  sudo -n nix-env -p /nix/var/nix/profiles/system --set "$candidate"
  sudo -n "$candidate/bin/switch-to-configuration" switch
  [[ "$(remote_generation)" == "$candidate" ]]
}

if [[ "${1:-}" == --remote ]]; then
  action="${2:-}"
  shift 2
  case "$action" in
    inspect) remote_inspect ;;
    preflight) remote_preflight "${1:?}" "${2:?}" ;;
    old-user-state)
      printf 'active=%s\n' "$(remote_user_unit_active && printf true || printf false)"
      printf 'enabled=%s\n' "$(systemctl --user is-enabled --quiet korrid.service 2>/dev/null && printf true || printf false)"
      ;;
    boot-id) tr -d '\n' </proc/sys/kernel/random/boot_id ;;
    current-generation) remote_generation ;;
    activate-test) remote_activate_test "${1:?}" "${2:?}" "${3:?}" ;;
    automated-gates) remote_automated_gates "${1:?}" ;;
    rollback-gates) remote_rollback_gates ;;
    inject-health-failure) remote_inject_health_failure "${1:?}" "${2:?}" "${3:?}" ;;
    restore) remote_restore "${1:?}" "${2:?}" "${3:?}" "${4:?}" ;;
    persistent-switch) remote_persistent_switch "${1:?}" ;;
    *) fail "unknown remote action: $action" ;;
  esac
  exit 0
fi

usage() {
  cat >&2 <<'EOF'
usage: device-check.sh --host HOST --expected-machine-id ID --expected-hostname NAME [options]

Default mode: inspect (read-only).
Modes: inspect, candidate-test, inject-health-failure, rollback,
       rollback-reboot-verify, persistent-switch, candidate-reboot-verify
Mutation options:
  --candidate /nix/store/...-nixos-system-...
  --rollback-generation /nix/store/...-nixos-system-...
  --gameplay-user USER
  --ledger DIRECTORY
  --confirm TOKEN

Behavioral HITL tokens are entered at interactive prompts while the candidate
is active. They cannot be supplied as ordinary production command arguments.
EOF
}

HOST=''
EXPECTED_MACHINE_ID=''
EXPECTED_HOSTNAME=''
MODE=inspect
CANDIDATE=''
ROLLBACK=''
GAMEPLAY_USER=''
LEDGER=''
CONFIRM=''
declare -A HITL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --expected-machine-id) EXPECTED_MACHINE_ID="${2:-}"; shift 2 ;;
    --expected-hostname) EXPECTED_HOSTNAME="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --candidate) CANDIDATE="${2:-}"; shift 2 ;;
    --rollback-generation) ROLLBACK="${2:-}"; shift 2 ;;
    --gameplay-user) GAMEPLAY_USER="${2:-}"; shift 2 ;;
    --ledger) LEDGER="${2:-}"; shift 2 ;;
    --confirm) CONFIRM="${2:-}"; shift 2 ;;
    --hitl)
      value="${2:-}"
      [[ "$value" == *=* ]] || fail '--hitl requires GATE=TOKEN'
      HITL["${value%%=*}"]="${value#*=}"
      shift 2
      ;;
    --help|-h) usage; exit 0 ;;
    *) usage; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$HOST" ]] || { usage; fail 'an explicit --host is required'; }
[[ -n "$EXPECTED_MACHINE_ID" && -n "$EXPECTED_HOSTNAME" ]] || fail 'explicit --expected-machine-id and --expected-hostname are required'
[[ "$HOST" != -* && "$HOST" != *[[:space:]]* ]] || fail 'invalid host target'
[[ "$EXPECTED_MACHINE_ID" =~ ^[0-9a-f]{32}$ ]] || fail 'expected machine-id must be 32 lowercase hexadecimal characters'
[[ "$EXPECTED_HOSTNAME" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'invalid expected hostname'
case "$MODE" in
  inspect|candidate-test|inject-health-failure|rollback|rollback-reboot-verify|persistent-switch|candidate-reboot-verify) ;;
  *) fail "unknown mode: $MODE" ;;
esac

ssh_options=(-o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=2)
actual_machine_id="$($SSH_BIN "${ssh_options[@]}" "$HOST" cat /etc/machine-id | tr -d '\r\n')" || fail 'could not read remote machine-id'
actual_hostname="$($SSH_BIN "${ssh_options[@]}" "$HOST" hostname | tr -d '\r\n')" || fail 'could not read remote hostname'
[[ "$actual_machine_id" == "$EXPECTED_MACHINE_ID" ]] || fail "remote machine-id mismatch for $HOST"
[[ "$actual_hostname" == "$EXPECTED_HOSTNAME" ]] || fail "remote hostname mismatch for $HOST"

remote_dir=''
remote_script=''
local_temp_ledger=''
mutation_active=false
rollback_persistent=false
old_user_was_active=false
old_user_was_enabled=false
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  if [[ "$mutation_active" == true && -n "$remote_script" && -n "$ROLLBACK" ]]; then
    "$SSH_BIN" "${ssh_options[@]}" "$HOST" "$remote_script" --remote restore "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled" "$rollback_persistent" >/dev/null 2>&1 || \
      printf 'device gate: cleanup rollback failed; use the recorded rollback generation exactly once after inspection\n' >&2
  fi
  if [[ -n "$remote_dir" ]]; then
    "$SSH_BIN" "${ssh_options[@]}" "$HOST" rm -rf -- "$remote_dir" >/dev/null 2>&1 || true
  fi
  [[ -z "$local_temp_ledger" ]] || rm -rf -- "$local_temp_ledger"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

remote_dir="$($SSH_BIN "${ssh_options[@]}" "$HOST" mktemp -d /tmp/korri-device-gate.XXXXXX)"
[[ "$remote_dir" == /tmp/korri-device-gate.* ]] || fail 'remote mktemp returned an unexpected path'
remote_script="$remote_dir/device-check.sh"
"$SCP_BIN" "${ssh_options[@]}" "$0" "$HOST:$remote_script" >/dev/null

run_remote() {
  "$SSH_BIN" "${ssh_options[@]}" "$HOST" "$remote_script" --remote "$@"
}

if [[ "$MODE" == inspect ]]; then
  if [[ -n "$CONFIRM" || -n "$CANDIDATE" || -n "$ROLLBACK" || -n "$GAMEPLAY_USER" || -n "$LEDGER" || "${#HITL[@]}" -ne 0 ]]; then
    fail 'inspect mode refuses mutation-only arguments'
  fi
  umask 077
  local_temp_ledger="$(mktemp -d "${TMPDIR:-/tmp}/korri-device-inspect.XXXXXX")"
  chmod 0700 "$local_temp_ledger"
  run_remote inspect >"$local_temp_ledger/baseline.txt"
  chmod 0600 "$local_temp_ledger/baseline.txt"
  cat "$local_temp_ledger/baseline.txt"
  printf 'inspection=complete mutation=none ledger=private-temporary\n'
  exit 0
fi

[[ -n "$CANDIDATE" && "$CANDIDATE" == /nix/store/* ]] || fail 'mutation modes require an explicit /nix/store candidate generation'
[[ -n "$ROLLBACK" && "$ROLLBACK" == /nix/store/* ]] || fail 'mutation modes require an explicit /nix/store rollback generation'
[[ -n "$GAMEPLAY_USER" && "$GAMEPLAY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'mutation modes require an explicit gameplay user'
[[ -n "$LEDGER" ]] || fail 'mutation modes require a private --ledger directory outside the repository'
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ledger_parent="$(dirname "$LEDGER")"
mkdir -p "$ledger_parent"
ledger_parent="$(cd "$ledger_parent" && pwd -P)"
LEDGER="$ledger_parent/$(basename "$LEDGER")"
case "$LEDGER/" in "$root/"*) fail 'ledger must be outside the repository' ;; esac
if [[ -e "$LEDGER" ]]; then
  [[ -d "$LEDGER" && ! -L "$LEDGER" ]] || fail 'ledger must be a real directory'
  [[ "$(stat -c %a "$LEDGER")" == 700 ]] || fail 'existing ledger must have mode 0700'
else
  mkdir -m 0700 "$LEDGER"
fi
umask 077

preflight="$(run_remote preflight "$CANDIDATE" "$ROLLBACK")"
remote_candidate="$(awk -F= '$1 == "candidate" {print substr($0, index($0, "=") + 1)}' <<<"$preflight")"
remote_rollback="$(awk -F= '$1 == "rollback" {print substr($0, index($0, "=") + 1)}' <<<"$preflight")"
[[ "$remote_candidate" == "$CANDIDATE" ]] || fail 'candidate generation is unavailable or not canonical on the target'
[[ "$remote_rollback" == "$ROLLBACK" ]] || fail 'rollback generation is unavailable or not canonical on the target'
grep -Fx 'candidate-switch=yes' <<<"$preflight" >/dev/null || fail 'candidate has no switch-to-configuration executable'
grep -Fx 'rollback-switch=yes' <<<"$preflight" >/dev/null || fail 'rollback generation has no switch-to-configuration executable'
grep -Fx 'temporary-artifacts-dirty=no' <<<"$preflight" >/dev/null || fail 'dirty or untracked U7 temporary devices/profiles are present'
if [[ "$MODE" == persistent-switch || "$MODE" == candidate-reboot-verify ]]; then
  grep -Fx 'real-controller=yes' <<<"$preflight" >/dev/null || fail 'persistent and reboot candidate gates require a real supported controller'
fi

identity_key="$actual_machine_id|$actual_hostname|$CANDIDATE"
expected_confirm="CONFIRM-$(printf '%s' "$identity_key" | sha256sum | cut -c1-16)"
if [[ "$CONFIRM" != "$expected_confirm" ]]; then
  printf 'Required confirmation for host=%s candidate=%s: %s\n' "$actual_hostname" "$CANDIDATE" "$expected_confirm" >&2
  fail 'mutation confirmation token is missing or does not match the captured host and candidate generation'
fi

state_file="$LEDGER/state"
state="$(awk -F= '$1 == "state" {print $2}' "$state_file" 2>/dev/null || true)"
write_state() {
  local next="$1"
  local boot_id="${2:-}"
  {
    printf 'state=%s\n' "$next"
    printf 'machine_id=%s\n' "$actual_machine_id"
    printf 'hostname=%s\n' "$actual_hostname"
    printf 'candidate=%s\n' "$CANDIDATE"
    printf 'rollback=%s\n' "$ROLLBACK"
    printf 'boot_id=%s\n' "$boot_id"
  } >"$state_file.next"
  mv -f "$state_file.next" "$state_file"
}
assert_ledger_identity() {
  [[ -z "$state" ]] && return 0
  grep -Fx "machine_id=$actual_machine_id" "$state_file" >/dev/null || fail 'ledger machine identity differs from target'
  grep -Fx "candidate=$CANDIDATE" "$state_file" >/dev/null || fail 'ledger candidate differs from request'
  grep -Fx "rollback=$ROLLBACK" "$state_file" >/dev/null || fail 'ledger rollback differs from request'
}
assert_ledger_identity

if [[ ! -f "$LEDGER/baseline.txt" ]]; then
  run_remote inspect >"$LEDGER/baseline.txt"
  chmod 0600 "$LEDGER/baseline.txt"
fi
old_user_state="$(run_remote old-user-state)"
old_user_was_active="$(awk -F= '$1 == "active" {print $2}' <<<"$old_user_state")"
old_user_was_enabled="$(awk -F= '$1 == "enabled" {print $2}' <<<"$old_user_state")"
[[ "$old_user_was_active" == true || "$old_user_was_active" == false ]] || fail 'could not capture old user-unit active state'
[[ "$old_user_was_enabled" == true || "$old_user_was_enabled" == false ]] || fail 'could not capture old user-unit enabled state'

hitl_gates=(
  normalized-gameplay
  health-recovery-ambiguity
  dbus-spoof-and-exclusive-grab
  exact-stop-and-races
  direct-action-isolation
  sunshine-video-controller-recovery
  catalog-and-session
)
require_hitl() {
  local gate expected supplied
  for gate in "${hitl_gates[@]}"; do
    expected="PASS-$(printf '%s' "$identity_key|$gate" | sha256sum | cut -c1-16)"
    printf 'HITL stage: %s\nRequired token after the stage passes: %s\n' "$gate" "$expected" >&2
    if [[ "${KORRI_DEVICE_GATE_TEST_HARNESS:-}" == 1 ]]; then
      supplied="${HITL[$gate]:-}"
    else
      [[ -r /dev/tty ]] || fail "HITL stage requires an interactive terminal: $gate"
      printf 'Complete the documented stage now, then enter its token: ' >/dev/tty
      IFS= read -r supplied </dev/tty
    fi
    [[ "$supplied" == "$expected" ]] || fail "HITL stage is not confirmed: $gate"
  done
}

case "$MODE" in
  candidate-test)
    [[ -z "$state" || "$state" == candidate-green ]] || fail "candidate-test cannot follow ledger state $state"
    run_remote activate-test "$CANDIDATE" "$old_user_was_active" "$old_user_was_enabled"
    mutation_active=true
    run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/candidate-automated.txt"
    require_hitl
    run_remote restore "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled" false
    mutation_active=false
    write_state candidate-green "$(run_remote boot-id)"
    ;;
  inject-health-failure)
    [[ "$state" == candidate-green ]] || fail 'injected failure requires candidate-green ledger state'
    run_remote activate-test "$CANDIDATE" "$old_user_was_active" "$old_user_was_enabled"
    mutation_active=true
    run_remote inject-health-failure "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled"
    mutation_active=false
    write_state automatic-rollback-green "$(run_remote boot-id)"
    ;;
  rollback)
    [[ "$state" == automatic-rollback-green ]] || fail 'explicit rollback requires automatic-rollback-green ledger state'
    run_remote activate-test "$CANDIDATE" "$old_user_was_active" "$old_user_was_enabled"
    mutation_active=true
    rollback_persistent=true
    run_remote restore "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled" true
    mutation_active=false
    write_state rollback-await-reboot "$(run_remote boot-id)"
    ;;
  rollback-reboot-verify)
    [[ "$state" == rollback-await-reboot ]] || fail 'rollback reboot verification requires rollback-await-reboot ledger state'
    prior_boot="$(awk -F= '$1 == "boot_id" {print $2}' "$state_file")"
    current_boot="$(run_remote boot-id)"
    [[ "$current_boot" != "$prior_boot" ]] || fail 'rollback reboot verification requires a new boot ID'
    [[ "$(run_remote current-generation)" == "$ROLLBACK" ]] || fail 'rebooted system is not the rollback generation'
    run_remote rollback-gates | tee "$LEDGER/rollback-reboot.txt"
    write_state rollback-reboot-green "$current_boot"
    ;;
  persistent-switch)
    [[ "$state" == rollback-reboot-green ]] || fail 'persistent switch requires rollback-reboot-green ledger state'
    mutation_active=true
    rollback_persistent=true
    run_remote persistent-switch "$CANDIDATE"
    run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/persistent-automated.txt"
    require_hitl
    mutation_active=false
    write_state candidate-await-reboot "$(run_remote boot-id)"
    ;;
  candidate-reboot-verify)
    [[ "$state" == candidate-await-reboot ]] || fail 'candidate reboot verification requires candidate-await-reboot ledger state'
    prior_boot="$(awk -F= '$1 == "boot_id" {print $2}' "$state_file")"
    current_boot="$(run_remote boot-id)"
    [[ "$current_boot" != "$prior_boot" ]] || fail 'candidate reboot verification requires a new boot ID'
    [[ "$(run_remote current-generation)" == "$CANDIDATE" ]] || fail 'rebooted system is not the candidate generation'
    run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/candidate-reboot.txt"
    require_hitl
    write_state complete "$current_boot"
    ;;
esac

printf 'device-gate mode=%s state=%s host=%s mutation=confirmed\n' "$MODE" "$(awk -F= '$1 == "state" {print $2}' "$state_file")" "$actual_hostname"
