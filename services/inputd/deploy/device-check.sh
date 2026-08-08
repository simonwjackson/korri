#!/usr/bin/env bash
set -Eeuo pipefail

# Explicit-target, reversible gate for the first Linux InputPlumber rollout.
# Remote argv is always single-quoted by ssh_exec. No caller value is sent as
# unquoted remote shell text.

SSH_BIN="${KORRI_DEVICE_GATE_SSH:-ssh}"
SCP_BIN="${KORRI_DEVICE_GATE_SCP:-scp}"
POLL_ATTEMPTS="${KORRI_DEVICE_GATE_POLL_ATTEMPTS:-40}"
POLL_DELAY="${KORRI_DEVICE_GATE_POLL_DELAY:-0.25}"
MUTATION_TIMEOUT="${KORRI_DEVICE_GATE_MUTATION_TIMEOUT:-120}"
NORMALIZED_NAME='Microsoft X-Box 360 pad'
EXPECTED_KEYS='304,305,307,308,310,311,314,315,316,317,318,704,705,706,707'
EXPECTED_ABS='0,1,2,3,4,5,16,17'

fail() {
  printf 'device gate: %s\n' "$*" >&2
  exit 1
}

valid_generation_path() {
  [[ "$1" =~ ^/nix/store/[0-9a-df-np-sv-z]{32}-nixos-system-[A-Za-z0-9+._?=-]+$ ]]
}

remote_wait_unit() {
  local unit="$1" expected_status="${2:-}" active status attempt
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

remote_generation() { realpath -e /run/current-system; }
remote_user_unit_active() { systemctl --user is-active --quiet korrid.service 2>/dev/null; }

remote_stop_old_user_unit() {
  remote_user_unit_active && systemctl --user stop korrid.service || true
}

remote_restore_old_user_unit() {
  local was_active="$1" was_enabled="$2"
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

# Print the exact set bits in a Linux sysfs capability bitmap.
remote_bitmap_codes() {
  local bitmap compact nibble value bit nibble_index=0 code
  bitmap="$(<"$1")"
  compact="${bitmap//[[:space:]]/}"
  while [[ -n "$compact" ]]; do
    nibble="${compact: -1}"
    compact="${compact::-1}"
    case "$nibble" in
      [0-9]) value=$((10#$nibble)) ;;
      [a-f]) value=$((10 + $(printf '%d' "'$nibble") - 97)) ;;
      [A-F]) value=$((10 + $(printf '%d' "'$nibble") - 65)) ;;
      *) return 1 ;;
    esac
    for bit in 0 1 2 3; do
      if ((value & (1 << bit))); then
        code=$((nibble_index * 4 + bit))
        printf '%s\n' "$code"
      fi
    done
    nibble_index=$((nibble_index + 1))
  done
}

remote_normalized_fingerprint() {
  local event node name phys uniq bustype vendor product version sysfs dev_sys dev_stat
  local keys axes ff exe ip_version props fingerprint count=0
  shopt -s nullglob
  for event in /sys/class/input/event*; do
    [[ -r "$event/device/name" ]] || continue
    name="$(<"$event/device/name")"
    [[ "$name" == "$NORMALIZED_NAME" ]] || continue
    node="/dev/input/${event##*/}"
    phys="$(cat "$event/device/phys" 2>/dev/null || true)"
    uniq="$(cat "$event/device/uniq" 2>/dev/null || true)"
    bustype="$(cat "$event/device/id/bustype" 2>/dev/null || true)"
    vendor="$(cat "$event/device/id/vendor" 2>/dev/null || true)"
    product="$(cat "$event/device/id/product" 2>/dev/null || true)"
    version="$(cat "$event/device/id/version" 2>/dev/null || true)"
    sysfs="$(realpath -e -- "$event" 2>/dev/null || true)"
    [[ "$bustype:$vendor:$product:$version" == '0003:045e:028e:0001' ]] || continue
    [[ -z "$phys" && -z "$uniq" && "$sysfs" == /sys/devices/virtual/input/input*/event* ]] || continue
    props="$(udevadm info --query=property --name="$node" 2>/dev/null || true)"
    grep -Fx 'ID_INPUT_JOYSTICK=1' <<<"$props" >/dev/null || continue
    keys="$(remote_bitmap_codes "$event/device/capabilities/key" | paste -sd, -)"
    axes="$(remote_bitmap_codes "$event/device/capabilities/abs" | paste -sd, -)"
    ff="$(remote_bitmap_codes "$event/device/capabilities/ff" | head -1 || true)"
    [[ "$keys" == "$EXPECTED_KEYS" && "$axes" == "$EXPECTED_ABS" && -n "$ff" ]] || continue
    dev_sys="$(<"$event/dev")"
    dev_stat="$(stat -Lc '%t:%T' "$node" 2>/dev/null || true)"
    [[ "$dev_sys" == "$((16#${dev_stat%:*})):$((16#${dev_stat#*:}))" ]] || continue
    exe="$(readlink -f /proc/"$(systemctl show inputplumber.service -p MainPID --value)"/exe 2>/dev/null || true)"
    [[ "$exe" =~ ^/nix/store/[0-9a-df-np-sv-z]{32}-inputplumber-korri-0\.75\.2/bin/inputplumber$ && -x "$exe" ]] || continue
    ip_version="$("$exe" --version 2>/dev/null || true)"
    [[ "$ip_version" =~ (^|[[:space:]])0\.75\.2($|[[:space:]]) ]] || continue
    fingerprint="node=$node sysfs=$sysfs dev=$dev_sys inode=$(stat -Lc '%d:%i' "$node") inputplumber=$exe version=0.75.2 keys=$keys abs=$axes ff=yes"
    printf '%s\n' "$fingerprint"
    count=$((count + 1))
  done
  [[ "$count" -eq 1 ]]
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
    grep -Fx 'ID_INPUT_JOYSTICK=1' <<<"$properties" >/dev/null && return 0
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

remote_unit_value() {
  local scope="$1" unit="$2" property="$3" prefix=()
  [[ "$scope" == user ]] && prefix=(--user)
  systemctl "${prefix[@]}" show "$unit" -p "$property" --value 2>/dev/null || true
}

remote_catalog_health() {
  curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:43117/rpc \
    -H 'content-type: application/json' -d '{"_tag":"app.catalog.snapshot","payload":{}}' \
    | jq -r 'if .outcome._tag == "Ok" then "Ok" else "unhealthy" end' 2>/dev/null || printf unavailable
}

remote_topology_digest() {
  local kind="$1" event node name phys uniq id props dev sysfs readable
  {
    shopt -s nullglob
    for event in /sys/class/input/event*; do
      node="/dev/input/${event##*/}"
      [[ -r "$event/device/name" ]] || continue
      name="$(<"$event/device/name")"
      props="$(udevadm info --query=property --name="$node" 2>/dev/null || true)"
      grep -Fx 'ID_INPUT_JOYSTICK=1' <<<"$props" >/dev/null || continue
      if [[ "$kind" == target ]]; then
        [[ "$name" == "$NORMALIZED_NAME" ]] || continue
      else
        [[ "$name" != "$NORMALIZED_NAME" ]] || continue
      fi
      phys="$(cat "$event/device/phys" 2>/dev/null || true)"
      uniq="$(cat "$event/device/uniq" 2>/dev/null || true)"
      id="$(cat "$event/device/id/bustype" 2>/dev/null || true):$(cat "$event/device/id/vendor" 2>/dev/null || true):$(cat "$event/device/id/product" 2>/dev/null || true):$(cat "$event/device/id/version" 2>/dev/null || true)"
      dev="$(cat "$event/dev" 2>/dev/null || true)"
      sysfs="$(realpath -e -- "$event" 2>/dev/null || true)"
      readable="$(test -r "$node" && printf yes || printf no)"
      printf '%q|%q|%q|%s|%s|%s|%s\n' "$name" "$phys" "$uniq" "$id" "$dev" "$sysfs" "$readable"
    done | sort
  } | sha256sum | cut -d' ' -f1
}

remote_acl_digest() {
  local gameplay_user="$1" event node name game_read
  {
    shopt -s nullglob
    for event in /sys/class/input/event*; do
      node="/dev/input/${event##*/}"
      [[ -r "$event/device/name" ]] || continue
      name="$(<"$event/device/name")"
      game_read="$(sudo -n -u "$gameplay_user" test -r "$node" && printf yes || printf no)"
      printf '%s|%q|%s|%s|' "${event##*/}" "$name" "$(stat -Lc '%a:%u:%g:%t:%T' "$node" 2>/dev/null || true)" "$game_read"
      getfacl -cpn "$node" 2>/dev/null | LC_ALL=C sort | tr '\n' ','
      printf '\n'
    done | sort
  } | sha256sum | cut -d' ' -f1
}

remote_source_artifacts_digest() {
  {
    if [[ -d /dev/inputplumber/sources ]]; then
      find /dev/inputplumber/sources -mindepth 1 -maxdepth 2 -printf '%P|%y|%m|%u|%g|%D:%i\n' 2>/dev/null | sort
    else
      printf 'sources-directory=absent\n'
    fi
    printf 'temporary-dirty=%s\n' "$(remote_temporary_artifacts_dirty && printf yes || printf no)"
  } | sha256sum | cut -d' ' -f1
}

# Sanitized, exact predicates used for rollback and reconcile comparison.
remote_predicates() {
  local gameplay_user="$1"
  printf 'generation.current=%s\n' "$(remote_generation)"
  printf 'generation.default=%s\n' "$(readlink -f /nix/var/nix/profiles/system 2>/dev/null || true)"
  printf 'old-user.active=%s\n' "$(remote_user_unit_active && printf true || printf false)"
  printf 'old-user.enabled=%s\n' "$(systemctl --user is-enabled --quiet korrid.service 2>/dev/null && printf true || printf false)"
  printf 'topology.target=%s\n' "$(remote_topology_digest target)"
  printf 'topology.raw=%s\n' "$(remote_topology_digest raw)"
  printf 'input.acl-readability=%s\n' "$(remote_acl_digest "$gameplay_user")"
  printf 'input.sources-artifacts=%s\n' "$(remote_source_artifacts_digest)"
  printf 'inputplumber.active=%s\n' "$(remote_unit_value system inputplumber.service ActiveState)"
  printf 'inputplumber.enabled=%s\n' "$(remote_unit_value system inputplumber.service UnitFileState)"
  printf 'sunshine.active=%s\n' "$(remote_unit_value user sunshine.service ActiveState)"
  printf 'sunshine.enabled=%s\n' "$(remote_unit_value user sunshine.service UnitFileState)"
  printf 'catalog.health=%s\n' "$(remote_catalog_health)"
}

remote_unit_snapshot() {
  local scope="$1" unit="$2"
  printf '%s/%s LoadState=%s ActiveState=%s SubState=%s UnitFileState=%s StatusText=%s\n' \
    "$scope" "$unit" "$(remote_unit_value "$scope" "$unit" LoadState)" \
    "$(remote_unit_value "$scope" "$unit" ActiveState)" "$(remote_unit_value "$scope" "$unit" SubState)" \
    "$(remote_unit_value "$scope" "$unit" UnitFileState)" "$(remote_unit_value "$scope" "$unit" StatusText)"
}

remote_inspect() {
  local machine_id hostname
  machine_id="$(tr -d '\n' </etc/machine-id)"
  hostname="$(hostname)"
  printf 'identity machine-id=%s hostname=%s\n' "$machine_id" "$hostname"
  printf 'generation current=%s default=%s\n' "$(remote_generation)" "$(readlink -f /nix/var/nix/profiles/system 2>/dev/null || true)"
  printf '%s\n' 'units:'
  remote_unit_snapshot system inputplumber.service
  remote_unit_snapshot system korri-inputd.service
  remote_unit_snapshot system korrid.service
  remote_unit_snapshot user korrid.service
  remote_unit_snapshot user sunshine.service
  printf 'real-controller=%s temporary-artifacts-dirty=%s catalog=%s\n' \
    "$(remote_has_real_controller && printf yes || printf no)" \
    "$(remote_temporary_artifacts_dirty && printf yes || printf no)" "$(remote_catalog_health)"
}

remote_preflight() {
  local candidate="$1" rollback="$2" candidate_real rollback_real
  valid_generation_path "$candidate" && valid_generation_path "$rollback" || return 1
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
  remote_stop_old_user_unit
  sudo -n "$candidate/bin/switch-to-configuration" test
}

remote_restore() {
  local rollback="$1" old_active="$2" old_enabled="$3" persistent="$4"
  if [[ "$persistent" == true ]]; then
    sudo -n nix-env -p /nix/var/nix/profiles/system --set "$rollback"
    sudo -n "$rollback/bin/switch-to-configuration" switch
  else
    sudo -n "$rollback/bin/switch-to-configuration" test
  fi
  remote_restore_old_user_unit "$old_active" "$old_enabled"
  [[ "$(remote_generation)" == "$rollback" ]]
}

remote_automated_gates() {
  local gameplay_user="$1" fingerprint node event name readable_raw=0
  remote_wait_unit inputplumber.service
  remote_wait_unit korri-inputd.service Ready
  remote_wait_unit korrid.service
  fingerprint="$(remote_normalized_fingerprint)" || fail 'normalized target does not match the InputPlumber 0.75.2 xb360 fingerprint exactly'
  node="${fingerprint#node=}"
  node="${node%% *}"
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
  [[ "$(remote_catalog_health)" == Ok ]] || fail 'korrid catalog is unhealthy'
  printf 'automated-gates=pass raw-readable=0 inputd-status=Ready catalog=Ok\n'
  printf 'normalized-fingerprint=%s\n' "$fingerprint"
}

remote_rollback_gates() {
  remote_wait_unit inputplumber.service
  remote_temporary_artifacts_dirty && fail 'temporary U7 artifacts remain after rollback'
  [[ "$(remote_catalog_health)" == Ok ]] || fail 'rollback korrid catalog is unhealthy'
  printf 'rollback-gates=pass\n'
}

remote_inject_health_failure() {
  local rollback="$1" old_active="$2" old_enabled="$3" status='' attempt
  sudo -n systemctl stop inputplumber.service
  for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
    status="$(systemctl show korri-inputd.service -p StatusText --value 2>/dev/null || true)"
    [[ "$status" == Recovering || "$status" == Missing ]] && break
    sleep "$POLL_DELAY"
  done
  [[ "$status" == Recovering || "$status" == Missing ]] || return 1
  remote_restore "$rollback" "$old_active" "$old_enabled" false
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
    predicates) remote_predicates "${1:?}" ;;
    preflight) remote_preflight "${1:?}" "${2:?}" ;;
    boot-id) tr -d '\n' </proc/sys/kernel/random/boot_id ;;
    current-generation) remote_generation ;;
    normalized-fingerprint) remote_normalized_fingerprint ;;
    automated-gates) remote_automated_gates "${1:?}" ;;
    rollback-gates) remote_rollback_gates ;;
    activate-test) remote_activate_test "${1:?}" ;;
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
Modes: inspect, reconcile, candidate-test, inject-health-failure, rollback,
       rollback-reboot-verify, persistent-switch, candidate-reboot-verify
Mutation modes require --candidate, --rollback-generation, --gameplay-user,
--ledger, and --confirm. HITL tokens are accepted only from /dev/tty.
EOF
}

HOST='' EXPECTED_MACHINE_ID='' EXPECTED_HOSTNAME='' MODE=inspect
CANDIDATE='' ROLLBACK='' GAMEPLAY_USER='' LEDGER='' CONFIRM=''
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
    --help|-h) usage; exit 0 ;;
    *) usage; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$HOST" ]] || { usage; fail 'an explicit --host is required'; }
[[ -n "$EXPECTED_MACHINE_ID" && -n "$EXPECTED_HOSTNAME" ]] || fail 'explicit --expected-machine-id and --expected-hostname are required'
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'invalid host target'
[[ "$EXPECTED_MACHINE_ID" =~ ^[0-9a-f]{32}$ ]] || fail 'expected machine-id must be 32 lowercase hexadecimal characters'
[[ "$EXPECTED_HOSTNAME" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'invalid expected hostname'
[[ "$MUTATION_TIMEOUT" =~ ^[1-9][0-9]*$ && "$MUTATION_TIMEOUT" -le 600 ]] || fail 'mutation timeout must be 1 through 600 seconds'
case "$MODE" in
  inspect|reconcile|candidate-test|inject-health-failure|rollback|rollback-reboot-verify|persistent-switch|candidate-reboot-verify) ;;
  *) fail "unknown mode: $MODE" ;;
esac

[[ -z "$CANDIDATE" ]] || valid_generation_path "$CANDIDATE" || fail 'candidate must be a strictly valid Nix store generation path'
[[ -z "$ROLLBACK" ]] || valid_generation_path "$ROLLBACK" || fail 'rollback must be a strictly valid Nix store generation path'
if [[ "$MODE" != inspect ]]; then
  valid_generation_path "$CANDIDATE" || fail 'mutation and reconcile modes require a strictly valid Nix store candidate generation path'
  valid_generation_path "$ROLLBACK" || fail 'mutation and reconcile modes require a strictly valid Nix store rollback generation path'
  [[ -n "$GAMEPLAY_USER" && "$GAMEPLAY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'mutation and reconcile modes require an explicit gameplay user'
  [[ -n "$LEDGER" ]] || fail 'mutation and reconcile modes require a private --ledger directory outside the repository'
fi

ssh_options=(-o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=2)
remote_quote() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}
ssh_exec() {
  local command='' arg quoted
  for arg in "$@"; do
    quoted="$(remote_quote "$arg")"
    command+="${command:+ }$quoted"
  done
  "$SSH_BIN" "${ssh_options[@]}" "$HOST" "$command"
}

actual_machine_id="$(ssh_exec cat /etc/machine-id | tr -d '\r\n')" || fail 'could not read remote machine-id'
actual_hostname="$(ssh_exec hostname | tr -d '\r\n')" || fail 'could not read remote hostname'
[[ "$actual_machine_id" == "$EXPECTED_MACHINE_ID" ]] || fail "remote machine-id mismatch for $HOST"
[[ "$actual_hostname" == "$EXPECTED_HOSTNAME" ]] || fail "remote hostname mismatch for $HOST"

remote_dir='' remote_script='' local_temp_ledger=''
mutation_active=false rollback_persistent=false state_file='' old_user_was_active=false old_user_was_enabled=false
write_state() {
  local next="$1" boot_id="${2:-}" resume_state="${3:-}" attempt_nonce="${4:-}"
  {
    printf 'state=%s\n' "$next"
    printf 'machine_id=%s\n' "$actual_machine_id"
    printf 'hostname=%s\n' "$actual_hostname"
    printf 'candidate=%s\n' "$CANDIDATE"
    printf 'rollback=%s\n' "$ROLLBACK"
    printf 'boot_id=%s\n' "$boot_id"
    printf 'resume_state=%s\n' "$resume_state"
    printf 'attempt_nonce=%s\n' "$attempt_nonce"
  } >"$state_file.next"
  chmod 0600 "$state_file.next"
  mv -f "$state_file.next" "$state_file"
  sync -f "$state_file"
}

cleanup() {
  local status=$? rollback_ok=false
  trap - EXIT INT TERM
  set +e
  if [[ "$mutation_active" == true && -n "$remote_script" && -n "$ROLLBACK" ]]; then
    if timeout --signal=TERM --kill-after=5s "${MUTATION_TIMEOUT}s" \
      "$SSH_BIN" "${ssh_options[@]}" "$HOST" "$(remote_quote "$remote_script") $(remote_quote --remote) $(remote_quote restore) $(remote_quote "$ROLLBACK") $(remote_quote "$old_user_was_active") $(remote_quote "$old_user_was_enabled") $(remote_quote "$rollback_persistent")" >/dev/null 2>&1; then
      rollback_ok=true
    else
      printf 'device gate: cleanup rollback failed; inspect the recorded rollback generation without retrying mutation\n' >&2
    fi
    if [[ -n "$state_file" ]]; then
      write_state failed-needs-inspection '' "${resume_after_failure:-}" ''
      printf 'device gate: mutation failed; fresh reconcile is required before retry (rollback=%s)\n' "$rollback_ok" >&2
    fi
  fi
  [[ -z "$remote_dir" ]] || ssh_exec rm -rf -- "$remote_dir" >/dev/null 2>&1 || true
  [[ -z "$local_temp_ledger" ]] || rm -rf -- "$local_temp_ledger"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

remote_dir="$(ssh_exec mktemp -d /tmp/korri-device-gate.XXXXXX)"
[[ "$remote_dir" =~ ^/tmp/korri-device-gate\.[A-Za-z0-9]+$ ]] || fail 'remote mktemp returned an unexpected path'
remote_script="$remote_dir/device-check.sh"
"$SCP_BIN" "${ssh_options[@]}" -- "$0" "$HOST:$remote_script" >/dev/null
run_remote() { ssh_exec "$remote_script" --remote "$@"; }
run_remote_mutation() {
  local command='' arg quoted
  for arg in "$remote_script" --remote "$@"; do
    quoted="$(remote_quote "$arg")"
    command+="${command:+ }$quoted"
  done
  timeout --signal=TERM --kill-after=5s "${MUTATION_TIMEOUT}s" \
    "$SSH_BIN" "${ssh_options[@]}" "$HOST" "$command"
}

if [[ "$MODE" == inspect ]]; then
  [[ -z "$CONFIRM$CANDIDATE$ROLLBACK$GAMEPLAY_USER$LEDGER" ]] || fail 'inspect mode refuses mutation-only arguments'
  umask 077
  local_temp_ledger="$(mktemp -d "${TMPDIR:-/tmp}/korri-device-inspect.XXXXXX")"
  run_remote inspect >"$local_temp_ledger/inspection.txt"
  chmod 0600 "$local_temp_ledger/inspection.txt"
  cat "$local_temp_ledger/inspection.txt"
  printf 'inspection=complete mutation=none ledger=private-temporary\n'
  exit 0
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ledger_parent="$(dirname "$LEDGER")"
mkdir -p "$ledger_parent"
ledger_parent="$(cd "$ledger_parent" && pwd -P)"
LEDGER="$ledger_parent/$(basename "$LEDGER")"
case "$LEDGER/" in "$root/"*) fail 'ledger must be outside the repository' ;; esac
if [[ -e "$LEDGER" ]]; then
  [[ -d "$LEDGER" && ! -L "$LEDGER" && "$(stat -c %a "$LEDGER")" == 700 ]] || fail 'existing ledger must be a real mode 0700 directory'
else
  mkdir -m 0700 "$LEDGER"
fi
umask 077
state_file="$LEDGER/state"
state="$(awk -F= '$1 == "state" {print $2}' "$state_file" 2>/dev/null || true)"
if [[ -n "$state" ]]; then
  grep -Fx "machine_id=$actual_machine_id" "$state_file" >/dev/null || fail 'ledger machine identity differs from target'
  grep -Fx "hostname=$actual_hostname" "$state_file" >/dev/null || fail 'ledger hostname differs from target'
  grep -Fx "candidate=$CANDIDATE" "$state_file" >/dev/null || fail 'ledger candidate differs from request'
  grep -Fx "rollback=$ROLLBACK" "$state_file" >/dev/null || fail 'ledger rollback differs from request'
fi

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
if [[ "$MODE" != reconcile && "$CONFIRM" != "$expected_confirm" ]]; then
  printf 'Required confirmation for host=%s candidate=%s: %s\n' "$actual_hostname" "$CANDIDATE" "$expected_confirm" >&2
  fail 'mutation confirmation token is missing or does not match the captured host and candidate generation'
fi

if [[ ! -f "$LEDGER/baseline.predicates" ]]; then
  [[ -z "$state" ]] || fail 'ledger state exists without baseline predicates'
  run_remote predicates "$GAMEPLAY_USER" >"$LEDGER/baseline.predicates"
  chmod 0600 "$LEDGER/baseline.predicates"
  grep -Fx "generation.current=$ROLLBACK" "$LEDGER/baseline.predicates" >/dev/null || fail 'baseline current generation is not the rollback generation'
  grep -Fx "generation.default=$ROLLBACK" "$LEDGER/baseline.predicates" >/dev/null || fail 'baseline default generation is not the rollback generation'
  run_remote inspect >"$LEDGER/baseline.txt"
  chmod 0600 "$LEDGER/baseline.txt"
  sync -f "$LEDGER/baseline.predicates"
  sync -f "$LEDGER/baseline.txt"
fi
old_user_was_active="$(awk -F= '$1 == "old-user.active" {print $2}' "$LEDGER/baseline.predicates")"
old_user_was_enabled="$(awk -F= '$1 == "old-user.enabled" {print $2}' "$LEDGER/baseline.predicates")"
[[ "$old_user_was_active" == true || "$old_user_was_active" == false ]] || fail 'invalid baseline old user active predicate'
[[ "$old_user_was_enabled" == true || "$old_user_was_enabled" == false ]] || fail 'invalid baseline old user enabled predicate'

compare_baseline() {
  run_remote predicates "$GAMEPLAY_USER" >"$LEDGER/current.predicates.next"
  chmod 0600 "$LEDGER/current.predicates.next"
  if ! cmp -s "$LEDGER/baseline.predicates" "$LEDGER/current.predicates.next"; then
    mv -f "$LEDGER/current.predicates.next" "$LEDGER/current.predicates"
    fail 'rollback predicates differ from the sanitized baseline; inspection is required'
  fi
  rm -f "$LEDGER/current.predicates.next" "$LEDGER/current.predicates"
}

if [[ "$MODE" == reconcile ]]; then
  [[ "$state" == failed-needs-inspection ]] || fail 'reconcile requires failed-needs-inspection ledger state'
  [[ "$(run_remote current-generation)" == "$ROLLBACK" ]] || fail 'reconcile requires the rollback generation to be active'
  compare_baseline
  resume="$(awk -F= '$1 == "resume_state" {print $2}' "$state_file")"
  write_state "$resume"
  printf 'device-gate mode=reconcile state=%s host=%s mutation=none\n' "${resume:-baseline}" "$actual_hostname"
  exit 0
fi
[[ "$state" != failed-needs-inspection && "$state" != pending-mutation ]] || fail 'fresh reconcile is required before retry'

hitl_gates=(normalized-gameplay health-recovery-ambiguity dbus-spoof-and-exclusive-grab exact-stop-and-races direct-action-isolation sunshine-video-controller-recovery catalog-and-session)
new_attempt_after_activation() {
  local ledger_state="$1"
  attempt_nonce="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  [[ "$attempt_nonce" =~ ^[0-9a-f]{64}$ ]] || fail 'could not generate attempt nonce'
  write_state "$ledger_state" "$attempt_boot_id" "$resume_after_failure" "$attempt_nonce"
}
require_hitl() {
  local ledger_state="$1" gate expected supplied consumed_key
  [[ -r /dev/tty && -w /dev/tty ]] || fail 'HITL stages require an interactive terminal'
  for gate in "${hitl_gates[@]}"; do
    consumed_key="$attempt_nonce|$attempt_boot_id|$ledger_state|$gate"
    grep -Fqx "$consumed_key" "$LEDGER/consumed-gates" 2>/dev/null && fail "HITL token was already consumed: $gate"
    expected="PASS-$(printf '%s' "$actual_machine_id|$actual_hostname|$CANDIDATE|$attempt_nonce|$attempt_boot_id|$ledger_state|$gate" | sha256sum | cut -c1-16)"
    printf 'HITL stage: %s\nRequired one-time token: %s\n' "$gate" "$expected" >&2
    printf 'Complete the documented stage now, then enter its token: ' >/dev/tty
    IFS= read -r supplied </dev/tty
    [[ "$supplied" == "$expected" ]] || fail "HITL stage is not confirmed: $gate"
    printf '%s\n' "$consumed_key" >>"$LEDGER/consumed-gates"
    chmod 0600 "$LEDGER/consumed-gates"
    sync -f "$LEDGER/consumed-gates"
  done
}

resume_after_failure="$state"
begin_mutation() {
  rollback_persistent="$1"
  attempt_boot_id="$(run_remote boot-id)"
  write_state pending-mutation "$attempt_boot_id" "$resume_after_failure" ''
  mutation_active=true
}
accept_and_disarm() {
  write_state "$1" "${2:-}"
  mutation_active=false
}
verify_fingerprint_unchanged() {
  local evidence="$1"
  awk -F= '$1 == "normalized-fingerprint" {print substr($0, index($0, "=") + 1)}' "$evidence" >"$LEDGER/fingerprint.expected"
  run_remote normalized-fingerprint >"$LEDGER/fingerprint.current"
  cmp -s "$LEDGER/fingerprint.expected" "$LEDGER/fingerprint.current" || fail 'normalized target was replaced before acceptance'
  chmod 0600 "$LEDGER/fingerprint.expected" "$LEDGER/fingerprint.current"
}

case "$MODE" in
  candidate-test)
    [[ -z "$state" || "$state" == candidate-green ]] || fail "candidate-test cannot follow ledger state $state"
    begin_mutation false
    run_remote_mutation activate-test "$CANDIDATE"
    new_attempt_after_activation pending-mutation
    run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/candidate-automated.txt"
    require_hitl pending-mutation
    verify_fingerprint_unchanged "$LEDGER/candidate-automated.txt"
    run_remote_mutation restore "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled" false
    compare_baseline
    accept_and_disarm candidate-green "$attempt_boot_id"
    ;;
  inject-health-failure)
    [[ "$state" == candidate-green ]] || fail 'injected failure requires candidate-green ledger state'
    begin_mutation false
    run_remote_mutation activate-test "$CANDIDATE"
    new_attempt_after_activation pending-mutation
    run_remote_mutation inject-health-failure "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled"
    compare_baseline
    accept_and_disarm automatic-rollback-green "$attempt_boot_id"
    ;;
  rollback)
    [[ "$state" == automatic-rollback-green ]] || fail 'explicit rollback requires automatic-rollback-green ledger state'
    begin_mutation true
    run_remote_mutation activate-test "$CANDIDATE"
    new_attempt_after_activation pending-mutation
    run_remote_mutation restore "$ROLLBACK" "$old_user_was_active" "$old_user_was_enabled" true
    compare_baseline
    accept_and_disarm rollback-await-reboot "$attempt_boot_id"
    ;;
  rollback-reboot-verify)
    [[ "$state" == rollback-await-reboot ]] || fail 'rollback reboot verification requires rollback-await-reboot ledger state'
    prior_boot="$(awk -F= '$1 == "boot_id" {print $2}' "$state_file")"
    current_boot="$(run_remote boot-id)"
    [[ "$current_boot" != "$prior_boot" ]] || fail 'rollback reboot verification requires a new boot ID'
    [[ "$(run_remote current-generation)" == "$ROLLBACK" ]] || fail 'rebooted system is not the rollback generation'
    run_remote rollback-gates | tee "$LEDGER/rollback-reboot.txt"
    compare_baseline
    write_state rollback-reboot-green "$current_boot"
    ;;
  persistent-switch)
    if [[ "$state" == candidate-accepted-pending-boot ]]; then
      current_boot="$(run_remote boot-id)"
      write_state candidate-await-reboot "$current_boot"
    else
      [[ "$state" == rollback-reboot-green ]] || fail 'persistent switch requires rollback-reboot-green ledger state'
      begin_mutation true
      run_remote_mutation persistent-switch "$CANDIDATE"
      new_attempt_after_activation pending-mutation
      run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/persistent-automated.txt"
      require_hitl pending-mutation
      verify_fingerprint_unchanged "$LEDGER/persistent-automated.txt"
      # This durable accepted state makes a failed boot-ID fetch resumable.
      write_state candidate-accepted-pending-boot '' '' ''
      mutation_active=false
      current_boot="$(run_remote boot-id)"
      write_state candidate-await-reboot "$current_boot"
    fi
    ;;
  candidate-reboot-verify)
    [[ "$state" == candidate-await-reboot ]] || fail 'candidate reboot verification requires candidate-await-reboot ledger state'
    prior_boot="$(awk -F= '$1 == "boot_id" {print $2}' "$state_file")"
    current_boot="$(run_remote boot-id)"
    [[ "$current_boot" != "$prior_boot" ]] || fail 'candidate reboot verification requires a new boot ID'
    [[ "$(run_remote current-generation)" == "$CANDIDATE" ]] || fail 'rebooted system is not the candidate generation'
    resume_after_failure="$state"
    attempt_nonce="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    attempt_boot_id="$current_boot"
    write_state candidate-reboot-verifying "$current_boot" "$state" "$attempt_nonce"
    run_remote automated-gates "$GAMEPLAY_USER" | tee "$LEDGER/candidate-reboot.txt"
    require_hitl candidate-reboot-verifying
    verify_fingerprint_unchanged "$LEDGER/candidate-reboot.txt"
    write_state complete "$current_boot"
    ;;
esac

printf 'device-gate mode=%s state=%s host=%s mutation=confirmed\n' "$MODE" "$(awk -F= '$1 == "state" {print $2}' "$state_file")" "$actual_hostname"
