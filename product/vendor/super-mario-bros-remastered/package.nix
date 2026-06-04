# Super Mario Bros. Remastered (community Godot remake by JHDev2006),
# exported natively for the Korri target system out of upstream sources.
#
# Why this vendor entry exists:
#
# Upstream publishes only `Linux.zip` and `Windows.zip` on its GitHub
# release page. The Linux zip is x86_64 only. On Linux aarch64 (Korri's
# primary device target — Sobo / Thor / live USB / bandai) it only boots
# through `box64`, and the emulated dynamic linker fails to dlopen the
# bundled GDExtension `.so`s.
#
# The repo is full GDScript source under GPL-3.0 with a Godot 4.6
# project (`config_version=5`, `[application] config/features=("4.6",
# "Forward Plus")`, `gl_compatibility` renderer — no Vulkan requirement).
# So the honest aarch64 path is a real Godot headless export from source,
# not a box64 shim.
#
# This derivation runs the Godot 4.6.3 editor in `--headless --import`
# then `--export-release "Linux ARM64"` (or `"Linux x86"` on
# x86_64-linux) to produce a native ELF + `SMB1R.pck` with Godot's flat
# exported GDExtension layout. `autoPatchelfHook` rewrites ELF
# interpreter/RPATH for ordinary dynamic dependencies; the bin wrapper
# provides the same runtime library set through `LD_LIBRARY_PATH` because
# Godot's Linux display backends discover X11/Wayland/OpenGL libraries
# with `dlopen`.
#
# GDExtensions:
#
#   - `godotgif` (in-game GIF capture): upstream `smbr-src` already
#     ships `libgodotgif.linux.template_release.arm64.so` at
#     `godotgif/bin/`. The `godotgif.gdextension` manifest declares the
#     arm64 entry, so the Godot export picks it up automatically. No
#     separate flake input / build step is required.
#
#   - `discord-rpc-gd` (Discord Rich Presence): Discord's Game SDK is
#     x86_64-only on Linux; no aarch64 Game SDK has ever shipped.
#     Upstream's `addons/discord-rpc-gd/bin/discord-rpc-gd.gdextension`
#     deliberately comments out the `linux.{debug,release}.arm64`
#     entries for that reason, and
#     `Scripts/Classes/Singletons/DiscordManager.gd` short-circuits with
#     a `DiscordRPCStub` when `OS.has_feature("linux") and
#     OS.has_feature("arm64")`. So on aarch64 we ship the addon's
#     `.gdextension` and `.gd` script as-is; the runtime never tries to
#     load Discord and the autoload no-ops cleanly.
#
# Engine pin:
#
#   `pkgs.godot` and `pkgs.godot-export-templates-bin` are pulled from
#   the `nixpkgs-godot` flake input (a pinned nixpkgs-unstable commit
#   carrying Godot 4.6.3-stable for both x86_64-linux and aarch64-linux,
#   with the export templates pre-cached on cache.nixos.org). The
#   repo's main nixpkgs-25.11 pin is still on Godot 4.5.1, which
#   cannot honestly run a `config/features=("4.6", ...)` project.
#   The separate input mirrors the existing `nixpkgs-2405` precedent
#   for narrow-scope cross-channel substitution.
#
# What this package does NOT ship:
#
#   - The original SMB.nes ROM. The game requires the user to provide
#     it on first launch (via the in-game file picker, or by dropping
#     the ROM at the OS-specific user-data path before launch as
#     `baserom.nes`). The upstream `ROMVerifier.is_valid_rom` allowlist
#     enforces a SHA-256 over the post-header bytes' base64 encoding;
#     the two accepted hashes are pinned and asserted by the
#     colocated `check.nix`. This mirrors `libretro-fake-08`'s
#     "ship the runtime, not the carts" stance.
#
#   - A kiosk launch-module entry. New launch modules belong in their
#     own product opt-in alongside `libretro-fake-08`'s `fake08`
#     module; not silently added here.
{
  lib,
  stdenv,
  autoPatchelfHook,
  makeWrapper,
  unzip,
  # Runtime closure the exported binary needs at exec time. Godot 4
  # `gl_compatibility` renderer + X11/Wayland windowing + dbus/udev
  # input + fontconfig/freetype for text rendering. Matches the
  # ad-hoc env we hand-rolled while validating the upstream release
  # zip on bandai (`/root/smbr/run.sh`), now expressed as a closure.
  alsa-lib,
  dbus,
  fontconfig,
  freetype,
  libGL,
  libpulseaudio,
  libxkbcommon,
  systemdLibs,
  wayland,
  xorg,
  # Engine + game source pins, wired by the overlay.
  nixpkgs-godot,
  smbr-src,
}:

let
  # The package consumes the build platform's Godot binaries — we are
  # exporting natively on each system, not cross-compiling. Derive the
  # system identifier from `stdenv.hostPlatform.system` so the overlay
  # call site does not have to forward `system` explicitly.
  system = stdenv.hostPlatform.system;
  godotPkgs = nixpkgs-godot.legacyPackages.${system};
  godot = godotPkgs.godot;
  godotExportTemplates = godotPkgs.godot-export-templates-bin;
  godotVersion = godot.version;

  # Godot's export-template lookup expects the directory name to use
  # the build-tag form (`4.6.3.stable` — dot before suffix), not the
  # nixpkgs `pkgs.godot.version` form (`4.6.3-stable` — dash). Convert
  # so the symlinks land where the editor actually looks. The on-disk
  # tree this resolves into is
  # `<godot-export-templates-bin>/share/godot/export_templates/<godotTemplatesDir>/linux_release.<arch>`.
  godotTemplatesDir = builtins.replaceStrings [ "-" ] [ "." ] godotVersion;

  # Map the build system to the matching upstream Godot export preset
  # name (as declared in upstream `export_presets.cfg`) and the binary
  # filename the preset writes. Strings must match upstream verbatim.
  exportPresetByArch = {
    aarch64-linux = {
      preset = "Linux ARM64";
      binaryName = "SMB1R.arm64";
    };
    x86_64-linux = {
      preset = "Linux x86";
      binaryName = "SMB1R.x86_64";
    };
  };
  archEntry =
    exportPresetByArch.${system}
      or (throw "smb-remastered: no Godot export preset wired for system '${system}'");

  runtimeLibs = [
    alsa-lib
    dbus.lib
    fontconfig.lib
    freetype
    libGL
    libpulseaudio
    libxkbcommon
    systemdLibs
    wayland
    xorg.libX11
    xorg.libXcursor
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXinerama
    xorg.libXrandr
    xorg.libXrender
  ];

  # Use upstream's tag or fall back to the rev-derived version. The
  # release tag (e.g. "1.1-26w21c") is the human-readable handle; the
  # rev is the machine pin. Match the version-string shape used by
  # neighbouring vendor packages.
  version = if smbr-src ? shortRev then smbr-src.shortRev else smbr-src.lastModifiedDate or "unknown";
in

stdenv.mkDerivation {
  pname = "smb-remastered";
  inherit version;

  src = smbr-src;

  nativeBuildInputs = [
    # autoPatchelfHook rewrites the ELF interpreter
    # (`/lib64/ld-linux-x86-64.so.2`, `/lib/ld-linux-aarch64.so.1`) and
    # RPATH on the exported binary AND on every GDExtension `.so` Godot
    # flattens next to it, so the closure runs on NixOS without a
    # global stub-ld. The `.so`s ship with no usable RPATH from
    # upstream's CI; autoPatchelf walks the recursive dependency graph
    # and resolves each lib against `buildInputs` below.
    autoPatchelfHook
    godot
    makeWrapper
    unzip
  ];

  # `autoPatchelfHook` searches `buildInputs` when rewriting the
  # exported binary and flattened GDExtension `.so`s. The bin wrapper
  # also exposes these libraries to Godot's runtime `dlopen` calls.
  buildInputs = runtimeLibs;

  strictDeps = true;

  # Godot writes its editor cache + import results into the project
  # directory. The Nix store is read-only, so we have to stage the
  # source into a writable working copy before invoking the editor.
  unpackPhase = ''
    runHook preUnpack
    mkdir -p project
    cp -R --no-preserve=mode,ownership "$src/." project/
    runHook postUnpack
  '';

  # The pinned weekly upstream source (`1.1-26w21c`) carries only the
  # two release presets upstream used for its x86 publish pipeline. Add
  # back the Linux ARM64 preset that upstream ships in neighbouring
  # stable/weekly revisions, and mark it runnable so Godot's CLI will
  # accept `--export-release "Linux ARM64"`.
  patchPhase = ''
    runHook prePatch
    cd project
    patch -p1 < ${./patches/0001-add-linux-arm64-export-preset.patch}
    patch -p1 < ${./patches/0002-add-level-launch-flag.patch}
    cd ..
    runHook postPatch
  '';

  # Godot looks for export templates under
  # `$XDG_DATA_HOME/godot/export_templates/<engine-version>/`. The
  # nixpkgs `godot-export-templates-bin` derivation lays them out at
  # `$out/share/godot/export_templates/<version>/`; symlink them into
  # the staging XDG dir Godot will read at export time.
  configurePhase = ''
    runHook preConfigure

    export HOME=$PWD/godot-home
    mkdir -p "$HOME"
    export XDG_DATA_HOME=$HOME/.local/share
    export XDG_CONFIG_HOME=$HOME/.config
    export XDG_CACHE_HOME=$HOME/.cache

    mkdir -p "$XDG_DATA_HOME/godot/export_templates"
    ln -s "${godotExportTemplates}/share/godot/export_templates/${godotTemplatesDir}" \
      "$XDG_DATA_HOME/godot/export_templates/${godotTemplatesDir}"

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    cd project

    # Godot 4 requires a successful resource import pass before
    # `--export-release` can succeed: it has to materialise `.godot/`,
    # resolve UID assignments, and finish texture/audio reprocessing.
    # A single import pass is sometimes not enough — UID resolution
    # cascades across resources — so run twice. The first run is
    # allowed to fail (some imports defer on first pass); the second
    # must succeed.
    godot --headless --import || true
    godot --headless --import

    mkdir -p ../build
    godot --headless --export-release "${archEntry.preset}" "$PWD/../build/${archEntry.binaryName}"

    if [ ! -f "../build/${archEntry.binaryName}" ]; then
      echo "smb-remastered: Godot export did not produce ${archEntry.binaryName}" >&2
      ls -la ../build >&2 || true
      exit 1
    fi
    if [ ! -f "../build/SMB1R.pck" ]; then
      echo "smb-remastered: Godot export did not produce SMB1R.pck" >&2
      ls -la ../build >&2 || true
      exit 1
    fi

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d "$out/share/smb-remastered" "$out/bin"
    cp -R ../build/. "$out/share/smb-remastered/"
    chmod +x "$out/share/smb-remastered/${archEntry.binaryName}"

    makeWrapper "$out/share/smb-remastered/${archEntry.binaryName}" "$out/bin/smb-remastered" \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibs}

    # Godot 4 exports gdextension shared libraries flat next to the
    # engine binary; the addon directory tree (`godotgif/`,
    # `addons/discord-rpc-gd/`) does NOT survive into the export.
    # The `.gdextension` manifests are baked into `SMB1R.pck`, and at
    # runtime Godot's GDExtension loader resolves library names
    # against the binary's own directory. Keeping the flat layout
    # below matches what the exporter actually produces; do not try
    # to reconstruct the source-tree addon directory shape.

    # Provenance manifest mirrors the libretro-fake-08 and
    # SDL2-mali-fbdev pattern so the source pin, engine pin, and chosen
    # export preset are discoverable directly from a built store path.
    mkdir -p "$out/nix-support/smb-remastered"
    {
      printf '%s\n' 'pname=smb-remastered'
      printf '%s\n' 'version=${version}'
      printf '%s\n' 'upstream-repo=github.com/JHDev2006/Super-Mario-Bros.-Remastered-Public'
      printf '%s\n' 'upstream-rev=${smbr-src.rev or "unknown"}'
      printf '%s\n' 'engine=godot ${godotVersion}'
      printf '%s\n' 'export-preset=${archEntry.preset}'
      printf '%s\n' 'binary=${archEntry.binaryName}'
    } > "$out/nix-support/smb-remastered/manifest.txt"

    runHook postInstall
  '';

  # `autoPatchelfHook` handles ELF interpreter + RPATH; do not strip
  # the binary (Godot's exported binary is already stripped, but the
  # gdextension `.so`s sometimes carry debug info upstream wants kept
  # for crash reports surfaced through Godot's crash handler).
  dontStrip = true;

  # The `discord-rpc-gd` x86_64-only Linux `.so` and its binding
  # ship inside the export pipeline for completeness, but on aarch64
  # they will never be loaded (DiscordManager.gd short-circuits on
  # `OS.has_feature("linux") and OS.has_feature("arm64")`).
  # autoPatchelf cannot satisfy the x86_64 ELF on an aarch64 target,
  # so suppress the failure for just those filenames; the runtime
  # code path that would dlopen them is unreachable on aarch64.
  autoPatchelfIgnoreMissingDeps = lib.optionals (system == "aarch64-linux") [
    "libdiscord_game_sdk.so"
    "libdiscord_game_sdk_binding.so"
  ];

  passthru = {
    # Engine + export preset are part of the public package contract.
    # The colocated check.nix reads these to assert the on-disk shape
    # agrees with what the manifest advertises.
    inherit godot godotExportTemplates;
    exportPreset = archEntry.preset;
    binaryName = archEntry.binaryName;
  };

  meta = {
    description = "Super Mario Bros. Remastered (community Godot remake) packaged natively for ${system}";
    homepage = "https://github.com/JHDev2006/Super-Mario-Bros.-Remastered-Public";
    license = lib.licenses.gpl3Only;
    platforms = builtins.attrNames exportPresetByArch;
    mainProgram = "smb-remastered";
  };
}
