# THROWAWAY PROTOTYPE toolchain: host Rust + Android Rust + contract generation.
{ pkgs }:
let
  androidShell = import ../../clients/android/devshell.nix { inherit pkgs; };
  rustToolchain = pkgs.rust-bin.stable.latest.default.override {
    targets = [ "aarch64-linux-android" ];
  };
in
pkgs.mkShell {
  inputsFrom = [ androidShell ];
  packages = with pkgs; [
    rustToolchain
    cargo-ndk
    typeshare
    bun
    curl
    jq
    just
    unzip
  ];

  JAVA_HOME = androidShell.JAVA_HOME;
  GRADLE_OPTS = androidShell.GRADLE_OPTS;

  shellHook = androidShell.shellHook + ''
    export CARGO_TARGET_DIR="$PWD/.cache/korrid-target"
    echo "Korrid toolchain ready"
  '';
}
