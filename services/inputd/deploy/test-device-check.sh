#!/usr/bin/env bash
set -Eeuo pipefail

# This file is also the modeled SSH endpoint used by the tests below.
case "$(basename "$0")" in
  id)
    if [[ "${1:-}" == -u && -n "${2:-}" ]]; then
      [[ "$2" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]] || exit 1
      printf '%s\n' "${HARNESS_GAMEPLAY_UID:-1000}"
      exit 0
    fi
    [[ "${1:-}" == -u ]] && printf '%s\n' "${HARNESS_CALLER_UID:-0}" && exit 0
    exit 1
    ;;
  sudo)
    [[ "${1:-}" == -n ]] || exit 1
    shift
    [[ "${1:-}" == -u && "${2:-}" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]] || exit 1
    [[ "${HARNESS_SUDO_DENY:-no}" != yes ]] || exit 1
    printf 'sudo-user=%s caller=%s argv=' "$2" "${HARNESS_CALLER_UID:-0}" >>"${HARNESS_USER_SCOPE_LOG:?}"
    printf '%q ' "$@" >>"$HARNESS_USER_SCOPE_LOG"
    printf '\n' >>"$HARNESS_USER_SCOPE_LOG"
    shift 2
    export HARNESS_MODELED_USER=gameplay
    exec "$@"
    ;;
  getent|user-scope-getent)
    case "${1:-}" in
      passwd) printf 'gameplay:x:1000:1000::%s:/bin/sh\n' "${HARNESS_GAMEPLAY_HOME:?}" ;;
      group) printf '%s:x:%s:\n' "${2:-gameplay}" "${2:-1000}" ;;
      *) exit 1 ;;
    esac
    exit 0
    ;;
  systemctl)
    scope=system property='' unit=''
    for arg in "$@"; do
      [[ "$arg" != --user ]] || scope=user
      [[ "$arg" != *.service ]] || unit="$arg"
    done
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == -p ]]; then
        property="${2:-}"
        break
      fi
      shift
    done
    if [[ "$scope" == user ]]; then
      [[ "${HARNESS_MODELED_USER:-root}" == gameplay ]] || exit 1
      [[ "${XDG_RUNTIME_DIR:-}" == "/run/user/${HARNESS_GAMEPLAY_UID:-1000}" ]] || exit 1
      [[ "${DBUS_SESSION_BUS_ADDRESS:-}" == "unix:path=/run/user/${HARNESS_GAMEPLAY_UID:-1000}/bus" ]] || exit 1
      printf 'systemctl-user=%s property=%s runtime=%s bus=%s\n' \
        "$unit" "$property" "$XDG_RUNTIME_DIR" "$DBUS_SESSION_BUS_ADDRESS" >>"${HARNESS_USER_SCOPE_LOG:?}"
      [[ "${HARNESS_USER_QUERY_ERROR:-}" != "$property:$unit" \
        && "${HARNESS_USER_QUERY_ERROR:-}" != all ]] || exit 69
      active="${HARNESS_USER_ACTIVE_STATE:-active}"
      enabled="${HARNESS_USER_ENABLED_STATE:-enabled}"
    else
      active=active enabled=enabled
    fi
    case "$property" in
      ActiveState) printf '%s\n' "$active" ;;
      UnitFileState) printf '%s\n' "$enabled" ;;
      LoadState) printf 'loaded\n' ;;
      SubState) printf 'running\n' ;;
      StatusText) printf '\n' ;;
    esac
    exit 0
    ;;
  ssh-command-harness)
    command="${*: -1}"
    printf 'ssh-command=%s\n' "$command" >>"$HARNESS_LOG"
    # Model the remote login shell. If production quoting regresses, this eval
    # makes the adversarial tests execute their sentinel and fail.
    eval "set -- $command"
    transport_deadlined=false
    if [[ "${1:-}" == timeout ]]; then
      transport_deadlined=true
      shift
      while [[ "${1:-}" == -* ]]; do shift; done
      [[ "${1:-}" =~ ^[0-9]+s$ ]] || exit 72
      shift
    fi
    if [[ "$transport_deadlined" != true ]]; then
      if [[ "${2:-}" != --remote || ! "${3:-}" =~ ^(deadline|locked-root|attempt-command)$ ]]; then
        printf 'bare SSH operation without a remote deadline\n' >&2
        exit 73
      fi
    fi
    if [[ "${1:-}" == stat && "${*: -1}" == */sw/bin/korri-device-gate ]]; then
      printf '%s\n' "${HARNESS_HELPER_STAT:-0:555}"
      exit 0
    fi
    if [[ "${1:-}" == sha256sum && "${*: -1}" == */sw/bin/korri-device-gate ]]; then
      digest="$(sha256sum "${HARNESS_GATE_SOURCE:?}" | awk '{print $1}')"
      [[ "${HARNESS_HELPER_DIGEST:-valid}" == valid ]] || digest=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
      printf '%s  %s\n' "$digest" "${*: -1}"
      exit 0
    fi
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
      helper_path="$1"
      action="${3:-}"
      shift 3
      wrapper=direct lock_owned=false
      if [[ "$action" == deadline ]]; then
        wrapper=deadline
        remote_deadline="$1"
        action="$2"
        shift 2
      elif [[ "$action" == locked-root ]]; then
        wrapper=locked-root
        remote_deadline="$1"
        lock_wait="$2"
        action="$3"
        shift 3
      elif [[ "$action" == attempt-command ]]; then
        wrapper=attempt-command
        remote_deadline="$1"
        lock_wait="$2"
        attempt_nonce="$3"
        attempt_candidate="$4"
        action="$5"
        shift 5
      fi
      if [[ "$wrapper" == locked-root || "$wrapper" == attempt-command ]]; then
        lock_dir="${HARNESS_GATE_LOCK:-$HARNESS_LOG.lock}"
        for _ in $(seq 1 500); do
          if mkdir "$lock_dir" 2>/dev/null; then
            lock_owned=true
            break
          fi
          printf 'lock-wait action=%s\n' "$action" >>"$HARNESS_LOG"
          sleep 0.01
        done
        [[ "$lock_owned" == true ]] || {
          printf 'modeled root gate lock timeout for %s\n' "$action" >&2
          exit 75
        }
        trap '[[ "$lock_owned" != true ]] || rmdir "$lock_dir" 2>/dev/null || true' EXIT
      fi
      if [[ "$wrapper" == attempt-command ]]; then
        grep -Fx "nonce=$attempt_nonce" "$HARNESS_ATTEMPT_MARKER" >/dev/null 2>&1 \
          && grep -Fx "candidate=$attempt_candidate" "$HARNESS_ATTEMPT_MARKER" >/dev/null 2>&1 \
          && [[ -e "$HARNESS_ATTEMPT_LEASE" ]] || {
            printf 'modeled attempt marker validation failed\n' >&2
            exit 76
          }
      fi
      case "$action" in
        acceptance-fingerprint|automated-gates|rollback-gates|activate-test|inject-health-failure|restore|persistent-switch)
          if [[ "$wrapper" != attempt-command \
            || "$helper_path" != "$attempt_candidate/sw/bin/korri-device-gate" ]]; then
            printf 'root mutation or gate argv did not name the candidate store helper\n' >&2
            exit 79
          fi
          ;;
        predicates|boot-id|current-generation)
          if [[ "$wrapper" == attempt-command \
            && "$helper_path" != "$attempt_candidate/sw/bin/korri-device-gate" ]]; then
            printf 'root attempt argv did not name the candidate store helper\n' >&2
            exit 79
          fi
          ;;
      esac
      {
        printf 'helper=%q wrapper=%s remote-deadline=%s lock-wait=%s action=%s argv=' \
          "$helper_path" "$wrapper" "${remote_deadline:-none}" "${lock_wait:-none}" "$action"
        printf '%q ' "$@"
        printf '\n'
      } >>"$HARNESS_LOG"
      case "$action" in
        attempt-start-root)
          nonce="$1" candidate="$2"
          if [[ -e "$HARNESS_ATTEMPT_MARKER" || -e "$HARNESS_ATTEMPT_LEASE" ]]; then
            printf 'device gate: another device-gate attempt marker already exists\n' >&2
            exit 77
          fi
          if [[ "${HARNESS_ATTEMPT_START_PAUSE:-}" == pre-marker ]]; then
            : >"${HARNESS_PAUSE_MARKER:?}"
            sleep "${HARNESS_PAUSE_SECONDS:-30}"
          fi
          printf 'nonce=%s\ncandidate=%s\n' "$nonce" "$candidate" >"$HARNESS_ATTEMPT_MARKER"
          : >"$HARNESS_ATTEMPT_LEASE"
          if [[ "${HARNESS_ATTEMPT_START_PAUSE:-}" == post-marker ]]; then
            : >"${HARNESS_PAUSE_MARKER:?}"
            sleep "${HARNESS_PAUSE_SECONDS:-30}"
          fi
          exit 0
          ;;
        attempt-finish-root)
          grep -Fx "nonce=$1" "$HARNESS_ATTEMPT_MARKER" >/dev/null \
            && grep -Fx "candidate=$2" "$HARNESS_ATTEMPT_MARKER" >/dev/null || exit 76
          rm -f "$HARNESS_ATTEMPT_LEASE" "$HARNESS_ATTEMPT_MARKER"
          exit 0
          ;;
        attempt-reconcile-root)
          if [[ ! -e "$HARNESS_ATTEMPT_MARKER" ]]; then
            [[ "${3:-false}" == false ]] || {
              printf 'device gate: in-progress device-gate marker is missing\n' >&2
              exit 76
            }
            exit 0
          fi
          if ! grep -Fx "nonce=$1" "$HARNESS_ATTEMPT_MARKER" >/dev/null \
            || ! grep -Fx "candidate=$2" "$HARNESS_ATTEMPT_MARKER" >/dev/null; then
            printf 'device gate: stale device-gate marker does not match this private attempt\n' >&2
            exit 76
          fi
          [[ ! -e "$HARNESS_ATTEMPT_LEASE" ]] || {
            printf 'device gate: device-gate attempt is still live; reconcile refuses to race it\n' >&2
            exit 78
          }
          rm -f "$HARNESS_ATTEMPT_MARKER"
          exit 0
          ;;
      esac
      if [[ "${HARNESS_PAUSE_ACTION:-}" == "$action" ]]; then
        : >"${HARNESS_PAUSE_MARKER:?}"
        sleep "${HARNESS_PAUSE_SECONDS:-30}"
      fi
      if [[ "${HARNESS_FAIL_ACTION_ONCE:-}" == "$action" ]]; then
        fail_marker="${HARNESS_FAIL_ACTION_MARKER:?}"
        if [[ ! -e "$fail_marker" ]]; then
          : >"$fail_marker"
          printf 'modeled transient SSH failure for %s\n' "$action" >&2
          exit 255
        fi
      fi
      case "$action" in
        inspect)
          [[ "${1:-}" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]] || exit 87
          printf 'identity machine-id=%s hostname=%s\n' \
            "${HARNESS_MACHINE_ID:-0123456789abcdef0123456789abcdef}" \
            "${HARNESS_HOSTNAME:-u7-test-host}"
          printf 'generation current=%s default=%s\n' "$ROLLBACK" "$ROLLBACK"
          printf 'units:\nsystem/inputplumber.service LoadState=loaded ActiveState=active SubState=running UnitFileState=enabled StatusText=\n'
          printf 'user/korrid.service LoadState=loaded ActiveState=inactive SubState=dead UnitFileState=disabled StatusText=\n'
          old_sunshine_active="${HARNESS_OLD_SUNSHINE_ACTIVE:-true}"
          old_sunshine_enabled="${HARNESS_OLD_SUNSHINE_ENABLED:-true}"
          old_x11_active="${HARNESS_OLD_X11_ACTIVE:-true}"
          old_x11_enabled="${HARNESS_OLD_X11_ENABLED:-true}"
          [[ "$old_sunshine_active" != true ]] || old_sunshine_active=active
          [[ "$old_sunshine_active" != false ]] || old_sunshine_active=inactive
          [[ "$old_sunshine_enabled" != true ]] || old_sunshine_enabled=enabled
          [[ "$old_sunshine_enabled" != false ]] || old_sunshine_enabled=disabled
          [[ "$old_x11_active" != true ]] || old_x11_active=active
          [[ "$old_x11_active" != false ]] || old_x11_active=inactive
          [[ "$old_x11_enabled" != true ]] || old_x11_enabled=enabled
          [[ "$old_x11_enabled" != false ]] || old_x11_enabled=disabled
          printf 'system/sunshine.service LoadState=loaded ActiveState=%s SubState=dead UnitFileState=%s StatusText=\n' \
            "${HARNESS_SYSTEM_SUNSHINE_ACTIVE:-inactive}" "${HARNESS_SYSTEM_SUNSHINE_ENABLED:-disabled}"
          printf 'system/x11-headless.service LoadState=loaded ActiveState=%s SubState=dead UnitFileState=%s StatusText=\n' \
            "${HARNESS_SYSTEM_X11_ACTIVE:-inactive}" "${HARNESS_SYSTEM_X11_ENABLED:-disabled}"
          printf 'user/sunshine.service LoadState=loaded ActiveState=%s SubState=running UnitFileState=%s StatusText=\n' \
            "$old_sunshine_active" "$old_sunshine_enabled"
          printf 'user/x11-headless.service LoadState=loaded ActiveState=%s SubState=running UnitFileState=%s StatusText=\n' \
            "$old_x11_active" "$old_x11_enabled"
          printf 'temporary-artifacts-dirty=%s catalog=Ok\n' "${HARNESS_DIRTY:-no}"
          printf 'physical-controller-candidates:\n'
          printf 'controller-candidate identity=%s name=Observed_Controller sysfs=/sys/devices/pci0000:00/input/input8/event8 event=event8\n' \
            "${HARNESS_CONTROLLER_ID:-0003:045e:02ea:050b}"
          ;;
        predicates)
          if [[ "${1:-}" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]]; then
            printf 'predicates-user=gameplay wrapper=%s\n' "$wrapper" >>"$HARNESS_LOG"
          else
            printf 'predicates-user=root wrapper=%s\n' "$wrapper" >>"$HARNESS_LOG"
          fi
          printf 'generation.current=%s\n' "${HARNESS_PREDICATE_GENERATION:-$ROLLBACK}"
          printf 'generation.default=%s\n' "${HARNESS_PREDICATE_DEFAULT:-$ROLLBACK}"
          printf 'old-user.korrid.active=%s\n' "${HARNESS_OLD_KORRID_ACTIVE:-${HARNESS_OLD_ACTIVE:-false}}"
          printf 'old-user.korrid.enabled=%s\n' "${HARNESS_OLD_KORRID_ENABLED:-${HARNESS_OLD_ENABLED:-false}}"
          printf 'old-user.sunshine.active=%s\n' "${HARNESS_OLD_SUNSHINE_ACTIVE:-true}"
          printf 'old-user.sunshine.enabled=%s\n' "${HARNESS_OLD_SUNSHINE_ENABLED:-true}"
          printf 'old-user.x11-headless.active=%s\n' "${HARNESS_OLD_X11_ACTIVE:-true}"
          printf 'old-user.x11-headless.enabled=%s\n' "${HARNESS_OLD_X11_ENABLED:-true}"
          printf 'system.korrid.active=%s\n' "${HARNESS_SYSTEM_KORRID_ACTIVE:-inactive}"
          printf 'system.korrid.enabled=%s\n' "${HARNESS_SYSTEM_KORRID_ENABLED:-disabled}"
          printf 'system.sunshine.active=%s\n' "${HARNESS_SYSTEM_SUNSHINE_ACTIVE:-inactive}"
          printf 'system.sunshine.enabled=%s\n' "${HARNESS_SYSTEM_SUNSHINE_ENABLED:-disabled}"
          printf 'system.x11-headless.active=%s\n' "${HARNESS_SYSTEM_X11_ACTIVE:-inactive}"
          printf 'system.x11-headless.enabled=%s\n' "${HARNESS_SYSTEM_X11_ENABLED:-disabled}"
          printf 'topology.target=%s\n' "${HARNESS_TARGET_TOPOLOGY:-target-baseline}"
          printf 'topology.raw=%s\n' "${HARNESS_RAW_TOPOLOGY:-raw-baseline}"
          printf 'input.acl-readability=%s\n' "${HARNESS_ACL_BASELINE:-acl-baseline}"
          printf 'input.sources-artifacts=%s\n' "${HARNESS_ARTIFACTS_BASELINE:-artifacts-clean}"
          printf 'inputplumber.active=%s\n' "${HARNESS_IP_ACTIVE:-active}"
          printf 'inputplumber.enabled=%s\n' "${HARNESS_IP_ENABLED:-enabled}"
          printf 'sunshine.pairing-state-modes=%s\n' "${HARNESS_PAIRING_MODES:-700:600}"
          printf 'sunshine.pairing-state-present=%s\n' "${HARNESS_PAIRING_PRESENT:-true}"
          printf 'catalog.health=%s\n' "${HARNESS_CATALOG:-Ok}"
          ;;
        preflight)
          candidate="$1"
          rollback="$2"
          printf 'candidate=%s\n' "$candidate"
          printf 'candidate-switch=%s\n' "${HARNESS_CANDIDATE_SWITCH:-yes}"
          printf 'rollback=%s\n' "$rollback"
          printf 'rollback-switch=%s\n' "${HARNESS_ROLLBACK_SWITCH:-yes}"
          expected_identity="${3:-}"
          profile="${4:-}"
          printf 'temporary-artifacts-dirty=%s\n' "${HARNESS_DIRTY:-no}"
          if [[ -n "$expected_identity" && -n "$profile" ]]; then
            if [[ "${HARNESS_CONTROLLER_MODEL:-valid}" == valid \
              && "$expected_identity" == "${HARNESS_CONTROLLER_ID:-0003:045e:02ea:050b}" \
              && "$profile" == korri-60-xbox_one_gamepad.yaml ]]; then
              printf 'expected-controller=yes\n'
              printf 'controller-evidence=identity=%s event=event8 sysfs=/sys/devices/pci0000:00/input/input8/event8 profile=%s\n' "$expected_identity" "$profile"
            else
              printf 'expected-controller=no\n'
            fi
          fi
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
          expected_identity="${2:-}"
          profile="${3:-}"
          require_physical="${4:-false}"
          if [[ "${HARNESS_AUTOMATED_INTERRUPT:-no}" == yes ]]; then
            printf 'modeled interruption immediately after activation\n' >&2
            exit 130
          fi
          [[ "${HARNESS_STALE_MANAGER_CREDENTIALS:-no}" != yes ]] || {
            printf 'device gate: fresh gameplay user manager retains forbidden group: input\n' >&2
            exit 80
          }
          [[ -z "${HARNESS_CREDENTIAL_FAILURE:-}" ]] || {
            printf 'device gate: modeled /proc Groups credential rejection: %s\n' "$HARNESS_CREDENTIAL_FAILURE" >&2
            exit 85
          }
          [[ "${HARNESS_PAIRING_PRESENT:-true}" == true ]] || {
            printf 'device gate: Sunshine pairing-state file is absent\n' >&2
            exit 81
          }
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
          if [[ -n "${HARNESS_TOPOLOGY_FIXTURE:-}" ]]; then
            normalized_node=''
            readable_raw=0
            while IFS='|' read -r fixture_node fixture_name fixture_provenance fixture_joystick fixture_readable; do
              [[ -n "$fixture_node" && "$fixture_node" != \#* ]] || continue
              [[ "$fixture_name" == 'Microsoft X-Box 360 pad' ]] || exit 62
              if [[ "$fixture_provenance" == normalized-inputplumber ]]; then
                [[ -z "$normalized_node" ]] || exit 61
                normalized_node="$fixture_node"
                continue
              fi
              if [[ "$fixture_joystick" == yes && "$fixture_readable" == yes ]]; then
                readable_raw=$((readable_raw + 1))
              fi
            done <"$HARNESS_TOPOLOGY_FIXTURE"
            [[ "$normalized_node" == /dev/input/event9 ]] || exit 62
            [[ "$readable_raw" -eq 0 ]] || {
              printf 'device gate: gameplay user can read %s raw controller node(s)\n' "$readable_raw" >&2
              exit 63
            }
          fi
          [[ "${HARNESS_DELEGATE:-yes}" == yes ]] || {
            printf 'device gate: inputd Delegate is not enabled\n' >&2
            exit 66
          }
          [[ " ${HARNESS_DELEGATE_CONTROLLERS:-cpu pids memory} " == *' pids '* ]] || {
            printf 'device gate: inputd DelegateControllers does not contain pids\n' >&2
            exit 67
          }
          if [[ "$require_physical" == true ]]; then
            [[ "${HARNESS_CONTROLLER_MODEL:-valid}" == valid \
              && "$expected_identity" == "${HARNESS_CONTROLLER_ID:-0003:045e:02ea:050b}" \
              && "$profile" == korri-60-xbox_one_gamepad.yaml ]] || {
              printf 'expected physical controller is not live, supported, and selected with the production profile\n' >&2
              exit 68
            }
          fi
          [[ "${HARNESS_CATALOG:-Ok}" == Ok ]] || exit 64
          normalized="${HARNESS_FINGERPRINT:-node=/dev/input/event9 sysfs=/sys/devices/virtual/input/input9/event9 dev=13:73 inode=1:9 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes}"
          physical="identity=$expected_identity event=event8 sysfs=/sys/devices/pci0000:00/input/input8/event8 profile=$profile"
          printf 'automated-gates=pass raw-readable=0 inputd-status=Ready system-korrid=active system-x11-headless=active system-sunshine=active pairing-state=present credentials=service-specific catalog=Ok delegate=yes controllers=pids\n'
          printf 'normalized-fingerprint=%s\n' "$normalized"
          [[ "$require_physical" != true ]] || printf 'controller-evidence=%s\n' "$physical"
          printf 'acceptance-fingerprint=normalized=%s' "$normalized"
          [[ "$require_physical" != true ]] || printf ' physical=%s' "$physical"
          printf '\n'
          ;;
        acceptance-fingerprint)
          expected_identity="${1:-}"
          profile="${2:-}"
          require_physical="${3:-false}"
          if [[ "${HARNESS_REPLACE_TARGET:-no}" == yes ]]; then
            normalized='node=/dev/input/event10 sysfs=/sys/devices/virtual/input/input10/event10 dev=13:74 inode=1:10 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes'
          else
            normalized="${HARNESS_FINGERPRINT:-node=/dev/input/event9 sysfs=/sys/devices/virtual/input/input9/event9 dev=13:73 inode=1:9 inputplumber=/nix/store/provider/bin/inputplumber version=0.75.2 keys=exact abs=exact ff=yes}"
          fi
          printf 'normalized=%s' "$normalized"
          if [[ "$require_physical" == true ]]; then
            [[ "${HARNESS_CONTROLLER_MODEL:-valid}" == valid ]] || exit 68
            printf ' physical=identity=%s event=event8 sysfs=/sys/devices/pci0000:00/input/input8/event8 profile=%s' "$expected_identity" "$profile"
          fi
          printf '\n'
          ;;
        rollback-gates)
          printf 'rollback-gates=pass\n'
          ;;
        activate-test|inject-health-failure|restore|persistent-switch)
          grep -Fx 'state=pending-mutation' "$HARNESS_LEDGER/state" >/dev/null || {
            printf 'mutation was not armed in the ledger: %s\n' "$action" >&2
            exit 65
          }
          case "${HARNESS_ACTIVE_GAME:-none}" in
            exact-running)
              printf 'device gate: exact local game status is running; refusing service mutation\n' >&2
              exit 82
              ;;
            exact-stopping)
              printf 'device gate: exact local game status is stopping; refusing service mutation\n' >&2
              exit 82
              ;;
            unit-live)
              printf 'device gate: a Korri game unit is live; refusing service mutation\n' >&2
              exit 82
              ;;
          esac
          if [[ "$action" == activate-test || "$action" == persistent-switch ]]; then
            [[ "${2:-}" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]]
            [[ "${HARNESS_POST_STOP_QUERY_ERROR:-no}" != yes ]] || {
              printf 'device gate: old user unit active state query failed after stop: korrid.service\n' >&2
              exit 86
            }
            printf 'candidate-service-mutation=started\n' >>"$HARNESS_LOG"
            if [[ -n "${HARNESS_CANDIDATE_SERVICE_FAILURE:-}" ]]; then
              printf 'device gate: timed out waiting for %s ActiveState=active\n' "$HARNESS_CANDIDATE_SERVICE_FAILURE" >&2
              exit 83
            fi
            printf 'user-manager=fresh candidate-services=active credentials=service-specific\n' >>"$HARNESS_LOG"
          fi
          if [[ "$action" == restore ]]; then
            [[ "${2:-}" == false || "${2:-}" == true ]]
            [[ "${3:-}" == "${HARNESS_GAMEPLAY_USER:-gameplay}" ]]
            [[ "${4:-}" == "${HARNESS_OLD_KORRID_ACTIVE:-${HARNESS_OLD_ACTIVE:-false}}" ]]
            [[ "${5:-}" == "${HARNESS_OLD_KORRID_ENABLED:-${HARNESS_OLD_ENABLED:-false}}" ]]
            [[ "${6:-}" == "${HARNESS_OLD_SUNSHINE_ACTIVE:-true}" ]]
            [[ "${7:-}" == "${HARNESS_OLD_SUNSHINE_ENABLED:-true}" ]]
            [[ "${8:-}" == "${HARNESS_OLD_X11_ACTIVE:-true}" ]]
            [[ "${9:-}" == "${HARNESS_OLD_X11_ENABLED:-true}" ]]
            pairing_modes="${HARNESS_PAIRING_MODES:-700:600}"
            [[ "${10:-}" == "${pairing_modes%%:*}" ]]
            [[ "${11:-}" == "${pairing_modes#*:}" ]]
            printf 'candidate-services=disabled-stopped user-manager=fresh rollback-groups=restored pairing-modes=%s:%s\n' "${10:-}" "${11:-}" >>"$HARNESS_LOG"
            printf 'restore-enable x11-headless=%s sunshine=%s korrid=%s\n' "$9" "$7" "$5" >>"$HARNESS_LOG"
            if [[ "${HARNESS_RESTORE_ORDER:-dependency}" == sunshine-first ]]; then
              restore_units=(sunshine x11-headless korrid)
            else
              restore_units=(x11-headless sunshine korrid)
            fi
            x11_started=false
            for restore_unit in "${restore_units[@]}"; do
              case "$restore_unit" in
                x11-headless) restore_active="$8" ;;
                sunshine) restore_active="$6" ;;
                korrid) restore_active="$4" ;;
              esac
              [[ "$restore_active" == true ]] || continue
              if [[ "$restore_unit" == sunshine && "$8" == true && "$x11_started" != true ]]; then
                printf 'device gate: Sunshine restore started before X11\n' >&2
                exit 84
              fi
              printf 'restore-start %s\n' "$restore_unit" >>"$HARNESS_LOG"
              [[ "$restore_unit" != x11-headless ]] || x11_started=true
            done
            printf 'restored-old-user korrid=%s/%s sunshine=%s/%s x11-headless=%s/%s\n' \
              "$4" "$5" "$6" "$7" "$8" "$9" >>"$HARNESS_LOG"
          fi
          if [[ "$action" == activate-test && "${HARNESS_MUTATION_SLEEP:-0}" != 0 ]]; then
            if ((HARNESS_MUTATION_SLEEP > remote_deadline)); then
              sleep "$remote_deadline"
              exit 124
            fi
            sleep "$HARNESS_MUTATION_SLEEP"
          fi
          if [[ "$action" == activate-test && "${HARNESS_MUTATION_OUTLIVES_TRANSPORT:-no}" == yes \
            && ! -e "${HARNESS_OUTLIVE_MARKER:?}" ]]; then
            : >"$HARNESS_OUTLIVE_MARKER"
            lock_owned=false
            (
              sleep 0.2
              printf 'remote-mutation-finished\n' >>"$HARNESS_LOG"
              rmdir "$lock_dir"
            ) &
            printf 'local-transport-ended\n' >>"$HARNESS_LOG"
            exit 255
          fi
          ;;
        *) printf 'unexpected remote action: %s\n' "$action" >&2; exit 70 ;;
      esac
      exit 0
    fi
    printf 'unexpected SSH argv: %q\n' "$command" >&2
    exit 69
    ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/device-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SELF="$(realpath "$0")"
ln -s "$SELF" "$TMP/ssh-command-harness"
mkdir "$TMP/user-scope-bin"
ln -s "$SELF" "$TMP/user-scope-bin/user-scope-id"
ln -s "$SELF" "$TMP/user-scope-bin/user-scope-sudo"
ln -s "$SELF" "$TMP/user-scope-bin/user-scope-systemctl"
ln -s "$SELF" "$TMP/user-scope-bin/user-scope-getent"
ln -s user-scope-id "$TMP/user-scope-bin/id"
ln -s user-scope-sudo "$TMP/user-scope-bin/sudo"
ln -s user-scope-systemctl "$TMP/user-scope-bin/systemctl"
ln -s user-scope-getent "$TMP/user-scope-bin/getent"
export KORRI_DEVICE_GATE_SSH="$TMP/ssh-command-harness"
export HARNESS_LOG="$TMP/commands.log" HARNESS_GATE_SOURCE="$GATE"
HARNESS_GAMEPLAY_UID="$(id -u)"
export HARNESS_GAMEPLAY_UID HARNESS_USER_SCOPE_LOG="$TMP/user-scope.log"
export HARNESS_ATTEMPT_MARKER="$TMP/remote-attempt" HARNESS_ATTEMPT_LEASE="$TMP/remote-attempt.lease"
export HARNESS_GAMEPLAY_USER=gameplay HARNESS_GAMEPLAY_HOME="$TMP/gameplay-home"
mkdir -p "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
: >"$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
chmod 0700 "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
chmod 0600 "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
export HARNESS_OLD_SUNSHINE_ACTIVE=true HARNESS_OLD_SUNSHINE_ENABLED=true
export HARNESS_OLD_X11_ACTIVE=true HARNESS_OLD_X11_ENABLED=true
MACHINE_ID=0123456789abcdef0123456789abcdef
HOSTNAME=u7-test-host
CANDIDATE=/nix/store/00000000000000000000000000000000-nixos-system-u7-test-host-1
ROLLBACK=/nix/store/11111111111111111111111111111111-nixos-system-u7-test-host-0
GAMEPLAY_USER=gameplay
CONTROLLER_ID=0003:045e:02ea:050b
PRODUCTION_PROFILE=korri-60-xbox_one_gamepad.yaml
export CANDIDATE ROLLBACK

run_gate() {
  "$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" \
    --candidate "$CANDIDATE" --gameplay-user "$GAMEPLAY_USER" "$@"
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
    --gameplay-user "$GAMEPLAY_USER" --ledger "$ledger" \
    --expected-controller-id "$CONTROLLER_ID" --production-profile "$PRODUCTION_PROFILE"
}
confirm="CONFIRM-$(printf '%s' "$MACHINE_ID|$HOSTNAME|$CANDIDATE" | sha256sum | cut -c1-16)"

# The root-owned systemd attempt holder starts outside an interactive shell.
# Its immutable candidate-scoped PATH must resolve the byte-identical helper's
# env/bash shebang and bounded holder command.
# This is a literal source-level regression check.
# shellcheck disable=SC2016
grep -F -- '--setenv="PATH=$candidate/sw/bin"' "$GATE" >/dev/null
# stat(1) canonicalizes 0700/0600 to 700/600; candidate calls must use the
# canonical forms so post-chmod verification compares equal.
# shellcheck disable=SC2016
[[ "$(grep -Fc 'remote_set_pairing_state_modes "$gameplay_user" 700 600' "$GATE")" -eq 2 ]]

# Exercise the production primary-group policy directly. The remote endpoint
# model cannot reproduce a forged primary GID without replacing /proc.
GROUP_POLICY_SOURCE="$(awk '
  /^remote_process_group_policy\(\) \{/ { found=1 }
  found { print }
  found && /^}$/ { exit }
' "$GATE")"
[[ "$GROUP_POLICY_SOURCE" == remote_process_group_policy* ]]
run_production_group_policy() (
  local unit="$1" primary_gid="$2" sunshine_supplementary="${3:-yes}"
  local input_gid=10 uinput_gid="${4-20}" control_gid=30 sunshine_gid=40
  # shellcheck disable=SC2329 # Invoked by the production function loaded below.
  fail() {
    printf 'device gate: %s\n' "$*" >&2
    exit 1
  }
  # shellcheck disable=SC2329 # Invoked by the production function loaded below.
  remote_pid_reject_supplementary_gid() { :; }
  # shellcheck disable=SC2329 # Invoked by the production function loaded below.
  remote_pid_has_supplementary_gid() {
    [[ "$unit" == sunshine.service && "$sunshine_supplementary" == yes \
      && "$2" == "$sunshine_gid" ]]
  }
  eval "$GROUP_POLICY_SOURCE"
  remote_process_group_policy "$unit" "$$" "$primary_gid" \
    "$input_gid" "$uinput_gid" "$control_gid" "$sunshine_gid"
)
for credential_unit in korrid.service x11-headless.service sunshine.service \
  korri-inputd.service korri-game-harness.service 'gameplay user manager'; do
  assert_fails_with "forbidden input primary group leaked to $credential_unit" \
    run_production_group_policy "$credential_unit" 10
  assert_fails_with "forbidden uinput primary group leaked to $credential_unit" \
    run_production_group_policy "$credential_unit" 20
done
run_production_group_policy korri-inputd.service 30
assert_fails_with 'inputd does not use the control primary group' \
  run_production_group_policy korri-inputd.service 50
assert_fails_with 'control primary group leaked to korrid.service' \
  run_production_group_policy korrid.service 30
run_production_group_policy sunshine.service 50
# Removing the broad legacy uinput group is safer than retaining it. Its absent
# GID must skip only the leak checks tied to that nonexistent authority.
run_production_group_policy sunshine.service 50 yes ''
assert_fails_with 'Sunshine dedicated uinput group must be supplementary' \
  run_production_group_policy sunshine.service 40
assert_fails_with 'system Sunshine lacks its dedicated uinput group' \
  run_production_group_policy sunshine.service 50 no

# Exercise the production user-manager and pairing proof paths. Both root
# without SUDO_UID and a different SSH caller must target the explicit user.
run_production_predicates() {
  env -u SUDO_UID PATH="$TMP/user-scope-bin:$PATH" HARNESS_MODELED_USER=root "$@" \
    "$GATE" --remote predicates "$GAMEPLAY_USER"
}
: >"$HARNESS_USER_SCOPE_LOG"
user_scope_predicates="$(run_production_predicates HARNESS_CALLER_UID=0)"
grep -Fx 'old-user.sunshine.active=true' <<<"$user_scope_predicates" >/dev/null
grep -Fx 'old-user.sunshine.enabled=true' <<<"$user_scope_predicates" >/dev/null
grep -Fx 'old-user.x11-headless.active=true' <<<"$user_scope_predicates" >/dev/null
grep -Fx 'sunshine.pairing-state-present=true' <<<"$user_scope_predicates" >/dev/null
[[ "$(grep -c '^systemctl-user=' "$HARNESS_USER_SCOPE_LOG")" -eq 6 ]]
if grep '^sudo-user=' "$HARNESS_USER_SCOPE_LOG" | grep -Fv 'sudo-user=gameplay caller=0 ' >/dev/null; then
  printf 'a root user-scope operation targeted a user other than gameplay\n' >&2
  exit 1
fi
grep -F "runtime=/run/user/$HARNESS_GAMEPLAY_UID bus=unix:path=/run/user/$HARNESS_GAMEPLAY_UID/bus" \
  "$HARNESS_USER_SCOPE_LOG" >/dev/null
: >"$HARNESS_USER_SCOPE_LOG"
run_production_predicates HARNESS_CALLER_UID=2000 >/dev/null
[[ "$(grep -c '^systemctl-user=' "$HARNESS_USER_SCOPE_LOG")" -eq 6 ]]
if grep '^sudo-user=' "$HARNESS_USER_SCOPE_LOG" | grep -Fv 'sudo-user=gameplay caller=2000 ' >/dev/null; then
  printf 'an SSH user-scope operation targeted a user other than gameplay\n' >&2
  exit 1
fi
assert_fails_with 'old user unit active state query failed' \
  run_production_predicates HARNESS_CALLER_UID=2000 HARNESS_SUDO_DENY=yes

# Manager errors are not converted to false. Disabled and static are valid
# false enablement states, while inactive is a valid false activity state.
assert_fails_with 'old user unit active state query failed' \
  run_production_predicates HARNESS_USER_QUERY_ERROR=ActiveState:korrid.service
if grep -F 'old-user.korrid.active=false' "$TMP/failure.stdout" >/dev/null; then
  printf 'a user-manager query error was recorded as false\n' >&2
  exit 1
fi
assert_fails_with 'old user unit active state query failed' \
  run_production_predicates HARNESS_USER_ACTIVE_STATE=failed
for enabled_state in disabled static; do
  predicates="$(run_production_predicates HARNESS_USER_ACTIVE_STATE=inactive HARNESS_USER_ENABLED_STATE="$enabled_state")"
  grep -Fx 'old-user.korrid.active=false' <<<"$predicates" >/dev/null
  grep -Fx 'old-user.korrid.enabled=false' <<<"$predicates" >/dev/null
done

# Pairing proof records only a boolean. It rejects permissions and links, and
# never exposes the state file contents.
pairing_secret='PAIRING-CONTENTS-MUST-STAY-PRIVATE'
printf '%s\n' "$pairing_secret" >"$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
predicates="$(run_production_predicates)"
grep -Fx 'sunshine.pairing-state-modes=700:600' <<<"$predicates" >/dev/null
grep -Fx 'sunshine.pairing-state-present=true' <<<"$predicates" >/dev/null
if grep -F "$pairing_secret" <<<"$predicates" >/dev/null; then
  printf 'pairing-state contents leaked into predicates\n' >&2
  exit 1
fi
chmod 0640 "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
predicates="$(run_production_predicates)"
grep -Fx 'sunshine.pairing-state-present=false' <<<"$predicates" >/dev/null
chmod 0600 "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
chmod 0750 "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
predicates="$(run_production_predicates)"
grep -Fx 'sunshine.pairing-state-present=false' <<<"$predicates" >/dev/null
chmod 0700 "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
predicates="$(run_production_predicates HARNESS_GAMEPLAY_UID=1001)"
grep -Fx 'sunshine.pairing-state-present=false' <<<"$predicates" >/dev/null
mv "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json" "$TMP/pairing-state"
ln -s "$TMP/pairing-state" "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
predicates="$(run_production_predicates)"
grep -Fx 'sunshine.pairing-state-present=false' <<<"$predicates" >/dev/null
rm "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
mv "$TMP/pairing-state" "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
chmod 0600 "$HARNESS_GAMEPLAY_HOME/.config/sunshine/sunshine_state.json"
mv "$HARNESS_GAMEPLAY_HOME/.config/sunshine" "$TMP/sunshine-outside"
ln -s "$TMP/sunshine-outside" "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
predicates="$(run_production_predicates)"
grep -Fx 'sunshine.pairing-state-present=false' <<<"$predicates" >/dev/null
rm "$HARNESS_GAMEPLAY_HOME/.config/sunshine"
mv "$TMP/sunshine-outside" "$HARNESS_GAMEPLAY_HOME/.config/sunshine"

: >"$HARNESS_LOG"
assert_fails_with 'an explicit --host is required' "$GATE" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME"
[[ ! -s "$HARNESS_LOG" ]]
assert_fails_with 'every mode requires an explicit gameplay user' "$GATE" --host "$HOSTNAME" \
  --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" --candidate "$CANDIDATE"
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
  --expected-machine-id ffffffffffffffffffffffffffffffff --expected-hostname "$HOSTNAME" \
  --candidate "$CANDIDATE" --gameplay-user "$GAMEPLAY_USER"
assert_no_mutation

# The candidate helper must be immutable store content and byte-identical to
# the local source before the gate uses it.
export HARNESS_HELPER_STAT=0:755
assert_fails_with 'must be executable and not writable' run_gate
unset HARNESS_HELPER_STAT
export HARNESS_HELPER_DIGEST=mismatch
assert_fails_with 'digest does not match the local gate source' run_gate
unset HARNESS_HELPER_DIGEST

: >"$HARNESS_LOG"
inspection="$(run_gate)"
grep -F 'inspection=complete mutation=none' <<<"$inspection" >/dev/null
grep -F "controller-candidate identity=$CONTROLLER_ID" <<<"$inspection" >/dev/null
assert_no_mutation

# A valid Nix name containing shell metacharacters remains one exact argv item.
quoted_candidate='/nix/store/22222222222222222222222222222222-nixos-system-u7-test-host?variant=one'
quoted_ledger="$TMP/ledger with quote'and space"
export HARNESS_LEDGER="$quoted_ledger"
: >"$HARNESS_LOG"
assert_fails_with 'confirmation token is missing' run_gate --mode candidate-test \
  --candidate "$quoted_candidate" --rollback-generation "$ROLLBACK" --gameplay-user "$GAMEPLAY_USER" --ledger "$quoted_ledger" \
  --expected-controller-id "$CONTROLLER_ID" --production-profile "$PRODUCTION_PROFILE"
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
run_failure_model same-name-raw HARNESS_TOPOLOGY_FIXTURE \
  "$HERE/fixtures/topology-same-name-raw.txt" 'gameplay user can read 1 raw controller node'
run_failure_model delegate HARNESS_DELEGATE no 'inputd Delegate is not enabled'
run_failure_model delegate-controllers HARNESS_DELEGATE_CONTROLLERS cpu 'DelegateControllers does not contain pids'
run_failure_model stale-manager HARNESS_STALE_MANAGER_CREDENTIALS yes 'fresh gameplay user manager retains forbidden group: input'
for credential_failure in korrid-input x11-headless-uinput sunshine-control inputd-input game-control korrid-sunshine-uinput inputd-control-primary; do
  run_failure_model "credentials-$credential_failure" HARNESS_CREDENTIAL_FAILURE "$credential_failure" \
    'modeled /proc Groups credential rejection'
done
run_failure_model pairing-absent HARNESS_PAIRING_PRESENT false 'Sunshine pairing-state file is absent'
run_failure_model post-stop-query-error HARNESS_POST_STOP_QUERY_ERROR yes 'old user unit active state query failed after stop'

# Candidate activation refuses every observed active-game signal before it
# stops an old user unit or starts a system replacement. Cleanup also refuses
# to kill the same game.
for active_game_model in exact-running exact-stopping unit-live; do
  active_game_ledger="$TMP/active-game-$active_game_model-ledger"
  mapfile -d '' -t active_game_args < <(common_for "$active_game_ledger")
  export HARNESS_LEDGER="$active_game_ledger" HARNESS_ACTIVE_GAME="$active_game_model"
  : >"$HARNESS_LOG"
  case "$active_game_model" in
    exact-running) refusal='exact local game status is running' ;;
    exact-stopping) refusal='exact local game status is stopping' ;;
    unit-live) refusal='a Korri game unit is live' ;;
  esac
  assert_fails_with "$refusal" run_gate --mode candidate-test "${active_game_args[@]}" --confirm "$confirm"
  if grep -F 'candidate-service-mutation=' "$HARNESS_LOG" >/dev/null; then
    printf 'active-game refusal reached candidate service mutation: %s\n' "$active_game_model" >&2
    exit 1
  fi
  unset HARNESS_ACTIVE_GAME
done

# All 64 active/enabled combinations for the three observed user units are
# captured and handed back to rollback exactly. The modeled Sunshine failure
# occurs after candidate activation, so cleanup exercises complete restoration.
for korrid_active in false true; do
  for korrid_enabled in false true; do
    for sunshine_active in false true; do
      for sunshine_enabled in false true; do
        for x11_active in false true; do
          for x11_enabled in false true; do
            combination="$korrid_active$korrid_enabled$sunshine_active$sunshine_enabled$x11_active$x11_enabled"
            combination_ledger="$TMP/baseline-combination-$combination-ledger"
            mapfile -d '' -t combination_args < <(common_for "$combination_ledger")
            export HARNESS_LEDGER="$combination_ledger"
            export HARNESS_OLD_KORRID_ACTIVE="$korrid_active" HARNESS_OLD_KORRID_ENABLED="$korrid_enabled"
            export HARNESS_OLD_SUNSHINE_ACTIVE="$sunshine_active" HARNESS_OLD_SUNSHINE_ENABLED="$sunshine_enabled"
            export HARNESS_OLD_X11_ACTIVE="$x11_active" HARNESS_OLD_X11_ENABLED="$x11_enabled"
            export HARNESS_CANDIDATE_SERVICE_FAILURE=sunshine.service
            : >"$HARNESS_LOG"
            assert_fails_with 'timed out waiting for sunshine.service ActiveState=active' \
              run_gate --mode candidate-test "${combination_args[@]}" --confirm "$confirm"
            grep -F "restored-old-user korrid=$korrid_active/$korrid_enabled sunshine=$sunshine_active/$sunshine_enabled x11-headless=$x11_active/$x11_enabled" \
              "$HARNESS_LOG" >/dev/null
            grep -F "restore-enable x11-headless=$x11_enabled sunshine=$sunshine_enabled korrid=$korrid_enabled" \
              "$HARNESS_LOG" >/dev/null
            expected_starts=''
            [[ "$x11_active" != true ]] || expected_starts+='x11-headless '
            [[ "$sunshine_active" != true ]] || expected_starts+='sunshine '
            [[ "$korrid_active" != true ]] || expected_starts+='korrid '
            actual_starts="$(awk '/^restore-start / {printf "%s ", $2}' "$HARNESS_LOG")"
            [[ "$actual_starts" == "$expected_starts" ]]
          done
        done
      done
    done
  done
done
unset HARNESS_OLD_KORRID_ACTIVE HARNESS_OLD_KORRID_ENABLED
unset HARNESS_OLD_SUNSHINE_ACTIVE HARNESS_OLD_SUNSHINE_ENABLED
unset HARNESS_OLD_X11_ACTIVE HARNESS_OLD_X11_ENABLED HARNESS_CANDIDATE_SERVICE_FAILURE
export HARNESS_OLD_SUNSHINE_ACTIVE=true HARNESS_OLD_SUNSHINE_ENABLED=true
export HARNESS_OLD_X11_ACTIVE=true HARNESS_OLD_X11_ENABLED=true

# The restore model rejects Sunshine when X11 should have started first.
restore_order_ledger="$TMP/restore-order-ledger"
mapfile -d '' -t restore_order_args < <(common_for "$restore_order_ledger")
export HARNESS_LEDGER="$restore_order_ledger" HARNESS_RESTORE_ORDER=sunshine-first
export HARNESS_OLD_KORRID_ACTIVE=true HARNESS_OLD_KORRID_ENABLED=true
export HARNESS_CANDIDATE_SERVICE_FAILURE=sunshine.service
assert_fails_with 'cleanup rollback failed' run_gate --mode candidate-test \
  "${restore_order_args[@]}" --confirm "$confirm"
unset HARNESS_RESTORE_ORDER HARNESS_CANDIDATE_SERVICE_FAILURE
unset HARNESS_OLD_KORRID_ACTIVE HARNESS_OLD_KORRID_ENABLED

missing_controller_ledger="$TMP/missing-controller-ledger"
: >"$HARNESS_LOG"
assert_fails_with 'require an explicit expected controller identity and production profile' run_gate \
  --mode persistent-switch --candidate "$CANDIDATE" --rollback-generation "$ROLLBACK" \
  --gameplay-user "$GAMEPLAY_USER" --ledger "$missing_controller_ledger" --confirm "$confirm"
assert_no_mutation
assert_fails_with 'unsupported production profile' run_gate --mode persistent-switch \
  --candidate "$CANDIDATE" --rollback-generation "$ROLLBACK" --gameplay-user "$GAMEPLAY_USER" \
  --ledger "$TMP/unsupported-profile-ledger" --expected-controller-id "$CONTROLLER_ID" \
  --production-profile default.yaml --confirm "$confirm"
for controller_model in synthetic virtual unsupported stale generic-joystick two-matching; do
  controller_ledger="$TMP/controller-$controller_model-ledger"
  mapfile -d '' -t controller_args < <(common_for "$controller_ledger")
  export HARNESS_LEDGER="$controller_ledger" HARNESS_CONTROLLER_MODEL="$controller_model"
  : >"$HARNESS_LOG"
  assert_fails_with 'expected supported physical controller identity is not uniquely live' \
    run_gate --mode persistent-switch "${controller_args[@]}" --confirm "$confirm"
  assert_no_mutation
  unset HARNESS_CONTROLLER_MODEL
done

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
export HARNESS_LEDGER="$timeout_ledger" HARNESS_MUTATION_SLEEP=3 KORRI_DEVICE_GATE_REMOTE_TIMEOUT=1
export KORRI_DEVICE_GATE_LOCK_WAIT_TIMEOUT=2 KORRI_DEVICE_GATE_SSH_TIMEOUT=4
assert_fails_with 'mutation failed; fresh reconcile is required' run_gate --mode candidate-test \
  "${timeout_args[@]}" --confirm "$confirm"
grep -Fx 'state=failed-needs-inspection' "$timeout_ledger/state" >/dev/null
unset HARNESS_MUTATION_SLEEP KORRI_DEVICE_GATE_REMOTE_TIMEOUT
unset KORRI_DEVICE_GATE_LOCK_WAIT_TIMEOUT KORRI_DEVICE_GATE_SSH_TIMEOUT

# A remote mutation can survive a transport failure. Cleanup waits on the same
# root gate lock, so restore starts only after the remote mutation finishes.
outlive_ledger="$TMP/outlive-ledger"
mapfile -d '' -t outlive_args < <(common_for "$outlive_ledger")
export HARNESS_LEDGER="$outlive_ledger" HARNESS_MUTATION_OUTLIVES_TRANSPORT=yes
export HARNESS_OUTLIVE_MARKER="$TMP/outlive-marker" HARNESS_GATE_LOCK="$TMP/root-gate-lock"
: >"$HARNESS_LOG"
assert_fails_with 'mutation failed; fresh reconcile is required' run_gate --mode candidate-test \
  "${outlive_args[@]}" --confirm "$confirm"
mutation_finished_line="$(grep -n 'remote-mutation-finished' "$HARNESS_LOG" | cut -d: -f1)"
restore_line="$(grep -n 'action=restore' "$HARNESS_LOG" | cut -d: -f1 | tail -1)"
[[ -n "$mutation_finished_line" && -n "$restore_line" && "$mutation_finished_line" -lt "$restore_line" ]]
grep -F 'lock-wait action=restore' "$HARNESS_LOG" >/dev/null
unset HARNESS_MUTATION_OUTLIVES_TRANSPORT HARNESS_OUTLIVE_MARKER HARNESS_GATE_LOCK

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
    [[ "${HARNESS_MISTYPE_GATE:-}" != "$gate" ]] || token=MISTYPED-TOKEN
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

run_abrupt_kill() {
  local mode="$1" pause_action="$2" ledger_state="$3" ledger="$4"
  shift 4
  local pause_marker="$TMP/abrupt-$RANDOM.ready" pid
  export HARNESS_PAUSE_ACTION="$pause_action" HARNESS_PAUSE_MARKER="$pause_marker"
  setsid "$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" \
    --mode "$mode" "$@" >"$pause_marker.stdout" 2>"$pause_marker.stderr" &
  pid=$!
  for _ in $(seq 1 500); do
    if [[ -e "$pause_marker" && -e "$HARNESS_ATTEMPT_MARKER" && -e "$HARNESS_ATTEMPT_LEASE" ]] \
      && grep -Fx "state=$ledger_state" "$ledger/state" >/dev/null 2>&1; then
      break
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.01
  done
  [[ -e "$pause_marker" && -e "$HARNESS_ATTEMPT_MARKER" && -e "$HARNESS_ATTEMPT_LEASE" ]]
  grep -Fx "state=$ledger_state" "$ledger/state" >/dev/null
  kill -KILL -- "-$pid"
  wait "$pid" 2>/dev/null || true
  # The real flock is released by SIGKILL. The mkdir-based harness needs the
  # equivalent modeled release because its EXIT trap cannot run after SIGKILL.
  rmdir "$HARNESS_LOG.lock" 2>/dev/null || true
  unset HARNESS_PAUSE_ACTION HARNESS_PAUSE_MARKER
}

run_startup_abrupt_kill() {
  local mode="$1" window="$2" ledger_state="$3" ledger="$4"
  shift 4
  local pause_marker="$TMP/startup-abrupt-$RANDOM.ready" pid
  export HARNESS_ATTEMPT_START_PAUSE="$window" HARNESS_PAUSE_MARKER="$pause_marker"
  setsid "$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" \
    --mode "$mode" "$@" >"$pause_marker.stdout" 2>"$pause_marker.stderr" &
  pid=$!
  for _ in $(seq 1 500); do
    if [[ -e "$pause_marker" ]] && grep -Fx "state=$ledger_state" "$ledger/state" >/dev/null 2>&1; then
      break
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.01
  done
  [[ -e "$pause_marker" ]]
  grep -Fx "state=$ledger_state" "$ledger/state" >/dev/null
  nonce="$(awk -F= '$1 == "attempt_nonce" {print $2}' "$ledger/state")"
  [[ "$nonce" =~ ^[0-9a-f]{64}$ ]]
  if [[ "$window" == pre-marker ]]; then
    [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]
  else
    grep -Fx "nonce=$nonce" "$HARNESS_ATTEMPT_MARKER" >/dev/null
    grep -Fx "candidate=$CANDIDATE" "$HARNESS_ATTEMPT_MARKER" >/dev/null
    [[ -e "$HARNESS_ATTEMPT_LEASE" ]]
  fi
  kill -KILL -- "-$pid"
  wait "$pid" 2>/dev/null || true
  # Production leases are systemd units and survive the local gate process.
  # The shell harness shares a process group with its modeled holder, so restore
  # the already-proven live marker after SIGKILL to model that ownership exactly.
  [[ "$window" != post-marker ]] || : >"$HARNESS_ATTEMPT_LEASE"
  rmdir "$HARNESS_LOG.lock" 2>/dev/null || true
  unset HARNESS_ATTEMPT_START_PAUSE HARNESS_PAUSE_MARKER
}

run_stalled_interactive() {
  local ledger="$1" transcript="$2"
  shift 2
  local fifo="$TMP/stalled-tty-$RANDOM" command=''
  local -a argv=("$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" --expected-hostname "$HOSTNAME" --mode candidate-test "$@")
  mkfifo "$fifo"
  printf -v command '%q ' "${argv[@]}"
  script -qefc "$command" /dev/null <"$fifo" >"$transcript" 2>&1 &
  local script_pid=$!
  exec 4>"$fifo"
  local status=0
  wait "$script_pid" || status=$?
  exec 4>&-
  [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]
  return "$status"
}

# A stalled controlling terminal reaches the bounded read timeout while
# rollback is armed. Cleanup restores the baseline and releases the marker.
stalled_ledger="$TMP/stalled-ledger"
mapfile -d '' -t stalled_args < <(common_for "$stalled_ledger")
export HARNESS_LEDGER="$stalled_ledger" KORRI_DEVICE_GATE_HITL_READ_TIMEOUT=1
export KORRI_DEVICE_GATE_HITL_OVERALL_TIMEOUT=2 KORRI_DEVICE_GATE_ATTEMPT_TIMEOUT=4
: >"$HARNESS_LOG"
if run_stalled_interactive "$stalled_ledger" "$TMP/stalled.tty" "${stalled_args[@]}" --confirm "$confirm"; then
  printf 'stalled HITL unexpectedly passed\n' >&2
  exit 1
fi
grep -F 'HITL stage timed out: normalized-gameplay' "$TMP/stalled.tty" >/dev/null
grep -Fx 'state=failed-needs-inspection' "$stalled_ledger/state" >/dev/null
grep -F 'action=restore' "$HARNESS_LOG" >/dev/null
unset KORRI_DEVICE_GATE_HITL_READ_TIMEOUT KORRI_DEVICE_GATE_HITL_OVERALL_TIMEOUT KORRI_DEVICE_GATE_ATTEMPT_TIMEOUT

# The durable remote marker rejects a second invocation throughout the first
# invocation's activation and HITL window.
first_ledger="$TMP/interleaved-first-ledger"
second_ledger="$TMP/interleaved-second-ledger"
mapfile -d '' -t first_args < <(common_for "$first_ledger")
mapfile -d '' -t second_args < <(common_for "$second_ledger")
interleaved_fifo="$TMP/interleaved-fifo"
mkfifo "$interleaved_fifo"
printf -v interleaved_command '%q ' "$GATE" --host "$HOSTNAME" --expected-machine-id "$MACHINE_ID" \
  --expected-hostname "$HOSTNAME" --mode candidate-test "${first_args[@]}" --confirm "$confirm"
HARNESS_LEDGER="$first_ledger" KORRI_DEVICE_GATE_HITL_READ_TIMEOUT=30 \
  KORRI_DEVICE_GATE_HITL_OVERALL_TIMEOUT=60 KORRI_DEVICE_GATE_ATTEMPT_TIMEOUT=90 \
  script -qefc "$interleaved_command" /dev/null <"$interleaved_fifo" >"$TMP/interleaved-first.tty" 2>&1 &
first_pid=$!
exec 5>"$interleaved_fifo"
for _ in $(seq 1 300); do
  [[ -e "$HARNESS_ATTEMPT_MARKER" && -e "$HARNESS_ATTEMPT_LEASE" ]] && break
  kill -0 "$first_pid" 2>/dev/null || break
  sleep 0.02
done
[[ -e "$HARNESS_ATTEMPT_MARKER" && -e "$HARNESS_ATTEMPT_LEASE" ]]

live_reconcile_ledger="$TMP/interleaved-live-reconcile-ledger"
cp -a "$first_ledger" "$live_reconcile_ledger"
sed -i 's/^state=pending-mutation$/state=failed-needs-inspection/' "$live_reconcile_ledger/state"
mapfile -d '' -t live_reconcile_args < <(common_for "$live_reconcile_ledger")
export HARNESS_LEDGER="$live_reconcile_ledger"
assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
  "${live_reconcile_args[@]}"

export HARNESS_LEDGER="$second_ledger"
assert_fails_with 'another device-gate attempt marker already exists' run_gate --mode candidate-test \
  "${second_args[@]}" --confirm "$confirm"
[[ -e "$HARNESS_ATTEMPT_MARKER" && -e "$HARNESS_ATTEMPT_LEASE" ]]
kill -TERM "$first_pid" 2>/dev/null || true
wait "$first_pid" 2>/dev/null || true
exec 5>&-
for _ in $(seq 1 300); do
  [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]] && break
  sleep 0.02
done
[[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]

# Reconcile removes the same marker only after its lease is stale and still
# proves the exact rollback baseline before restoring the prior ledger state.
live_nonce="$(awk -F= '$1 == "attempt_nonce" {print $2}' "$live_reconcile_ledger/state")"
printf 'nonce=%s\ncandidate=%s\n' "$live_nonce" "$CANDIDATE" >"$HARNESS_ATTEMPT_MARKER"
export HARNESS_LEDGER="$live_reconcile_ledger"
run_gate --mode reconcile "${live_reconcile_args[@]}" >/dev/null
[[ ! -e "$HARNESS_ATTEMPT_MARKER" ]]

# Attempt startup is two-phase. SIGKILL before marker creation leaves a nonce-
# bearing starting state that reconciles without a marker. SIGKILL after marker
# creation but before the durable in-progress transition honors the exact lease,
# rejects a mismatch, and reconciles only after that exact lease is inactive.
for startup_window in pre-marker post-marker; do
  startup_pending_ledger="$TMP/startup-pending-$startup_window-ledger"
  mapfile -d '' -t startup_pending_args < <(common_for "$startup_pending_ledger")
  export HARNESS_LEDGER="$startup_pending_ledger"
  : >"$HARNESS_LOG"
  run_startup_abrupt_kill candidate-test "$startup_window" pending-mutation-starting \
    "$startup_pending_ledger" "${startup_pending_args[@]}" --confirm "$confirm"
  if [[ "$startup_window" == post-marker ]]; then
    assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
      "${startup_pending_args[@]}"
    startup_nonce="$(awk -F= '$1 == "attempt_nonce" {print $2}' "$startup_pending_ledger/state")"
    rm -f "$HARNESS_ATTEMPT_LEASE"
    printf 'nonce=%s\ncandidate=%s\n' "f${startup_nonce:1}" "$CANDIDATE" >"$HARNESS_ATTEMPT_MARKER"
    assert_fails_with 'marker does not match this private attempt' run_gate --mode reconcile \
      "${startup_pending_args[@]}"
    printf 'nonce=%s\ncandidate=%s\n' "$startup_nonce" "$CANDIDATE" >"$HARNESS_ATTEMPT_MARKER"
  fi
  run_gate --mode reconcile "${startup_pending_args[@]}" >/dev/null
  grep -Fx 'state=' "$startup_pending_ledger/state" >/dev/null
  grep -E 'wrapper=deadline .*action=predicates' "$HARNESS_LOG" >/dev/null
  [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]
done

# SIGKILL bypasses every local cleanup trap. A stale pending mutation remains
# blocked while its matching remote lease is active. Once inactive, reconcile
# requires the exact marker nonce/candidate and the complete rollback baseline.
abrupt_pending_ledger="$TMP/abrupt-pending-ledger"
mapfile -d '' -t abrupt_pending_args < <(common_for "$abrupt_pending_ledger")
export HARNESS_LEDGER="$abrupt_pending_ledger"
: >"$HARNESS_LOG"
run_abrupt_kill candidate-test activate-test pending-mutation "$abrupt_pending_ledger" \
  "${abrupt_pending_args[@]}" --confirm "$confirm"
assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
  "${abrupt_pending_args[@]}"
pending_nonce="$(awk -F= '$1 == "attempt_nonce" {print $2}' "$abrupt_pending_ledger/state")"
bad_pending_nonce="f${pending_nonce:1}"
[[ "$bad_pending_nonce" != "$pending_nonce" ]] || bad_pending_nonce="e${pending_nonce:1}"
printf 'nonce=%s\ncandidate=%s\n' "$bad_pending_nonce" "$CANDIDATE" >"$HARNESS_ATTEMPT_MARKER"
rm -f "$HARNESS_ATTEMPT_LEASE"
assert_fails_with 'marker does not match this private attempt' run_gate --mode reconcile \
  "${abrupt_pending_args[@]}"
printf 'nonce=%s\ncandidate=%s\n' "$pending_nonce" "$ROLLBACK" >"$HARNESS_ATTEMPT_MARKER"
assert_fails_with 'marker does not match this private attempt' run_gate --mode reconcile \
  "${abrupt_pending_args[@]}"
printf 'nonce=%s\ncandidate=%s\n' "$pending_nonce" "$CANDIDATE" >"$HARNESS_ATTEMPT_MARKER"
run_gate --mode reconcile "${abrupt_pending_args[@]}" >/dev/null
grep -Fx 'state=' "$abrupt_pending_ledger/state" >/dev/null
grep -E 'wrapper=deadline .*action=predicates' "$HARNESS_LOG" >/dev/null
[[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]

flow_ledger="$TMP/flow-ledger"
mapfile -d '' -t flow_args < <(common_for "$flow_ledger")
export HARNESS_LEDGER="$flow_ledger" HARNESS_PAIRING_MODES=755:644
: >"$HARNESS_LOG"
run_interactive candidate-test pending-mutation "$flow_ledger" "$TMP/candidate.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=candidate-green' "$flow_ledger/state" >/dev/null
grep -Fx 'old-user.korrid.active=false' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'old-user.sunshine.active=true' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'old-user.sunshine.enabled=true' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'old-user.x11-headless.active=true' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'old-user.x11-headless.enabled=true' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'system.sunshine.active=inactive' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'system.x11-headless.active=inactive' "$flow_ledger/baseline.predicates" >/dev/null
grep -Fx 'sunshine.pairing-state-modes=755:644' "$flow_ledger/baseline.predicates" >/dev/null
grep -F 'pairing-modes=755:644' "$HARNESS_LOG" >/dev/null
grep -Fx 'sunshine.pairing-state-present=true' "$flow_ledger/baseline.predicates" >/dev/null
grep -F 'predicates-user=gameplay wrapper=attempt-command' "$HARNESS_LOG" >/dev/null
if grep -F 'predicates-user=root' "$HARNESS_LOG" >/dev/null; then
  printf 'rollback comparison read root user-unit state instead of gameplay-user state\n' >&2
  exit 1
fi
[[ "$(stat -c %a "$flow_ledger")" == 700 ]]
[[ "$(stat -c %a "$flow_ledger/baseline.predicates")" == 600 ]]
[[ "$(wc -l <"$flow_ledger/consumed-gates")" -eq 7 ]]

run_gate --mode inject-health-failure "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=automatic-rollback-green' "$flow_ledger/state" >/dev/null
run_gate --mode rollback "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-await-reboot' "$flow_ledger/state" >/dev/null
export HARNESS_BOOT_ID=boot-two HARNESS_CURRENT_GENERATION="$ROLLBACK"

# Both reboot verification states have the same two recoverable startup
# windows. Reconcile reruns the state-specific checks before it restores the
# explicit resume state.
for startup_window in pre-marker post-marker; do
  startup_rollback_ledger="$TMP/startup-rollback-$startup_window-ledger"
  cp -a "$flow_ledger" "$startup_rollback_ledger"
  mapfile -d '' -t startup_rollback_args < <(common_for "$startup_rollback_ledger")
  export HARNESS_LEDGER="$startup_rollback_ledger"
  : >"$HARNESS_LOG"
  run_startup_abrupt_kill rollback-reboot-verify "$startup_window" rollback-reboot-verifying-starting \
    "$startup_rollback_ledger" "${startup_rollback_args[@]}" --confirm "$confirm"
  if [[ "$startup_window" == post-marker ]]; then
    assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
      "${startup_rollback_args[@]}"
    rm -f "$HARNESS_ATTEMPT_LEASE"
  fi
  run_gate --mode reconcile "${startup_rollback_args[@]}" >/dev/null
  grep -Fx 'state=rollback-await-reboot' "$startup_rollback_ledger/state" >/dev/null
  grep -E 'wrapper=attempt-command .*action=rollback-gates' "$HARNESS_LOG" >/dev/null
  grep -E 'wrapper=attempt-command .*action=predicates' "$HARNESS_LOG" >/dev/null
  [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]
done

# A SIGKILL during rollback reboot verification leaves its explicit resume
# state intact. Reconcile refuses the live lease, then reruns rollback gates
# and the complete baseline before restoring rollback-await-reboot.
abrupt_rollback_ledger="$TMP/abrupt-rollback-ledger"
cp -a "$flow_ledger" "$abrupt_rollback_ledger"
mapfile -d '' -t abrupt_rollback_args < <(common_for "$abrupt_rollback_ledger")
export HARNESS_LEDGER="$abrupt_rollback_ledger"
: >"$HARNESS_LOG"
run_abrupt_kill rollback-reboot-verify rollback-gates rollback-reboot-verifying \
  "$abrupt_rollback_ledger" "${abrupt_rollback_args[@]}" --confirm "$confirm"
assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
  "${abrupt_rollback_args[@]}"
rm -f "$HARNESS_ATTEMPT_LEASE"
run_gate --mode reconcile "${abrupt_rollback_args[@]}" >/dev/null
grep -Fx 'state=rollback-await-reboot' "$abrupt_rollback_ledger/state" >/dev/null
grep -E 'wrapper=attempt-command .*action=rollback-gates' "$HARNESS_LOG" >/dev/null
grep -E 'wrapper=attempt-command .*action=predicates' "$HARNESS_LOG" >/dev/null
[[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]

export HARNESS_LEDGER="$flow_ledger"
run_gate --mode rollback-reboot-verify "${flow_args[@]}" --confirm "$confirm" >/dev/null
grep -Fx 'state=rollback-reboot-green' "$flow_ledger/state" >/dev/null
grep -E 'wrapper=attempt-command .*action=rollback-gates' "$HARNESS_LOG" >/dev/null

run_interactive persistent-switch pending-mutation "$flow_ledger" "$TMP/persistent.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=candidate-await-reboot' "$flow_ledger/state" >/dev/null
export HARNESS_BOOT_ID=boot-three HARNESS_CURRENT_GENERATION="$CANDIDATE"

for startup_window in pre-marker post-marker; do
  startup_candidate_ledger="$TMP/startup-candidate-$startup_window-ledger"
  cp -a "$flow_ledger" "$startup_candidate_ledger"
  mapfile -d '' -t startup_candidate_args < <(common_for "$startup_candidate_ledger")
  export HARNESS_LEDGER="$startup_candidate_ledger"
  : >"$HARNESS_LOG"
  run_startup_abrupt_kill candidate-reboot-verify "$startup_window" candidate-reboot-verifying-starting \
    "$startup_candidate_ledger" "${startup_candidate_args[@]}" --confirm "$confirm"
  grep -Eq '^attempt_nonce=[0-9a-f]{64}$' "$startup_candidate_ledger/state"
  if [[ "$startup_window" == post-marker ]]; then
    assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
      "${startup_candidate_args[@]}"
    rm -f "$HARNESS_ATTEMPT_LEASE"
  fi
  run_gate --mode reconcile "${startup_candidate_args[@]}" >/dev/null
  grep -Fx 'state=candidate-await-reboot' "$startup_candidate_ledger/state" >/dev/null
  grep -E 'wrapper=attempt-command .*action=automated-gates' "$HARNESS_LOG" >/dev/null
  grep -E 'wrapper=attempt-command .*action=acceptance-fingerprint' "$HARNESS_LOG" >/dev/null
  [[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]
done

# A SIGKILL during candidate reboot verification preserves candidate-await-
# reboot. Reconcile refuses the live lease, then checks the candidate generation,
# exact controller/profile, automated topology, and acceptance fingerprint.
abrupt_candidate_ledger="$TMP/abrupt-candidate-ledger"
cp -a "$flow_ledger" "$abrupt_candidate_ledger"
mapfile -d '' -t abrupt_candidate_args < <(common_for "$abrupt_candidate_ledger")
export HARNESS_LEDGER="$abrupt_candidate_ledger"
: >"$HARNESS_LOG"
run_abrupt_kill candidate-reboot-verify automated-gates candidate-reboot-verifying \
  "$abrupt_candidate_ledger" "${abrupt_candidate_args[@]}" --confirm "$confirm"
assert_fails_with 'attempt is still live; reconcile refuses to race it' run_gate --mode reconcile \
  "${abrupt_candidate_args[@]}"
rm -f "$HARNESS_ATTEMPT_LEASE"
run_gate --mode reconcile "${abrupt_candidate_args[@]}" >/dev/null
grep -Fx 'state=candidate-await-reboot' "$abrupt_candidate_ledger/state" >/dev/null
grep -E 'wrapper=attempt-command .*action=automated-gates' "$HARNESS_LOG" >/dev/null
grep -E 'wrapper=attempt-command .*action=acceptance-fingerprint' "$HARNESS_LOG" >/dev/null
[[ ! -e "$HARNESS_ATTEMPT_MARKER" && ! -e "$HARNESS_ATTEMPT_LEASE" ]]

# A mistyped reboot HITL token is a resumable verification failure. Reconcile
# returns to candidate-await-reboot without rolling back the accepted candidate.
cp -a "$flow_ledger" "$TMP/mistyped-ledger"
mistyped_ledger="$TMP/mistyped-ledger"
export HARNESS_LEDGER="$mistyped_ledger" HARNESS_MISTYPE_GATE=normalized-gameplay
: >"$HARNESS_LOG"
if run_interactive candidate-reboot-verify candidate-reboot-verifying "$mistyped_ledger" "$TMP/mistyped.tty" \
  "${flow_args[@]/$flow_ledger/$mistyped_ledger}" --confirm "$confirm"; then
  printf 'mistyped candidate reboot token unexpectedly passed\n' >&2
  exit 1
fi
grep -Fx 'state=failed-needs-inspection' "$mistyped_ledger/state" >/dev/null
grep -Fx 'resume_state=candidate-await-reboot' "$mistyped_ledger/state" >/dev/null
if grep -F 'action=restore' "$HARNESS_LOG" >/dev/null; then
  printf 'candidate reboot verification failure attempted rollback\n' >&2
  exit 1
fi
unset HARNESS_MISTYPE_GATE
run_gate --mode reconcile "${flow_args[@]/$flow_ledger/$mistyped_ledger}" >/dev/null
grep -Fx 'state=candidate-await-reboot' "$mistyped_ledger/state" >/dev/null

# A transient SSH failure in an automated reboot gate follows the same durable
# failure/reconcile path and can then retry successfully.
cp -a "$flow_ledger" "$TMP/transient-ledger"
transient_ledger="$TMP/transient-ledger"
export HARNESS_LEDGER="$transient_ledger" HARNESS_FAIL_ACTION_ONCE=automated-gates
export HARNESS_FAIL_ACTION_MARKER="$TMP/transient-action-marker"
assert_fails_with 'candidate reboot verification failed; fresh reconcile is required' run_gate \
  --mode candidate-reboot-verify "${flow_args[@]/$flow_ledger/$transient_ledger}" --confirm "$confirm"
grep -Fx 'state=failed-needs-inspection' "$transient_ledger/state" >/dev/null
grep -Fx 'resume_state=candidate-await-reboot' "$transient_ledger/state" >/dev/null
unset HARNESS_FAIL_ACTION_ONCE HARNESS_FAIL_ACTION_MARKER
run_gate --mode reconcile "${flow_args[@]/$flow_ledger/$transient_ledger}" >/dev/null
grep -Fx 'state=candidate-await-reboot' "$transient_ledger/state" >/dev/null
run_interactive candidate-reboot-verify candidate-reboot-verifying "$transient_ledger" "$TMP/transient-retry.tty" \
  "${flow_args[@]/$flow_ledger/$transient_ledger}" --confirm "$confirm"
grep -Fx 'state=complete' "$transient_ledger/state" >/dev/null

export HARNESS_LEDGER="$flow_ledger"
run_interactive candidate-reboot-verify candidate-reboot-verifying "$flow_ledger" "$TMP/candidate-reboot.tty" \
  "${flow_args[@]}" --confirm "$confirm"
grep -Fx 'state=complete' "$flow_ledger/state" >/dev/null
grep -E 'wrapper=attempt-command .*action=automated-gates' "$HARNESS_LOG" >/dev/null
grep -E 'wrapper=attempt-command .*action=acceptance-fingerprint' "$HARNESS_LOG" >/dev/null
if grep -E 'wrapper=(direct|deadline) .*action=(automated-gates|acceptance-fingerprint|rollback-gates)' "$HARNESS_LOG" >/dev/null; then
  printf 'post-activation automated command ran without a remote deadline\n' >&2
  exit 1
fi
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
grep -F 'normalized target or expected physical controller proof changed before acceptance' "$TMP/replacement.tty" >/dev/null
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
