{
  pkgs,
  melonDsPackage,
}:

pkgs.runCommand "korri-melonds-package-check" { } ''
  test -x ${melonDsPackage}/bin/melonDS
  touch "$out"
''
