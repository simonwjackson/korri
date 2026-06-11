# Colocated package check for libretro-wasm4.
#
# Asserts that the produced derivation matches the same libretro-core contract
# used by libretro-fake-08: core artifacts live under lib/retroarch/cores, the
# passthru attributes are present, and the provenance manifest landed.
{
  libretroWasm4Package,
  pkgs,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  pkg = libretroWasm4Package;

  checks = [
    (check "libretro-wasm4 pname follows the nixpkgs libretro core naming convention" (
      pkg.pname == "libretro-wasm4"
    ))
    (check "libretro-wasm4 exposes the canonical libretroCore install path" (
      (pkg.passthru.libretroCore or null) == "/lib/retroarch/cores"
    ))
    (check "libretro-wasm4 exposes the canonical core identifier read by retroarch-bare's wrapper" (
      (pkg.passthru.core or null) == "wasm4"
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "libretro-wasm4 check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "libretro-wasm4-check"
    {
      passthru = {
        inherit (pkg.passthru) core libretroCore;
      };
    }
    ''
      mkdir -p "$out"

      test -f ${pkg}/lib/retroarch/cores/wasm4_libretro.so
      test -f ${pkg}/lib/retroarch/cores/wasm4_libretro.info

      magic=$(head -c4 ${pkg}/lib/retroarch/cores/wasm4_libretro.so | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "7f454c46" ]; then
        echo "error: wasm4_libretro.so is not an ELF binary (magic: $magic)" >&2
        exit 1
      fi

      test -f ${pkg}/nix-support/libretro-wasm4/manifest.txt
      grep -q '^core=wasm4$' ${pkg}/nix-support/libretro-wasm4/manifest.txt

      cat > "$out/summary.txt" <<'EOF'
      libretro-wasm4 derivation passes libretro-core-contract and artifact-shape checks.
      EOF
    ''
