{
  pkgs,
  src ? null,
  bunDeps ? null,
  enable ? true,
  gamescopePackage ? null,
  controlBridgePackage ? null,
}:

import ../../../../product/plugins/gamescope/nix/composition.nix {
  inherit
    pkgs
    src
    bunDeps
    enable
    gamescopePackage
    controlBridgePackage
    ;
}
