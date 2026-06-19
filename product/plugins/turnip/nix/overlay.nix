{ nixpkgs-mesa }:

final: _prev: {
  korriWrapWithTurnip =
    args: final.callPackage ../packages/turnip-wrapper/default.nix (args // { inherit nixpkgs-mesa; });
}
