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
}
