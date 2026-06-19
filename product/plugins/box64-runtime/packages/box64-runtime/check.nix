{ pkgs, package }:

pkgs.runCommand "korri-box64-runtime-check" {} ''
  test -x ${package}/bin/box64
  test -f ${package}/share/korri/box64-runtime/setup-env
  grep -q 'KORRI_BOX64_RUNTIME_BIN=' ${package}/share/korri/box64-runtime/setup-env
  touch $out
''
