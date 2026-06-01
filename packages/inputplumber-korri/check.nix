{ pkgs, inputplumberKorri }:

pkgs.runCommand "inputplumber-korri-check" { } ''
  set -euo pipefail

  inputplumber_bin="${inputplumberKorri}/bin/inputplumber"
  test -x "$inputplumber_bin" \
    || { echo "inputplumber-korri must expose executable bin/inputplumber" >&2; exit 1; }

  if ! head -c 4 "$inputplumber_bin" | grep -q $'\177ELF'; then
    echo "inputplumber-korri bin/inputplumber must be a native executable" >&2
    exit 1
  fi

  touch "$out"
''
