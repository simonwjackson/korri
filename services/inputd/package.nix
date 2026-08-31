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
      || pkgs.lib.hasPrefix "${sourceRootString}/tests/fixtures/" (toString path)
      || toString path == "${sourceRootString}/deploy/device-check.sh";
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
    cargoBuildExtraArgs = "--bin korri-inputd --bin korri-bundle-launch --bin korri-bundle-select --bin korri-sunshine-state-digest --lib";
    postInstall = ''
      # Keep this byte-for-byte identical to the repository gate. The rollout
      # verifies the candidate closure helper against the local source digest.
      install -Dm0555 "$src/deploy/device-check.sh" "$out/bin/korri-device-gate"
    '';
    doCheck = false;
  }
)
