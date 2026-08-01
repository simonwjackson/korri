{ pkgs, craneLib, proseql }:
let
  proseqlSource = import ./proseql-source.nix { inherit pkgs proseql; };
  sourceRoot = ./.;
  cleanSource = pkgs.lib.cleanSourceWith {
    src = sourceRoot;
    filter = path: type:
      (craneLib.filterCargoSources path type)
      # The script unit tests include the checked-in example plugin source.
      || pkgs.lib.hasPrefix "${toString sourceRoot}/examples/" (toString path);
  };
  src = proseqlSource.composeCargoSource cleanSource;
  commonArgs = {
    inherit src;
    strictDeps = true;
    nativeBuildInputs = [
      pkgs.clang
      pkgs.llvmPackages.libclang
    ];
    LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
  };
  cargoArtifacts = craneLib.buildDepsOnly (commonArgs // {
    extraDummyScript = proseqlSource.dummySourceScript;
  });
in
craneLib.buildPackage (commonArgs // {
  inherit cargoArtifacts;
  pname = "korrid";
  version = "0.0.0";
  # Full repository checks run integration tests that include files outside this crate source.
  cargoTestExtraArgs = "--lib --bins";
})
