{
  pkgs,
  inputdPackage,
  inputplumberKorri,
  korridPackage,
}:

pkgs.runCommand "korri-bundle-0.0.0" { } ''
  set -euo pipefail
  mkdir -p "$out/bin" "$out/share"
  ln -s ${inputplumberKorri}/bin/inputplumber "$out/bin/inputplumber"
  ln -s ${inputdPackage}/bin/korri-inputd "$out/bin/korri-inputd"
  ln -s ${korridPackage}/bin/korrid "$out/bin/korrid"
  ln -s ${inputplumberKorri}/share/inputplumber "$out/share/inputplumber"
''
