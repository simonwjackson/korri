{ pkgs, crane }:
let
  craneLib = (crane.mkLib pkgs).overrideToolchain pkgs.rust-bin.stable.latest.default;
  sourceRoot = ./.;
  sourceRootString = toString sourceRoot;
  src = pkgs.lib.cleanSourceWith {
    src = sourceRoot;
    filter =
      path: type:
      (craneLib.filterCargoSources path type)
      || pkgs.lib.hasPrefix "${sourceRootString}/tests/fixtures/" (toString path);
  };
  commonArgs = {
    inherit src;
    pname = "korri-inputd";
    version = "0.0.0";
    strictDeps = true;
    meta.mainProgram = "korri-inputd";
  };
  cargoArtifacts = craneLib.buildDepsOnly commonArgs;
in
craneLib.buildPackage (
  commonArgs
  // {
    inherit cargoArtifacts;
    cargoBuildExtraArgs = "--bin korri-inputd --lib";
    doCheck = false;
  }
)
