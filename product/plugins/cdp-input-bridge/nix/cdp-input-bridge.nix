{ lib, writeShellApplication, bun, evtest }:

writeShellApplication {
  name = "korri-cdp-input-bridge";
  runtimeInputs = [ bun evtest ];
  text = ''
    exec ${lib.getExe bun} run ${../.}/packages/korri-cdp-input-bridge/index.ts "$@"
  '';
}
