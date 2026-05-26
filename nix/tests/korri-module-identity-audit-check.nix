{
  pkgs,
  src,
}:

pkgs.runCommand "korri-module-identity-audit" { nativeBuildInputs = [ pkgs.gawk pkgs.gnugrep ]; } ''
  set -eu

  filter_file() {
    awk '
      BEGIN {
        inDescription = 0
        quotePair = sprintf("%c%c", 39, 39)
      }

      function closesDescription(line) {
        return line ~ (quotePair "[[:space:]]*;[[:space:]]*$")
      }

      function opensDescription(line) {
        return line ~ /^[[:space:]]*description[[:space:]]*=/ && index(line, quotePair) > 0
      }

      inDescription {
        print ""
        if (closesDescription($0)) {
          inDescription = 0
        }
        next
      }

      /^[[:space:]]*example[[:space:]]*=/ {
        print ""
        next
      }

      opensDescription($0) {
        print ""
        if (!closesDescription($0)) {
          inDescription = 1
        }
        next
      }

      { print }
    ' "$1"
  }

  scan_pattern() {
    label="$1"
    pattern="$2"
    filtered="$3"
    display="$4"
    matches="$TMPDIR/matches"

    if grep -nE "$pattern" "$filtered" > "$matches"; then
      while IFS=: read -r line text; do
        printf '%s:%s: forbidden %s: %s\n' "$display" "$line" "$label" "$text"
      done < "$matches"
      return 1
    fi

    return 0
  }

  audit_file() {
    file="$1"
    display="$2"
    filtered="$TMPDIR/filtered-$(basename "$file")"
    failed=0

    filter_file "$file" > "$filtered"

    scan_pattern "literal username" '(^|[^[:alnum:]_])simonwjackson([^[:alnum:]_]|$)' "$filtered" "$display" || failed=1
    scan_pattern "UID runtime path" '/run/user/[0-9]+' "$filtered" "$display" || failed=1
    scan_pattern "audio stack mutation" '(^|[^[:alnum:]_])services[.](pipewire|pulseaudio|jack)([^[:alnum:]_]|$)' "$filtered" "$display" || failed=1
    scan_pattern "literal user linger/uid" '(^|[^[:alnum:]_])users[.]users[.][a-z_][a-zA-Z0-9_-]*[[:space:]]*[.][[:space:]]*(linger|uid)[[:space:]]*=' "$filtered" "$display" || failed=1

    return "$failed"
  }

  expect_pass() {
    file="$1"
    display="$2"
    output="$TMPDIR/expect-pass.out"

    if ! audit_file "$file" "$display" > "$output"; then
      echo "korri-module-identity-audit self-test expected pass but failed for $display" >&2
      cat "$output" >&2
      exit 1
    fi
  }

  expect_fail() {
    file="$1"
    display="$2"
    expected="$3"
    output="$TMPDIR/expect-fail.out"

    if audit_file "$file" "$display" > "$output"; then
      echo "korri-module-identity-audit self-test expected failure but passed for $display" >&2
      exit 1
    fi

    grep -F "$display:" "$output" >/dev/null
    grep -F "$expected" "$output" >/dev/null
  }

  fixtures="$TMPDIR/fixtures"
  mkdir -p "$fixtures"

  cat > "$fixtures/allowed-docs.nix" <<'EOF'
  {
    example = "/run/user/1000/pulse/native";
    description = '''
      simonwjackson can document /run/user/1000 and services.pipewire here.
    ''';
    users.users.''${cfg.user}.linger = true;
  }
  EOF
  expect_pass "$fixtures/allowed-docs.nix" "fixtures/allowed-docs.nix"

  cat > "$fixtures/literal-user.nix" <<'EOF'
  { users.users.simonwjackson.linger = true; }
  EOF
  expect_fail "$fixtures/literal-user.nix" "fixtures/literal-user.nix" "literal username"
  grep -F "literal user linger/uid" "$TMPDIR/expect-fail.out" >/dev/null

  cat > "$fixtures/audio-stack.nix" <<'EOF'
  { services.pipewire.enable = true; }
  EOF
  expect_fail "$fixtures/audio-stack.nix" "fixtures/audio-stack.nix" "audio stack mutation"

  cat > "$fixtures/runtime-dir.nix" <<'EOF'
  { environment.variables.XDG_RUNTIME_DIR = "/run/user/1000"; }
  EOF
  expect_fail "$fixtures/runtime-dir.nix" "fixtures/runtime-dir.nix" "UID runtime path"

  failures="$TMPDIR/failures"
  : > "$failures"
  failed=0

  for file in ${src}/korri-*.nix; do
    if ! audit_file "$file" "$(basename "$file")" >> "$failures"; then
      failed=1
    fi
  done

  if [ "$failed" -ne 0 ]; then
    echo "Korri module identity audit failed." >&2
    echo "nix/modules/korri-*.nix must not hardcode host user identity, /run/user/<uid> paths, or host audio-stack mutations." >&2
    echo "Keep those choices in host config so the future Korri system-user migration remains a host-only change." >&2
    cat "$failures" >&2
    exit 1
  fi

  mkdir -p "$out"
  cat > "$out/summary.txt" <<'EOF'
  Korri module identity audit passed.
  EOF
''
