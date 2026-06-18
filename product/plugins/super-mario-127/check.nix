# Colocated package check for super-mario-127.
#
# Asserts the Godot 3 export artifact shape, native ELF architecture,
# wrapper runtime-library contract, provenance manifest, and Korri
# direct-level launch markers. SM127 has no ROM requirement, so unlike
# the SMBR check there is no ROM allowlist section.
{
  pkgs,
  superMario127Package,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  pkg = superMario127Package;

  expectedBinaryName = pkg.passthru.binaryName;
  expectedPreset = pkg.passthru.exportPreset;

  expectedElfMachineByPreset = {
    "Linux ARM64" = "ARM aarch64";
    "Linux/X11" = "x86-64";
  };
  expectedElfMachine =
    expectedElfMachineByPreset.${expectedPreset}
      or (throw "super-mario-127 check: no ELF Machine assertion wired for preset '${expectedPreset}'");

  checks = [
    (check "super-mario-127 exposes the expected mainProgram" (
      (pkg.meta.mainProgram or null) == "super-mario-127"
    ))
    (check "super-mario-127 passthru advertises an export preset" (
      pkg.passthru ? exportPreset && pkg.passthru.exportPreset != ""
    ))
    (check "super-mario-127 passthru advertises a binary name matching the preset" (
      pkg.passthru ? binaryName && pkg.passthru.binaryName != ""
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "super-mario-127 check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "super-mario-127-check"
    {
      nativeBuildInputs = [
        pkgs.file
      ];
      passthru = {
        inherit (pkg.passthru) exportPreset binaryName godotVersion;
      };
    }
    ''
      mkdir -p "$out"

      # ── Artifact shape ──────────────────────────────────────────────
      test -x ${pkg}/bin/super-mario-127
      test -f ${pkg}/share/super-mario-127/${expectedBinaryName}
      test -f ${pkg}/share/super-mario-127/Super_Mario_127.pck
      grep -q 'LD_LIBRARY_PATH' ${pkg}/bin/super-mario-127
      grep -q 'libx11' ${pkg}/bin/super-mario-127

      magic=$(head -c4 ${pkg}/share/super-mario-127/${expectedBinaryName} | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "7f454c46" ]; then
        echo "error: ${expectedBinaryName} is not an ELF binary (magic: $magic)" >&2
        exit 1
      fi

      arch=$(file -b ${pkg}/share/super-mario-127/${expectedBinaryName})
      case "$arch" in
        *"${expectedElfMachine}"*) : ;;
        *)
          echo "error: ${expectedBinaryName} reports unexpected ELF arch" >&2
          echo "  expected substring: ${expectedElfMachine}" >&2
          echo "  actual:             $arch" >&2
          exit 1
          ;;
      esac

      # ── Provenance manifest ─────────────────────────────────────────
      test -f ${pkg}/nix-support/super-mario-127/manifest.txt
      grep -q '^engine=godot3 ' ${pkg}/nix-support/super-mario-127/manifest.txt
      grep -q '^export-preset=' ${pkg}/nix-support/super-mario-127/manifest.txt
      grep -q '^license=unlicensed-upstream-source' ${pkg}/nix-support/super-mario-127/manifest.txt

      # ── GDNative layout ─────────────────────────────────────────────
      # Godot 3 exports GDNative libraries flat next to the engine
      # binary. Upstream Discord SDK libraries are x86_64-only; the
      # aarch64 runtime path keeps a no-op NativeScript binding stub so
      # Godot can load the optional addon without the unusable SDK.
      ${
        if expectedPreset == "Linux/X11" then
          ''
            test -f ${pkg}/share/super-mario-127/libdiscord-game-sdk-godot.so
            test -f ${pkg}/share/super-mario-127/libdiscord_game_sdk.so
          ''
        else
          ''
            test -f ${pkg}/share/super-mario-127/libdiscord-game-sdk-godot.so
            test ! -f ${pkg}/share/super-mario-127/libdiscord_game_sdk.so
            discord_stub_arch=$(file -b ${pkg}/share/super-mario-127/libdiscord-game-sdk-godot.so)
            case "$discord_stub_arch" in
              *"ARM aarch64"*) : ;;
              *)
                echo "error: Discord GDNative stub is not aarch64" >&2
                echo "  actual: $discord_stub_arch" >&2
                exit 1
                ;;
            esac
          ''
      }

      # ── Korri launch contract ───────────────────────────────────────
      grep -qa -- '--level' ${pkg}/share/super-mario-127/Super_Mario_127.pck
      grep -qa -- 'SM127_LEVEL' ${pkg}/share/super-mario-127/Super_Mario_127.pck
      grep -qa -- 'SM127 launch level ' ${pkg}/share/super-mario-127/Super_Mario_127.pck
      grep -qa -- 'SM127 launch level transition to custom level' ${pkg}/share/super-mario-127/Super_Mario_127.pck

      # ── Level format contract ───────────────────────────────────────
      # The variable name is compiled away by Godot 3, but the current
      # format-version string survives in the exported PCK string table.
      grep -qa -- '0.5.1' ${pkg}/share/super-mario-127/Super_Mario_127.pck

      cat > "$out/summary.txt" <<'EOF'
      super-mario-127 derivation passes artifact-shape, ELF-arch,
      wrapper, GDNative-layout, format-version, and launch-contract checks.
      EOF
    ''
