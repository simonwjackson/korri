{
  pkgs,
  melonDsPackage,
  melonDsPresenterPackage,
}:

pkgs.runCommand "korri-melonds-package-check" { } ''
  test -x ${melonDsPackage}/bin/melonDS
  test -x ${melonDsPresenterPackage}/bin/korri-melonds-presenter
  ${melonDsPresenterPackage}/bin/korri-melonds-presenter --help >/dev/null
  touch "$out"
''
