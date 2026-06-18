# WASM-4 libretro core.
#
# Source is pinned via the `wasm4-src` flake input; bump there with
# `nix flake update wasm4-src` and re-verify this package's colocated check.
#
# This derivation matches the same nixpkgs `mkLibretroCore`-style contract as
# `product/plugins/pico8/packages/libretro-fake-08`: the core and info file live under
# `lib/retroarch/cores`, and the passthru attributes describe that layout for
# RetroArch wrappers and closure-shape checks.
{
  cmake,
  lib,
  stdenv,
  wasm4-src,
}:

stdenv.mkDerivation {
  pname = "libretro-wasm4";
  version =
    if wasm4-src ? shortRev then wasm4-src.shortRev else wasm4-src.lastModifiedDate or "unknown";

  src = wasm4-src;

  nativeBuildInputs = [ cmake ];

  postUnpack = ''
    sourceRoot="$sourceRoot/runtimes/native"
  '';

  # Build only the libretro core. The WASM-4 repository also ships a desktop
  # runtime and web/runtime tooling; Korri consumes the RetroArch core for
  # `.wasm` cartridges, not the standalone player or development CLI.
  configurePhase = ''
    runHook preConfigure
    cmake -S . -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DLIBRETRO=ON \
      -DWASM_BACKEND=wasm3
    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild
    cmake --build build -j"$NIX_BUILD_CORES" --target wasm4_libretro
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 build/wasm4_libretro.so \
      "$out/lib/retroarch/cores/wasm4_libretro.so"
    install -Dm644 ${./wasm4_libretro.info} \
      "$out/lib/retroarch/cores/wasm4_libretro.info"

    # Provenance manifest mirrors the other Korri downstream package lanes so
    # the source pin is discoverable from a built store path.
    mkdir -p "$out/nix-support/libretro-wasm4"
    {
      printf '%s\n' 'pname=libretro-wasm4'
      printf '%s\n' 'version=${
        if wasm4-src ? shortRev then wasm4-src.shortRev else wasm4-src.lastModifiedDate or "unknown"
      }'
      printf '%s\n' 'upstream-repo=github.com/aduros/wasm4'
      printf '%s\n' 'upstream-rev=${wasm4-src.rev or "unknown"}'
      printf '%s\n' 'libretro-core=/lib/retroarch/cores'
      printf '%s\n' 'core=wasm4'
    } > "$out/nix-support/libretro-wasm4/manifest.txt"

    runHook postInstall
  '';

  strictDeps = true;

  passthru = {
    libretroCore = "/lib/retroarch/cores";
    core = "wasm4";
  };

  meta = {
    description = "WASM-4 fantasy-console runtime packaged as a libretro core for Korri opt-ins";
    homepage = "https://wasm4.org";
    license = lib.licenses.isc;
    platforms = lib.platforms.linux;
  };
}
