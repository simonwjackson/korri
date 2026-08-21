{ pkgs }:

let
  inherit (pkgs) lib;
  selectedDeviceProfile = "60-xbox_one_gamepad.yaml";
  selectedDeviceName = "Microsoft X-Box One pad";
  resolvedProfile = "korri-${selectedDeviceProfile}";
  shortcutMappings = ./inputplumber-korri-dbus-shortcuts.yaml;

  transformSelectedProfile =
    { inputplumberRoot }:
    ''
      selected_device="${inputplumberRoot}/devices/${selectedDeviceProfile}"
      default_profile="${inputplumberRoot}/profiles/default.yaml"
      resolved_profile="${inputplumberRoot}/profiles/${resolvedProfile}"

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
        && test "$(yq eval '.options.auto_manage // false' "$selected_device")" = false \
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

      test ! -e "$resolved_profile" || {
        echo "Korri resolved profile ${resolvedProfile} already exists upstream" >&2
        exit 1
      }

      yq eval -i '.options.auto_manage = true | .target_devices = ["xb360", "mouse", "keyboard"]' "$selected_device"
      cp "$default_profile" "$resolved_profile"
      yq eval -i '.name = "Korri ${selectedDeviceName}"' "$resolved_profile"
      cat ${shortcutMappings} >> "$resolved_profile"

      test "$(yq eval '.options.auto_manage' "$selected_device")" = true \
        && test "$(yq eval -o=json -I=0 '.target_devices' "$selected_device")" = '["xb360","mouse","keyboard"]' || {
        echo "selected profile auto-management or target transform produced unexpected data" >&2
        exit 1
      }
      upstream_mapping_count="$(yq eval '.mapping | length' "$default_profile")"
      shortcut_mapping_count="$(yq eval 'length' ${shortcutMappings})"
      test "$shortcut_mapping_count" -gt 0 \
        && test "$(yq eval '.mapping | length' "$resolved_profile")" \
          -eq "$((upstream_mapping_count + shortcut_mapping_count))" \
        && test "$(yq eval -o=json -I=0 ".mapping | .[$upstream_mapping_count:]" "$resolved_profile")" \
          = "$(yq eval -o=json -I=0 '.' ${shortcutMappings})" || {
          echo "Korri resolved profile must append the authoritative shortcut mappings exactly once" >&2
          exit 1
        }
    '';

  composeResolved =
    {
      inputplumberKorri,
      additionalDataPackages ? [ ],
    }:
    pkgs.runCommand "inputplumber-korri-resolved-${inputplumberKorri.version}"
      {
        pname = "inputplumber-korri";
        version = inputplumberKorri.version;
        passthru = (inputplumberKorri.passthru or { }) // {
          inherit additionalDataPackages;
        };
        meta = inputplumberKorri.meta;
      }
      ''
        set -euo pipefail
        cp -a ${inputplumberKorri} "$out"
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
          inherit selectedDeviceProfile resolvedProfile additionalDataPackages;
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
  inherit
    compose
    composeResolved
    transformSelectedProfile
    selectedDeviceProfile
    resolvedProfile
    ;
}
