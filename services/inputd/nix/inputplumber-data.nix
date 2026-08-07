{ pkgs }:

let
  inherit (pkgs) lib;
  selectedDeviceProfile = "60-xbox_one_gamepad.yaml";
  selectedDeviceName = "Microsoft X-Box One pad";
  shortcutMappings = ./inputplumber-korri-dbus-shortcuts.yaml;

  transformSelectedProfile =
    { inputplumberRoot }:
    ''
      selected_device="${inputplumberRoot}/devices/${selectedDeviceProfile}"
      default_profile="${inputplumberRoot}/profiles/default.yaml"

      test -f "$selected_device" || {
        echo "selected upstream profile ${selectedDeviceProfile} is missing" >&2
        exit 1
      }
      test -f "$default_profile" || {
        echo "selected upstream profile default.yaml is missing" >&2
        exit 1
      }

      test "$(yq eval '.version' "$selected_device")" = 1 \
        && test "$(yq eval '.kind' "$selected_device")" = CompositeDevice \
        && test "$(yq eval '.name' "$selected_device")" = '${selectedDeviceName}' \
        && test "$(yq eval -o=json -I=0 '.target_devices' "$selected_device")" = '["xbox-series","mouse","keyboard"]' || {
          echo "selected upstream profile ${selectedDeviceProfile} changed schema or target policy" >&2
          exit 1
        }

      test "$(yq eval '.version' "$default_profile")" = 1 \
        && test "$(yq eval '.kind' "$default_profile")" = DeviceProfile \
        && test "$(yq eval '.name' "$default_profile")" = Default \
        && test "$(yq eval '.mapping | type' "$default_profile")" = '!!seq' \
        && test "$(yq eval '[.mapping[].target_events[] | select(has("dbus"))] | length' "$default_profile")" = 0 || {
          echo "selected upstream profile default.yaml changed schema or already contains Korri DBus routing" >&2
          exit 1
        }

      yq eval -i '.target_devices = ["xb360", "mouse", "keyboard", "dbus"]' "$selected_device"
      cat ${shortcutMappings} >> "$default_profile"

      test "$(yq eval -o=json -I=0 '.target_devices' "$selected_device")" = '["xb360","mouse","keyboard","dbus"]' || {
        echo "selected profile target transform produced unexpected data" >&2
        exit 1
      }
      test "$(yq eval '[.mapping[] | select(.source_event.gamepad.button == "Guide") | .target_events[] | select(.dbus == "ui_guide")] | length' "$default_profile")" = 1 \
        && test "$(yq eval '[.mapping[] | select(.source_event.gamepad.button == "Guide") | .target_events[] | select(has("gamepad"))] | length' "$default_profile")" = 0 || {
          echo "Korri Guide route must be DBus-only and composed exactly once" >&2
          exit 1
        }

      for route in \
        'LeftBumper:ui_l1' \
        'RightBumper:ui_r1' \
        'LeftStick:ui_l3' \
        'RightStick:ui_r3' \
        'DPadUp:ui_up' \
        'DPadDown:ui_down' \
        'DPadLeft:ui_left' \
        'DPadRight:ui_right' \
        'Start:ui_option' \
        'Select:ui_select'
      do
        button="''${route%%:*}"
        capability="''${route#*:}"
        test "$(BUTTON="$button" yq eval '[.mapping[] | select(.source_event.gamepad.button == env(BUTTON)) | .target_events[] | select(.gamepad.button == env(BUTTON))] | length' "$default_profile")" = 1 \
          && test "$(BUTTON="$button" CAPABILITY="$capability" yq eval '[.mapping[] | select(.source_event.gamepad.button == env(BUTTON)) | .target_events[] | select(.dbus == env(CAPABILITY))] | length' "$default_profile")" = 1 || {
            echo "Korri $button route must retain gameplay and add exactly one $capability DBus copy" >&2
            exit 1
          }
      done
    '';

  compose =
    {
      inputplumberRuntime,
      additionalDataPackages ? [ ],
    }:
    pkgs.runCommand "inputplumber-korri-${inputplumberRuntime.version}"
      {
        pname = "inputplumber-korri";
        version = inputplumberRuntime.version;
        nativeBuildInputs = [ pkgs.yq-go ];
        passthru = {
          upstream = inputplumberRuntime.upstream;
          inherit selectedDeviceProfile additionalDataPackages;
        };
        meta = inputplumberRuntime.meta // {
          description = "Pinned InputPlumber with Korri's resolved input data root";
          mainProgram = "inputplumber";
        };
      }
      ''
        set -euo pipefail

        cp -a ${inputplumberRuntime} "$out"
        chmod -R u+w "$out"
        inputplumber_root="$out/share/inputplumber"

        ${lib.concatMapStringsSep "\n" (dataPackage: ''
          additional_root="${dataPackage}/share/inputplumber"
          test -d "$additional_root" || {
            echo "additional InputPlumber data package ${dataPackage} has no share/inputplumber root" >&2
            exit 1
          }
          while IFS= read -r -d $'\0' additional_file; do
            relative_path="''${additional_file#"$additional_root/"}"
            destination="$inputplumber_root/$relative_path"
            if test -e "$destination" || test -L "$destination"; then
              echo "additional InputPlumber data collides with resolved path $relative_path" >&2
              exit 1
            fi
            mkdir -p "$(dirname "$destination")"
            cp -a "$additional_file" "$destination"
          done < <(find "$additional_root" \( -type f -o -type l \) -print0 | sort -z)
        '') additionalDataPackages}

        ${transformSelectedProfile { inputplumberRoot = "$inputplumber_root"; }}
      '';
in
{
  inherit compose transformSelectedProfile selectedDeviceProfile;
}
