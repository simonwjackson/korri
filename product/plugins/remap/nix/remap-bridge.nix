{ lib, writeShellApplication, bun }:

writeShellApplication {
  name = "korri-remap-bridge";
  runtimeInputs = [ bun ];
  text = ''
    exec ${lib.getExe bun} ${../packages/korri-remap-bridge/index.ts} "$@"
  '';
}
