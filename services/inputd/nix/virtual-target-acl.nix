{
  pkgs,
  deviceRoot ? "/dev/input",
  sysClassRoot ? "/sys/class/input",
  setfacl ? "${pkgs.acl}/bin/setfacl",
}:
pkgs.writeShellApplication {
  name = "korri-virtual-target-acl";
  runtimeInputs = [ pkgs.coreutils ];
  text = ''
    operation="''${1:-}"

    validate_id() {
      case "$1" in
        ""|0|*[!0-9]*)
          echo "ACL identities must be numeric unprivileged IDs" >&2
          exit 64
          ;;
      esac
    }

    validate_target() {
      local requested="$1"
      local target
      local event
      local identity

      target="$(realpath -e -- "$requested")" || return 1
      case "$target" in
        ${deviceRoot}/event[0-9]*) ;;
        *) return 1 ;;
      esac
      event="''${target##*/}"
      case "$event" in
        event*[!0-9]*|event) return 1 ;;
      esac
      identity="${sysClassRoot}/$event/device"
      test "$(cat "$identity/name")" = "Microsoft X-Box 360 pad" || return 1
      test "$(cat "$identity/id/bustype")" = "0003" || return 1
      test "$(cat "$identity/id/vendor")" = "045e" || return 1
      test "$(cat "$identity/id/product")" = "028e" || return 1
      test "$(cat "$identity/id/version")" = "0001" || return 1
      printf '%s\n' "$target"
    }

    grant() {
      local target
      target="$(validate_target "$1")" || {
        echo "refusing ACL change for unvalidated input target: $1" >&2
        return 1
      }
      # Clear all named entries first. This removes identities left by a
      # previous configuration before applying the current exact ACL.
      ${setfacl} -b -- "$target"
      ${setfacl} -m "u:$inputd_uid:r,u:$action_uid:r,m::r" -- "$target"
    }

    revoke() {
      local target
      target="$(validate_target "$1")" || return 0
      ${setfacl} -b -- "$target"
    }

    shopt -s nullglob
    case "$operation" in
      grant)
        test "$#" -eq 4 || exit 64
        inputd_uid="$2"
        action_uid="$3"
        validate_id "$inputd_uid"
        validate_id "$action_uid"
        grant "$4"
        ;;
      reapply)
        test "$#" -eq 3 || exit 64
        inputd_uid="$2"
        action_uid="$3"
        validate_id "$inputd_uid"
        validate_id "$action_uid"
        for target in ${deviceRoot}/event*; do
          if validate_target "$target" >/dev/null 2>&1; then
            grant "$target"
          fi
        done
        ;;
      revoke)
        test "$#" -eq 1 || exit 64
        for target in ${deviceRoot}/event*; do
          revoke "$target"
        done
        ;;
      *)
        echo "usage: korri-virtual-target-acl {grant INPUTD_UID ACTION_UID DEVICE|reapply INPUTD_UID ACTION_UID|revoke}" >&2
        exit 64
        ;;
    esac
  '';
}
