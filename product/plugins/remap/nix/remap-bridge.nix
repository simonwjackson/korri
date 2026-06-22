{ lib, writeShellApplication, bun, python3, acl, util-linux, systemd, sway }:

writeShellApplication {
  name = "korri-remap-bridge";
  runtimeInputs = [ bun python3 acl util-linux systemd sway ];
  text = ''
    export KORRI_REMAP_NATIVE_DRIVER=enabled
    export KORRI_REMAP_NATIVE_DRIVER_PYTHON=${lib.getExe python3}
    export KORRI_REMAP_NATIVE_DRIVER_PATH=${../packages/korri-remap-bridge/native-driver.py}
    exec ${lib.getExe bun} ${../packages/korri-remap-bridge/index.ts} "$@"
  '';
}
