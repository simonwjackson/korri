# fake-08 libretro core (PICO-8 reimplementation).
#
# Source pinned via the `fake-08-src` flake input; bump there with
# `nix flake update fake-08-src` and re-verify the closure-shape check.
#
# This derivation conforms to the nixpkgs `mkLibretroCore` contract so it
# can be dropped straight into `pkgs.retroarch-bare.passthru.wrapper`:
#
#   - `pname = "libretro-fake-08"` (matches the `libretro-<name>` convention
#     used by every `pkgs.libretro.*` core)
#   - `passthru.libretroCore = "/lib/retroarch/cores"` (string path the
#     wrapper concatenates onto each core's outPath to compose -L flags)
#   - `passthru.core = "fake08"` (string identifier the wrapper's
#     longDescription reads and the kiosk closure-shape check asserts on)
#
# The libretro Makefile's `platform=unix` branch is dependency-light: only
# `gcc/g++` and `-lm`. No SDL, no pkg-config, no devkitpro headers. The
# `fake08_libretro.info` file is checked into the source tree (the Makefile
# does not produce it) and is copied alongside the built `.so` so RetroArch
# can discover the core without consulting the upstream libretro-core-info
# database (which does not list fake-08).
{
  lib,
  stdenv,
  fake-08-src,
}:

stdenv.mkDerivation {
  pname = "libretro-fake-08";
  version =
    if fake-08-src ? shortRev then
      fake-08-src.shortRev
    else
      fake-08-src.lastModifiedDate or "unknown";

  src = fake-08-src;

  # Build only the libretro target. The repo also ships SDL2 and platform
  # subtrees we deliberately do not consume — the kiosk closure uses
  # RetroArch + the libretro core, not the standalone player.
  buildPhase = ''
    runHook preBuild
    make -C platform/libretro -j"$NIX_BUILD_CORES" platform=unix
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 platform/libretro/fake08_libretro.so \
      "$out/lib/retroarch/cores/fake08_libretro.so"

    # `.info` is source-tree, not a build artifact.
    install -Dm644 platform/libretro/fake08_libretro.info \
      "$out/lib/retroarch/cores/fake08_libretro.info"

    # Provenance manifest mirrors the moonlight-embedded-korri pattern so
    # the source pin is discoverable from a built store path.
    mkdir -p "$out/nix-support/libretro-fake-08"
    {
      printf '%s\n' 'pname=libretro-fake-08'
      printf '%s\n' 'version=${
        if fake-08-src ? shortRev then
          fake-08-src.shortRev
        else
          fake-08-src.lastModifiedDate or "unknown"
      }'
      printf '%s\n' 'upstream-repo=github.com/jtothebell/fake-08'
      printf '%s\n' 'upstream-rev=${fake-08-src.rev or "unknown"}'
      printf '%s\n' 'libretro-core=/lib/retroarch/cores'
      printf '%s\n' 'core=fake08'
    } > "$out/nix-support/libretro-fake-08/manifest.txt"

    runHook postInstall
  '';

  # Strict deps: no buildInputs needed beyond stdenv for the unix libretro
  # target — confirmed against platform/libretro/Makefile (`-lm` only,
  # no external libraries linked in the `platform=unix` branch).
  strictDeps = true;

  passthru = {
    # Wrapper contract: read by pkgs.retroarch-bare.passthru.wrapper.
    libretroCore = "/lib/retroarch/cores";
    core = "fake08";
  };

  meta = {
    description = "PICO-8 reimplementation packaged as a libretro core for Korri kiosk closures";
    homepage = "https://github.com/jtothebell/fake-08";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    # No mainProgram: libretro cores are loaded by RetroArch (`-L <core.so>`),
    # not invoked directly.
  };
}
