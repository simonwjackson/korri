{ pkgs, inputplumberKorri }:

pkgs.runCommand "inputplumber-korri-check" { } ''
  set -euo pipefail

  test -x "${inputplumberKorri}/bin/inputplumber" \
    || { echo "inputplumber-korri must expose bin/inputplumber" >&2; exit 1; }

  case "${inputplumberKorri}" in
    *inputplumber-korri*) ;;
    *) echo "inputplumber-korri store path must carry the Korri ownership marker" >&2; exit 1 ;;
  esac

  if test -e "${inputplumberKorri}/share/inputplumber/devices/02-ayn-controller.yaml"; then
    echo "inputplumber-korri must not bundle SM8550 AYN controller maps" >&2
    exit 1
  fi

  touch "$out"
''
