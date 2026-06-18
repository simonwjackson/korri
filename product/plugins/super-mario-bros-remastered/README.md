# smb-remastered

`smb-remastered` packages Super Mario Bros. Remastered (community Godot
remake by JHDev2006) as a native Linux build for Korri's target systems
(aarch64 for Sobo / Thor / live USB; x86_64 for the kiosk image and
developer hosts), produced from the upstream source via a Godot 4.6
headless export.

- **Upstream:** [`JHDev2006/Super-Mario-Bros.-Remastered-Public`](https://github.com/JHDev2006/Super-Mario-Bros.-Remastered-Public)
- **License:** GPL-3.0 (game source). The Godot engine itself is MIT.
- **What's vendored:** the Godot project source, exported through the
  `Linux ARM64` (aarch64) or `Linux x86` (x86_64) preset using the
  upstream `godotgif.gdextension` and the upstream
  `discord-rpc-gd.gdextension` (the latter no-ops on aarch64; see
  below). For the pinned weekly source, Korri restores the Linux ARM64
  preset from neighbouring upstream revisions via a small patch.

## Why this lives in Korri

Upstream publishes only `Linux.zip` and `Windows.zip` on its GitHub
release page, and the Linux zip is **x86_64 only.** Sobo, Thor, the
live USB kiosk and bandai are all aarch64. Running the x86_64 binary
under `box64` does technically boot, but the emulated dynamic linker
fails to dlopen the bundled GDExtension `.so`s (the upstream zip's
flat addon layout is correct for Godot's exporter — the loader
resolves library names against the binary's own directory — but box64
does not satisfy that lookup for the addon `.so`s and the game logs
`Can't open dynamic library: godotgif/bin/...` and the downstream
`Identifier "GifManager" not declared in the current scope.` parse
error in `Scripts/Parts/ResourcePackLoader.gd`).

Doing our own export from source produces a native aarch64 ELF whose
gdextension `.so`s load cleanly without an x86_64 emulator in the
way.

## Source pin policy

The game source is pinned inside this plugin package via the `game-src`
`fetchFromGitHub` default in `package.nix`. Keep the source revision and
fixed-output hash colocated with the package so generic Korri flake
wiring does not name this content.

Current pin: commit `21b0681...` (the `1.1-26w21c` release tag), which
is the snapshot tested against the engine version below. That weekly
snapshot includes only upstream's x86 publish presets, so
`patches/0001-add-linux-arm64-export-preset.patch` restores the Linux
ARM64 preset that upstream shipped in nearby stable/weekly revisions and
marks it runnable for Godot's CLI export path.

Bump with:

```
update the `game-src` fetcher in `package.nix` and refresh its hash
```

and re-run `nix flake check` to verify the colocated package check
still passes (in particular the `ROM_PATH allowlist` assertion, which
pins the SHA-256s the in-game `ROMVerifier.is_valid_rom` accepts —
catching any upstream change to the allowlist that would require ROM
re-verification by every user).

## Engine pin

`pkgs.godot` and `pkgs.godot-export-templates-bin` come from the
`nixpkgs-godot` flake input, pinned to a `nixos-unstable` commit
carrying Godot **4.6.3-stable** binaries pre-cached on `cache.nixos.org`
for both x86_64-linux and aarch64-linux.

The repo's main `nixpkgs.url = ".../nixos-25.11"` pin is still on
**Godot 4.5.1-stable**, which cannot honestly run a project whose
`project.godot` declares `config/features=PackedStringArray("4.6", ...)`
— the editor will refuse to load 4.6-feature-bearing resources and the
export will silently degrade or fail. The separate `nixpkgs-godot`
input follows the existing `nixpkgs-2405` precedent for narrow-scope
cross-channel substitution.

Bump with:

```
nix flake update nixpkgs-godot
```

The bump should target a commit where:

- `pkgs.godot.version` ≥ the major.minor declared in the SMBR
  `project.godot` `[application] config/features`.
- `pkgs.godot.outPath` and `pkgs.godot-export-templates-bin.outPath`
  for both `x86_64-linux` and `aarch64-linux` resolve to a cached
  narinfo on `cache.nixos.org`. (Build-from-source on aarch64 of the
  Godot editor is 30–45 minutes on Thor / Sobo class hardware; the
  prebuilt substitute is a 70 MiB download.)

## GDExtensions on aarch64

The game ships two native GDExtensions. Their aarch64 stories are
asymmetric and recorded here so the package's deliberate non-action on
each one is documented.

### `godotgif` — works natively

The pinned upstream source already includes
`godotgif/bin/libgodotgif.linux.template_release.arm64.so` (and the
debug variant). The `godotgif.gdextension` manifest declares
`linux.release.arm64`, so the Godot export picks it up automatically
and writes it flat next to the engine binary as
`libgodotgif.linux.template_release.arm64.so`. No separate flake
input or build step is required.

The "GifManager not declared" parse error observed when running
upstream's x86_64 `Linux.zip` on aarch64 via `box64` is a
`box64`-vs-Godot's GDExtension dynamic-loader incompatibility — the
upstream layout is correct for a native loader, but box64 does not
satisfy the addon-`.so` dlopen lookup. The native aarch64 export
avoids the emulator entirely.

### `discord-rpc-gd` — deliberately disabled by upstream

Discord's Game SDK
(`addons/discord-rpc-gd/bin/linux/libdiscord_game_sdk.so`) is a
proprietary Discord-published binary that has **never** shipped an
aarch64 Linux build. Upstream recognises this in two places:

1. `addons/discord-rpc-gd/bin/discord-rpc-gd.gdextension` explicitly
   comments out the `linux.{debug,release}.arm64` library / dependency
   entries, so the GDExtension loader skips Discord cleanly on
   aarch64 (no "library not found" error, no fall-through stub
   library).

2. `Scripts/Classes/Singletons/DiscordManager.gd` line 3:

   ```gdscript
   var enabled: bool = ProjectSettings.get_setting("application/use_discord", false) \
     and not (OS.has_feature("linux") and OS.has_feature("arm64"))
   ```

   On Linux aarch64 `enabled` is `false`, and the autoload constructs a
   `DiscordRPCStub` whose `start`, `refresh`, `get_is_discord_working`,
   and `shutdown` methods are no-ops. Every call site checks `if not
   enabled: return` before touching `rpc`, so nothing else in the game
   ever reaches a missing-symbol path.

We therefore ship the addon's `.gdextension`, `plugin.cfg`, and `.gd`
sources as-is on aarch64 without trying to build a parallel Discord
SDK. There is no upstream-supportable alternative.

## Layout

```
product/plugins/super-mario-bros-remastered/
├── README.md       # this file
├── package.nix     # stdenv.mkDerivation wired through this plugin's Nix composition
├── check.nix       # colocated package-level check exposed as
│                   # self.checks.<system>.smb-remastered-check
└── patches/
    ├── 0001-add-linux-arm64-export-preset.patch
    └── 0002-add-level-launch-flag.patch
```

The built derivation lays the export out as:

```
<out>/bin/smb-remastered                                       # symlink → the engine binary
<out>/share/smb-remastered/SMB1R.arm64                         # native ELF (or SMB1R.x86_64 on x86_64-linux)
<out>/share/smb-remastered/SMB1R.pck                           # game data + gdextension manifests + .gd scripts
<out>/share/smb-remastered/libgodotgif.linux.template_release.arm64.so   # flat next to binary (Godot flattens addons on export)
<out>/share/smb-remastered/libdiscord_game_sdk.so              # x86_64 export only; absent/unused on aarch64
<out>/share/smb-remastered/libdiscord_game_sdk_binding.so      # ditto
<out>/nix-support/smb-remastered/manifest.txt                  # source/engine pin manifest
```

The engine binary's ELF interpreter and RPATH are rewritten by
`autoPatchelfHook` to point at the build's glibc loader and the
runtime library closure (`buildInputs` in `package.nix`). The installed
`bin/smb-remastered` wrapper also exposes the same runtime library set
through `LD_LIBRARY_PATH`, because Godot's Linux display backends load
X11/Wayland/OpenGL libraries with `dlopen` rather than ordinary ELF
references. The flat `.so`s next to the binary are patched the same way.

## Launch inputs

Korri carries a small source patch adding direct custom-level launch
inputs for kiosk and remote launchers:

```
smb-remastered --level 6a1797b85a07d826fd7a5bd0
smb-remastered --level=/root/.local/share/SMB1R/custom_levels/downloaded/6a1797b85a07d826fd7a5bd0.lvl
SMBR_LEVEL=6a1797b85a07d826fd7a5bd0 smb-remastered
```

A bare value is resolved as an LSS/downloaded level id under
`$XDG_DATA_HOME/SMB1R/custom_levels/downloaded/<id>.lvl`. Absolute
paths, relative paths containing `/`, and values ending in `.lvl` are
used as file paths. The launch request is consumed after ROM verification
and base asset generation, then SMBR transitions directly into
custom-level play using the default/current player selection.

## ROM handling

The game requires the user to provide the original Super Mario Bros.
NES ROM (`SMB.nes`) on first launch. We do **not** vendor or fetch it;
shipping a NES ROM with this derivation would be both a licensing
violation and pointless (every device user already has their own
preferred dump).

The user can provide the ROM two ways:

- **In-game picker:** Launch `smb-remastered`, accept the legal
  disclaimer, and use the on-screen file picker to select the `.nes`
  file. The game validates and copies it to `baserom.nes` in its user
  data dir (`$XDG_DATA_HOME/SMB1R/baserom.nes`).

- **Pre-seeded:** Drop the file at
  `$XDG_DATA_HOME/SMB1R/baserom.nes` (or
  `$HOME/.local/share/SMB1R/baserom.nes`) before the first launch. The
  game's auto-detect path (`find_local_rom()` →
  `ROMVerifier.is_valid_rom()`) accepts it transparently and skips the
  picker. **Also** pre-seeding a file with a `.nes` extension into the
  executable's own directory will be picked up first by
  `find_local_rom()` — leave that directory alone.

The accepted ROM SHA-256s (computed over base64 of the post-header
bytes) are pinned in `check.nix` so a future upstream change to
`VALID_HASHES` will fail evaluation and force a deliberate update.

## Out of scope

- The original SMB.nes ROM (user-supplied; see above).
- Building a parallel Discord Game SDK for aarch64 (upstream prevented;
  see above).
- Kiosk launch-module wiring. A future change can add a
  `kind: godot-game` launch-module entry that points
  `/etc/korri/godot-games/smb-remastered/` at the wrapped binary +
  `SMB1R.pck`, analogous to how `libretro-fake-08` exposes the
  `fake08` module; not added in this change to keep the kiosk
  closure contract assertions stable.
- The Windows Desktop / Windows Desktop ARM / macOS presets in
  upstream `export_presets.cfg`. Korri targets Linux only.
