# Colocated package check for libretro-fake-08.
#
# Asserts that the produced derivation matches the nixpkgs `mkLibretroCore`
# contract that `pkgs.retroarch-bare.passthru.wrapper { cores = [ ... ]; }`
# consumes: the `.so` and `.info` live under `lib/retroarch/cores/`, the
# `core` and `libretroCore` passthru attributes are present with the
# expected shape, and the Korri provenance manifest landed.
#
# This file is intentionally colocated with the package rather than living
# under `nix/tests/`. The package's "is the artifact correct" question
# belongs next to the artifact; system-level closure-shape assertions stay
# under `nix/tests/` alongside the existing per-platform config checks.
{
  pkgs,
  libretroFake08Package,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  pkg = libretroFake08Package;

  checks = [
    (check "libretro-fake-08 pname follows the nixpkgs libretro core naming convention" (
      pkg.pname == "libretro-fake-08"
    ))
    (check "libretro-fake-08 exposes the canonical libretroCore install path" (
      (pkg.passthru.libretroCore or null) == "/lib/retroarch/cores"
    ))
    (check "libretro-fake-08 exposes the canonical core identifier read by retroarch-bare's wrapper" (
      (pkg.passthru.core or null) == "fake08"
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "libretro-fake-08 check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "libretro-fake-08-check"
    {
      passthru = {
        inherit (pkg.passthru) core libretroCore;
      };
    }
    ''
      mkdir -p "$out"

      # Artifact shape: the .so and .info live where retroarch-bare's wrapper
      # expects them. The wrapper resolves `coresPath` by reading each core's
      # `passthru.libretroCore` string and concatenating it onto the core's
      # outPath, so the on-disk layout must agree with the passthru value.
      test -f ${pkg}/lib/retroarch/cores/fake08_libretro.so
      test -f ${pkg}/lib/retroarch/cores/fake08_libretro.info

      # ELF magic check — guards against a degenerate build that produces a
      # zero-byte or text file the loader would silently reject.
      magic=$(head -c4 ${pkg}/lib/retroarch/cores/fake08_libretro.so | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "7f454c46" ]; then
        echo "error: fake08_libretro.so is not an ELF binary (magic: $magic)" >&2
        exit 1
      fi

      # Provenance manifest landed.
      test -f ${pkg}/nix-support/libretro-fake-08/manifest.txt

      cat > "$out/summary.txt" <<'EOF'
      libretro-fake-08 derivation passes mkLibretroCore-contract and artifact-shape checks.
      EOF
    ''
