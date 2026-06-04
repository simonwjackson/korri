# Super Mario 127 vendor package

This directory packages [Level Share Square's Super Mario 127][upstream]
as a native Linux Godot export for Korri.

Korri builds the game from source instead of using the published desktop
release artifacts because the public Linux build is x86_64-only and
Korri's primary handheld target is Linux aarch64. The package follows the
same additive vendor-package model as `product/vendor/super-mario-bros-remastered/`:
it adds a package and colocated checks, but it does not install a kiosk
launch module or make the game a runtime default.

[upstream]: https://github.com/Level-Share-Square/SuperMario127

## Source and engine pins

- Upstream source input: `sm127-src` in `flake.nix`
- Initial pin: `v0.9.1` (`6118c65d8e799dae73f2c02596af827c8056a330`)
- Engine: Godot 3.6 from the repo's main nixpkgs pin

SM127 is a Godot 3 project (`project.godot` uses `config_version=4` and the
README asks for Godot 3.6). This is intentionally different from SMBR, which
needs a separate `nixpkgs-godot` input for Godot 4.6. SM127 uses
`godot3-headless` and `godot3-export-templates` from the main nixpkgs pin
unless a future bump proves a separate engine pin is needed.

Godot 3 export templates live under:

```text
$XDG_DATA_HOME/godot/templates/<engine-version>.stable/
```

Godot 4's `export_templates/` path does not apply. On aarch64, nixpkgs builds
an ARM64 template but installs it as `linux_x11_64_release`, so the package
adds the Godot-expected `linux_x11_arm64_release` symlink before export.

## Package layout

The built derivation installs:

```text
$out/bin/super-mario-127
$out/share/super-mario-127/Super_Mario_127.x86_64   # x86_64-linux
$out/share/super-mario-127/Super_Mario_127.arm64    # aarch64-linux
$out/share/super-mario-127/Super_Mario_127.pck
$out/nix-support/super-mario-127/manifest.txt
```

Godot 3 exports the executable and `.pck` separately when `embed_pck=false`,
so the binary and `Super_Mario_127.pck` must stay adjacent. The wrapper at
`bin/super-mario-127` points at the exported binary and prefixes
`LD_LIBRARY_PATH` with the runtime library closure. `autoPatchelfHook` handles
ordinary ELF interpreter/RPATH rewriting, while the wrapper handles Godot's
runtime `dlopen` lookups for X11/OpenGL/audio libraries.

## Launch inputs

Korri carries a source patch adding direct custom-level launch inputs:

```bash
super-mario-127 --level my-level-id
super-mario-127 --level=/path/to/example.127level
SM127_LEVEL=my-level-id super-mario-127
```

Resolution rules:

- bare values resolve to `user://level_list/<id>.127level`
- values containing `/`, values beginning with `user://` or `res://`, and
  values ending in `.127level` are treated as paths
- requested missing or invalid level files log a launch diagnostic and exit
  non-zero instead of silently falling through to the main menu

The patch uses SM127's own level-loading path (`level_list_util`, `LevelInfo`,
and `SceneSwitcher.start_level`) rather than parsing `.127level` files as JSON
or bypassing the normal shine-select/player transition. Multi-shine levels may
therefore open SM127's normal shine-select screen before gameplay.

## User data and level files

SM127 sets `config/custom_user_dir_name="dev"`. In game code, local levels are
stored under:

```text
user://level_list/<id>.127level
```

On Linux this resolves under Godot's app user-data directory for the custom
name. Device validation should confirm the exact filesystem path for the target
runtime before documenting an operator-facing pre-seed location.

## Discord GDNative

Upstream includes the Discord Game SDK as a Godot 3 GDNative/NativeScript addon.
The Linux SDK libraries are x86_64-only and there is no usable Linux aarch64
Discord SDK. Korri patches the unsupported Linux ARM path to no-op so the game
can start and direct-launch levels on ARM devices.

The x86_64 export may still include the Discord `.so`s next to the game binary.
The aarch64 package removes the unusable upstream SDK payload and installs a
tiny no-op `libdiscord-game-sdk-godot.so` binding stub so Godot can satisfy the
optional NativeScript load path without requiring the x86_64 SDK.

## License posture

The upstream repository contains permissive README language but no formal
license file at the pinned revision. The Nix package therefore marks the
package conservatively as unfree redistributable and records
`license=unlicensed-upstream-source` in the provenance manifest. Do not claim an
SPDX license unless upstream adds one.

## Checks

Run the colocated package check through the flake output:

```bash
nix build --no-link .#checks.x86_64-linux.super-mario-127-check
```

The check asserts:

- package passthru advertises the selected export preset and binary name
- wrapper exists and contains `LD_LIBRARY_PATH`
- exported binary is an ELF of the expected architecture
- `Super_Mario_127.pck` exists next to the exported binary
- provenance manifest includes engine, preset, and license posture
- x86_64/aarch64 GDNative layout matches the supported Discord behavior
- PCK contains Korri launch-contract markers (`--level`, `SM127_LEVEL`)
- PCK still contains the SM127 level format-version string (`0.5.1`)

## Out of scope

This package does not add:

- kiosk launch-module wiring or game-session defaults
- LSS download/acquisition support
- LSS account, favorites, ratings, comments, or portal API integration
- Korri library identity for `.127level` files
- Windows, macOS, HTML5, or Android exports
- Linux Discord Game SDK support
- mod-management behavior beyond preserving upstream startup

## Bump checklist

When updating `sm127-src` or Godot 3 packages:

1. Re-run the x86_64 colocated check.
2. Re-run the aarch64 colocated check on an ARM builder.
3. Confirm the Godot 3 template directory and aarch64 template filename still
   match `package.nix`.
4. Confirm `level/Data.gd` still reports the expected level format version.
5. Confirm `export_presets.cfg` still applies the Korri ARM64 preset patch.
6. Confirm the Discord unsupported-platform guard still applies.
7. Device-test both normal launch and `SM127_LEVEL=<id>` direct launch with a
   seeded `.127level` file.
