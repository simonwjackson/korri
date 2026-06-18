final: prev:
let
  pinnedPkgs =
    import
      (builtins.fetchTarball {
        url = "https://github.com/NixOS/nixpkgs/archive/0c6db2b5d257d845bbee67a38dee43bbca3bd462.tar.gz";
        sha256 = "0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3";
      })
      {
        system = prev.stdenv.hostPlatform.system;
        config.allowUnfree = true;
      };
in
{
  gamescope-korri = final.callPackage ../packages/gamescope-korri/default.nix {
    gamescope = pinnedPkgs.gamescope;
  };
}
