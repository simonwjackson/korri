{
  pkgs,
  inputplumberRuntime,
  inputplumberKorri,
}:

let
  data = import ./inputplumber-data.nix { inherit pkgs; };
  additionalData = pkgs.runCommand "inputplumber-additional-data-check-fixture" { } ''
    mkdir -p "$out/share/inputplumber/devices"
    # This is the real platform-owned profile path selected by legacy's SM8550
    # composition. The content remains owned by the platform data package.
    touch "$out/share/inputplumber/devices/02-ayn-controller.yaml"
  '';
  inputplumberWithAdditionalData = data.compose {
    inherit inputplumberRuntime;
    additionalDataPackages = [ additionalData ];
  };
in
assert inputplumberRuntime.version == "0.75.2";
assert inputplumberRuntime.upstream.owner == "ShadowBlip";
assert inputplumberRuntime.upstream.repo == "InputPlumber";
assert inputplumberRuntime.upstream.tag == "v0.75.2";
assert
  inputplumberRuntime.upstream.sourceHash == "sha256-KiSroDcaWvzr5sP0jzr1GFyk0lHbtCFJrP3g5/b3hLQ=";
assert
  inputplumberRuntime.upstream.cargoHash == "sha256-VwQ38Jv5OvyBqo9BBTnpUjgNwAbWyIdUKFKXsGC6+Mo=";
assert inputplumberRuntime.upstream.patches == [ ];
assert inputplumberKorri.version == inputplumberRuntime.version;
assert inputplumberKorri.upstream == inputplumberRuntime.upstream;
pkgs.runCommand "inputplumber-korri-package-check"
  {
    nativeBuildInputs = [ pkgs.yq-go ];
  }
  ''
    set -euo pipefail

    inputplumber_bin="${inputplumberKorri}/bin/inputplumber"
    inputplumber_root="${inputplumberKorri}/share/inputplumber"
    selected_device="$inputplumber_root/devices/${data.selectedDeviceProfile}"
    default_profile="$inputplumber_root/profiles/default.yaml"
    resolved_profile="$inputplumber_root/profiles/${data.resolvedProfile}"

    test -x "$inputplumber_bin" || {
      echo "inputplumber-korri must expose bin/inputplumber" >&2
      exit 1
    }
    head -c 4 "$inputplumber_bin" | grep -q $'\177ELF' || {
      echo "inputplumber-korri bin/inputplumber must be a native executable" >&2
      exit 1
    }
    "$inputplumber_bin" --version | grep -F '0.75.2' >/dev/null || {
      echo "inputplumber-korri must report upstream version 0.75.2" >&2
      exit 1
    }

    test -f "$selected_device" || {
      echo "selected upstream profile ${data.selectedDeviceProfile} is missing" >&2
      exit 1
    }
    test "$(yq eval '[.target_devices[] | select(. == "xb360")] | length' "$selected_device")" = 1 || {
      echo "selected device profile must target xb360 exactly once" >&2
      exit 1
    }
    test "$(yq eval '[.target_devices[] | select(. == "dbus")] | length' "$selected_device")" = 1 || {
      echo "selected device profile must target dbus exactly once" >&2
      exit 1
    }
    test "$(yq eval '[.target_devices[] | select(. == "xbox-series")] | length' "$selected_device")" = 0 || {
      echo "selected device profile still contains superseded xbox-series target" >&2
      exit 1
    }

    cmp "${inputplumberRuntime}/share/inputplumber/profiles/default.yaml" "$default_profile" || {
      echo "the shared upstream default profile must remain unchanged" >&2
      exit 1
    }
    test -f "$resolved_profile" || {
      echo "the selected device must have a Korri-specific resolved profile" >&2
      exit 1
    }
    for profile in "$inputplumber_root"/profiles/*.yaml; do
      if test "$profile" = "$resolved_profile"; then
        continue
      fi
      profile_name="$(basename "$profile")"
      cmp "${inputplumberRuntime}/share/inputplumber/profiles/$profile_name" "$profile" || {
        echo "unselected profile $profile_name must remain unchanged" >&2
        exit 1
      }
      if grep -q '^  - name: Korri ' "$profile"; then
        echo "unselected profile $profile_name contains Korri routes" >&2
        exit 1
      fi
    done

    test "$(yq eval '[.mapping[] | select(.source_event.gamepad.button == "Guide") | .target_events[] | select(.dbus == "ui_guide")] | length' "$resolved_profile")" = 1 || {
      echo "Guide must route to DBus exactly once" >&2
      exit 1
    }
    test "$(yq eval '[.mapping[] | select(.source_event.gamepad.button == "Guide") | .target_events[] | select(has("gamepad"))] | length' "$resolved_profile")" = 0 || {
      echo "Guide must be DBus-only" >&2
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
      test "$(BUTTON="$button" yq eval '[.mapping[] | select(.source_event.gamepad.button == env(BUTTON)) | .target_events[] | select(.gamepad.button == env(BUTTON))] | length' "$resolved_profile")" = 1 || {
        echo "$button must retain exactly one gameplay route" >&2
        exit 1
      }
      test "$(BUTTON="$button" CAPABILITY="$capability" yq eval '[.mapping[] | select(.source_event.gamepad.button == env(BUTTON)) | .target_events[] | select(.dbus == env(CAPABILITY))] | length' "$resolved_profile")" = 1 || {
        echo "$button must have exactly one $capability DBus route" >&2
        exit 1
      }
    done

    additional_root="${inputplumberWithAdditionalData}/share/inputplumber"
    test -f "$additional_root/devices/02-ayn-controller.yaml" || {
      echo "additional platform data was not composed into the resolved root" >&2
      exit 1
    }
    test -f "$additional_root/schema/device_profile_v1.json" || {
      echo "upstream runtime data was lost while composing additional data" >&2
      exit 1
    }
    test -x "${inputplumberWithAdditionalData}/bin/inputplumber" || {
      echo "upstream runtime executable was lost while composing additional data" >&2
      exit 1
    }

    drift_root="$TMPDIR/schema-drift/share/inputplumber"
    mkdir -p "$drift_root/devices" "$drift_root/profiles"
    cp "${inputplumberRuntime}/share/inputplumber/devices/${data.selectedDeviceProfile}" \
      "$drift_root/devices/${data.selectedDeviceProfile}"
    cp "${inputplumberRuntime}/share/inputplumber/profiles/default.yaml" \
      "$drift_root/profiles/default.yaml"
    yq eval -i '.target_devices[0] = "renamed-upstream-target"' \
      "$drift_root/devices/${data.selectedDeviceProfile}"
    if (
      ${data.transformSelectedProfile { inputplumberRoot = "$drift_root"; }}
    ); then
      echo "changed selected-profile schema unexpectedly passed composition" >&2
      exit 1
    fi

    rm "$drift_root/devices/${data.selectedDeviceProfile}"
    if (
      ${data.transformSelectedProfile { inputplumberRoot = "$drift_root"; }}
    ); then
      echo "missing selected profile unexpectedly passed composition" >&2
      exit 1
    fi

    touch "$out"
  ''
