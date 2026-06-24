{ pkgs, gmloaderNextPackage }:

pkgs.runCommand "gmloader-next-check" { nativeBuildInputs = [ gmloaderNextPackage ]; } ''
  set -eu
  command -v gmloader-next
  gmloader-next --version | grep -q korri-gmloader-next-wrapper
  if gmloader-next -c /tmp/missing 2>/tmp/gmloader-next.err; then
    echo "gmloader-next unexpectedly launched without KORRI_GMLOADER_NEXT_BIN" >&2
    exit 1
  fi
  grep -q KORRI_GMLOADER_NEXT_BIN /tmp/gmloader-next.err
  mkdir -p "$out"
  printf '%s\n' ok > "$out/result"
''
