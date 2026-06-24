{ pkgs, gmloaderNextPackage }:

pkgs.runCommand "gmloader-next-check" { nativeBuildInputs = [ gmloaderNextPackage ]; } ''
  set -eu
  command -v gmloader-next
  gmloader-next --version | grep -q korri-gmloader-next-wrapper
  mkdir -p "$out"
  printf '%s\n' ok > "$out/result"
''
