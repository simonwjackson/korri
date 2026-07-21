{
  pkgs,
  inputplumberPlatformHelpers,
}:

pkgs.runCommand "korri-inputplumber-xb360-helper-check" { } ''
  set -eu

  success_root="$TMPDIR/success/share/inputplumber"
  mkdir -p "$success_root/devices"
  cat > "$success_root/devices/01-test.yaml" <<'EOF'
  name: Test Controller
  target:
    - xbox-series
  EOF

  ${inputplumberPlatformHelpers.patchInputplumberXb360Target {
    inputplumberRoot = "$success_root";
    targetDeviceYaml = "01-test.yaml";
  }}

  grep -q '^  - xb360$' "$success_root/devices/01-test.yaml"
  if grep -q '^  - xbox-series$' "$success_root/devices/01-test.yaml"; then
    echo "success fixture still contains xbox-series" >&2
    exit 1
  fi

  missing_root="$TMPDIR/missing/share/inputplumber"
  mkdir -p "$missing_root/devices"
  cat > "$missing_root/devices/01-test.yaml" <<'EOF'
  name: Test Controller
  target:
    - xb360
  EOF

  if (
    ${inputplumberPlatformHelpers.patchInputplumberXb360Target {
      inputplumberRoot = "$missing_root";
      targetDeviceYaml = "01-test.yaml";
    }}
  ); then
    echo "missing-pattern fixture unexpectedly patched successfully" >&2
    exit 1
  fi

  # A' DBus shortcut routing: adds the dbus target device and appends the
  # shortcut->DBus mappings to the Default profile, keeping it valid YAML.
  dbus_root="$TMPDIR/dbus/share/inputplumber"
  mkdir -p "$dbus_root/devices" "$dbus_root/profiles"
  cat > "$dbus_root/devices/02-ayn.yaml" <<'EOF'
  name: AYN
  target_devices:
    - xb360
    - mouse
    - keyboard
  EOF
  cat > "$dbus_root/profiles/default.yaml" <<'EOF'
  version: 1
  kind: DeviceProfile
  name: Default
  mapping:
    - name: Existing
      source_event:
        gamepad:
          button: North
      target_events:
        - gamepad:
            button: North
  EOF

  ${inputplumberPlatformHelpers.addKorriDbusShortcutRouting {
    inputplumberRoot = "$dbus_root";
    targetDeviceYaml = "02-ayn.yaml";
    mappingsFragment = ../../../product/systems/nixos/images/inputplumber-korri-dbus-shortcuts.yaml;
  }}

  grep -qE '^  - dbus$' "$dbus_root/devices/02-ayn.yaml" || {
    echo "dbus target device not added" >&2
    exit 1
  }
  for cap in ui_guide ui_l1 ui_r1 ui_l3 ui_r3 ui_up ui_down ui_left ui_right ui_option ui_select; do
    grep -q "dbus: $cap" "$dbus_root/profiles/default.yaml" || {
      echo "missing A' routing for $cap" >&2
      exit 1
    }
  done
  # The merged Default profile must remain a single valid YAML document whose
  # mapping list keeps the pre-existing entry plus the appended A' entries.
  merged_count=$(${pkgs.yq-go}/bin/yq eval '.mapping | length' "$dbus_root/profiles/default.yaml")
  if [ "$merged_count" -lt 12 ]; then
    echo "merged Default profile has too few mappings ($merged_count)" >&2
    exit 1
  fi

  mkdir -p "$out"
  cat > "$out/summary.txt" <<'EOF'
  InputPlumber xb360 helper checks passed.
  EOF
''
