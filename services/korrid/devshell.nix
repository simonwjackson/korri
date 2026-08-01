# THROWAWAY PROTOTYPE toolchain: host Rust + Android Rust + contract generation.
{ pkgs, proseql }:
let
  androidShell = import ../../clients/android/devshell.nix { inherit pkgs; };
  proseqlSource = import ./proseql-source.nix { inherit pkgs proseql; };
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
    # SPIKE: rquickjs-sys ships no aarch64-linux-android bindings, so it needs
    # the bindgen feature, which needs libclang at build time.
    llvmPackages.libclang
    clang
    bun
    curl
    git
    jq
    openssh
    unzip
  ];

  JAVA_HOME = androidShell.JAVA_HOME;
  GRADLE_OPTS = androidShell.GRADLE_OPTS;

  LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";

  shellHook = androidShell.shellHook + ''
    ${proseqlSource.hydrateShell}
    export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
    # SPIKE: cargo-ndk exports CC globally, so host-targeted C compiles (build
    # scripts, host artifacts) would pick up the NDK clang and fail to find
    # glibc headers. Pin the host compiler explicitly.
    export HOST_CC="${pkgs.clang}/bin/clang"
    export CC_x86_64_unknown_linux_gnu="${pkgs.clang}/bin/clang"
    # SPIKE: bindgen runs libclang directly and does not inherit cargo-ndk's
    # target flags, so it must be told where Android's headers live. Scoped to
    # the android target so host bindgen runs are unaffected.
    KORRI_NDK_SYSROOT="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/sysroot"
    KORRI_BINDGEN_ARGS="--target=aarch64-linux-android21 --sysroot=$KORRI_NDK_SYSROOT"
    export BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android="$KORRI_BINDGEN_ARGS"
    export BINDGEN_EXTRA_CLANG_ARGS="$KORRI_BINDGEN_ARGS"
    echo "Korrid toolchain ready"
  '';
}
