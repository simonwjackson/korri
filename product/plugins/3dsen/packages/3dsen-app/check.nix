{ pkgs, package }:

pkgs.runCommand "korri-3dsen-app-check" {} ''
  test -x ${package}/bin/3dsen
  grep -q '3dSen.exe' ${package}/bin/3dsen
  touch $out
''
