{ pkgs }:

{
  patchInputplumberXb360Target =
    {
      inputplumberRoot ? "$out/share/inputplumber",
      targetDeviceYaml,
    }:
    ''
      inputplumber_device_yaml="${inputplumberRoot}/devices/${targetDeviceYaml}"
      substituteInPlace "$inputplumber_device_yaml" \
        --replace-fail "  - xbox-series" "  - xb360"
      if ! ${pkgs.gnugrep}/bin/grep -q '^  - xb360$' "$inputplumber_device_yaml"; then
        echo "InputPlumber map $inputplumber_device_yaml does not target xb360 after patch" >&2
        exit 1
      fi
      if ${pkgs.gnugrep}/bin/grep -q '^  - xbox-series$' "$inputplumber_device_yaml"; then
        echo "InputPlumber map $inputplumber_device_yaml still targets xbox-series after patch" >&2
        exit 1
      fi
    '';

  # A': make the DBus target persistent and route the shortcut buttons to it so
  # Korri's inputd reads the chords from a grab-immune D-Bus signal channel
  # instead of the raw virtual pad a foreground game can EVIOCGRAB. Home/Guide is
  # reserved to DBus; gameplay buttons go to the gamepad AND DBus.
  addKorriDbusShortcutRouting =
    {
      inputplumberRoot ? "$out/share/inputplumber",
      targetDeviceYaml,
      mappingsFragment,
      profileYaml ? "default.yaml",
    }:
    ''
      inputplumber_dbus_device="${inputplumberRoot}/devices/${targetDeviceYaml}"
      inputplumber_dbus_profile="${inputplumberRoot}/profiles/${profileYaml}"

      if ! ${pkgs.gnugrep}/bin/grep -qE '^  - dbus$' "$inputplumber_dbus_device"; then
        printf '  - dbus\n' >> "$inputplumber_dbus_device"
      fi
      ${pkgs.gnugrep}/bin/grep -qE '^  - dbus$' "$inputplumber_dbus_device" || {
        echo "InputPlumber $inputplumber_dbus_device is missing the dbus target device" >&2
        exit 1
      }

      cat ${mappingsFragment} >> "$inputplumber_dbus_profile"
      ${pkgs.gnugrep}/bin/grep -q 'dbus: ui_guide' "$inputplumber_dbus_profile" || {
        echo "InputPlumber $inputplumber_dbus_profile is missing the A' shortcut routing" >&2
        exit 1
      }
    '';
}
