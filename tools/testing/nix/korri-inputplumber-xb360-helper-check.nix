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

  mkdir -p "$out"
  cat > "$out/summary.txt" <<'EOF'
  InputPlumber xb360 helper checks passed.
  EOF
''
