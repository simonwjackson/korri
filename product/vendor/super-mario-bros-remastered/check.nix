# Colocated package check for smb-remastered.
#
# Asserts:
#
#   - The exported binary + game data + engine-version-bearing manifest
#     all land in the expected on-disk shape, including Godot's flat
#     exported GDExtension `.so` layout.
#
#   - The native architecture of the produced ELF matches the build
#     system. (Catches a class of misconfiguration where the build
#     accidentally runs the wrong export preset, e.g. picking the
#     `Linux x86` preset on aarch64.)
#
#   - The in-game `ROMVerifier.is_valid_rom` allowlist still accepts
#     the two SHA-256s this revision pinned for. Upstream may add or
#     remove entries (e.g. accept a new dump revision); a change there
#     is a user-visible contract change — the user's previously
#     accepted `baserom.nes` may stop being accepted — and should
#     force a deliberate version bump + README update rather than
#     silently propagating.
#
# This file is intentionally colocated with the package rather than
# living under `tools/testing/nix/`. The package's "is the artifact
# correct" question belongs next to the artifact; system-level
# closure-shape assertions stay under `tools/testing/nix/` alongside
# the existing per-platform config checks.
{
  pkgs,
  smbRemasteredPackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  pkg = smbRemasteredPackage;

  expectedBinaryName = pkg.passthru.binaryName;
  expectedPreset = pkg.passthru.exportPreset;

  # Pinned from the upstream `Scripts/Parts/ROMVerifier.gd` (extracted
  # from the SMB1R.pck of the `1.1-26w21c` release). The hashes are
  # SHA-256 over base64 of the post-iNES-header bytes — see
  # `vanilla_4076261742_get_hash` in upstream. If upstream adds or
  # removes entries, this assertion fails until the package is
  # deliberately re-pinned.
  pinnedRomHashes = [
    "6a54024d5abe423b53338c9b418e0c2ffd86fed529556348e52ffca6f9b53b1a"
    "c9b34443c0414f3b91ef496d8cfee9fdd72405d673985afa11fb56732c96152b"
  ];

  # The export preset's selected ELF machine type, in the substring
  # `file -b` writes for that architecture. Asserted against the
  # actual produced binary to catch wrong-preset-for-arch
  # misconfiguration (e.g. picking the `Linux x86` preset on
  # aarch64-linux because of a typo in the preset/system map).
  expectedElfMachineByPreset = {
    "Linux ARM64" = "ARM aarch64";
    "Linux x86" = "x86-64";
  };
  expectedElfMachine =
    expectedElfMachineByPreset.${expectedPreset}
      or (throw "smb-remastered check: no ELF Machine assertion wired for preset '${expectedPreset}'");

  checks = [
    (check "smb-remastered exposes a non-empty mainProgram" (
      (pkg.meta.mainProgram or null) == "smb-remastered"
    ))
    (check "smb-remastered passthru advertises an export preset" (
      pkg.passthru ? exportPreset && pkg.passthru.exportPreset != ""
    ))
    (check "smb-remastered passthru advertises a binary name matching the preset" (
      pkg.passthru ? binaryName && pkg.passthru.binaryName != ""
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "smb-remastered check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "smb-remastered-check"
    {
      nativeBuildInputs = [
        pkgs.file
        pkgs.binutils
      ];
      passthru = {
        inherit (pkg.passthru) exportPreset binaryName;
      };
    }
    ''
      mkdir -p "$out"

      # ── Artifact shape ──────────────────────────────────────────────
      test -x ${pkg}/bin/smb-remastered
      test -f ${pkg}/share/smb-remastered/${expectedBinaryName}
      test -f ${pkg}/share/smb-remastered/SMB1R.pck
      grep -q 'LD_LIBRARY_PATH' ${pkg}/bin/smb-remastered
      grep -q 'libx11' ${pkg}/bin/smb-remastered

      # ELF magic — guards against the bin symlink accidentally pointing
      # at the wrong file.
      magic=$(head -c4 ${pkg}/share/smb-remastered/${expectedBinaryName} | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "7f454c46" ]; then
        echo "error: ${expectedBinaryName} is not an ELF binary (magic: $magic)" >&2
        exit 1
      fi

      # ELF machine — guards against running the wrong export preset
      # for the build system (e.g. exporting "Linux x86" on
      # aarch64-linux). `file -b` reports the architecture in a stable,
      # parseable form.
      arch=$(file -b ${pkg}/share/smb-remastered/${expectedBinaryName})
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
      test -f ${pkg}/nix-support/smb-remastered/manifest.txt
      grep -q '^engine=godot ' ${pkg}/nix-support/smb-remastered/manifest.txt
      grep -q '^export-preset=' ${pkg}/nix-support/smb-remastered/manifest.txt

      # ── GDExtension layout ──────────────────────────────────
      # Godot's exporter flattens GDExtension native libraries: every
      # `.so` declared by a `.gdextension` manifest is copied next to
      # the engine binary regardless of its source-tree subdirectory.
      # The `.gdextension` files themselves are baked into
      # `SMB1R.pck`. At runtime Godot's GDExtension loader resolves
      # library names against the binary's own directory. Assert the
      # flat layout the exporter produces — not the source-tree
      # subdirectory layout, which does not survive export.
      ${
        if expectedPreset == "Linux ARM64" then
          ''
            test -f ${pkg}/share/smb-remastered/libgodotgif.linux.template_release.arm64.so
          ''
        else
          ''
            test -f ${pkg}/share/smb-remastered/libgodotgif.linux.template_release.x86_64.so
            # On x86_64 the Discord Game SDK + binding are usable and
            # do ship in the export. On aarch64 they would still be
            # written next to the binary (the exporter is
            # architecture-blind to gdextension dependencies) but the
            # DiscordManager.gd autoload guard prevents any dlopen of
            # them — so absence vs presence of those `.so`s on aarch64
            # is not a contract.
            test -f ${pkg}/share/smb-remastered/libdiscord_game_sdk.so
            test -f ${pkg}/share/smb-remastered/libdiscord_game_sdk_binding.so
          ''
      }

      # ── Korri launch contract ───────────────────────────────────────
      # Korri carries a small source patch that adds `--level` for kiosk
      # and remote-launch workflows. The flag string is compiled into
      # SMB1R.pck; assert it survives export so the runtime launch
      # contract cannot silently regress.
      grep -qa -- '--level' ${pkg}/share/smb-remastered/SMB1R.pck
      grep -qa -- 'Launch level ' ${pkg}/share/smb-remastered/SMB1R.pck
      grep -qa -- 'transition_to_launch_target_or_title' ${pkg}/share/smb-remastered/SMB1R.pck
      grep -qa -- 'Launch level transition to custom level' ${pkg}/share/smb-remastered/SMB1R.pck

      # ── ROM allowlist contract ──────────────────────────────────────
      # Upstream `ROMVerifier.gd` is compiled into SMB1R.pck. The hash
      # strings appear verbatim in the binary form (string-table
      # entries). Grep for each pinned hash; missing == upstream
      # changed the allowlist and the package needs a deliberate
      # version + README update.
      ${lib.concatMapStringsSep "\n" (h: ''
        if ! grep -qa "${h}" ${pkg}/share/smb-remastered/SMB1R.pck; then
          echo "error: upstream ROMVerifier no longer accepts pinned hash ${h}" >&2
          echo "       update product/vendor/super-mario-bros-remastered/{check.nix,README.md}" >&2
          exit 1
        fi
      '') pinnedRomHashes}

      cat > "$out/summary.txt" <<'EOF'
      smb-remastered derivation passes artifact-shape, ELF-arch,
      GDExtension-layout, and ROM-allowlist contract checks.
      EOF
    ''
