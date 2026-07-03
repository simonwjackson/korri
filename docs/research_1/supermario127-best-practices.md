# SuperMario127 (LSS) — Korri Native Support Research

**Prepared:** 2026-06-04
**Scope:** Packaging SM127 for Korri, analogous to just-landed SMBR support
**Upstream:** https://github.com/Level-Share-Square/SuperMario127
**Reference:** `product/vendor/super-mario-bros-remastered/` (SMBR pattern)

---

## Summary

SuperMario127 (SM127) is a Godot-3.6 community fan game with an integrated
Level-Share-Square level portal. The SMBR packaging pattern applies, but there
are **five meaningful differences** that drive every recommendation below:

| Dimension | SMBR (done) | SM127 (this work) |
|---|---|---|
| Engine | Godot 4.6 | **Godot 3.6** |
| Engine pin strategy | Separate `nixpkgs-godot` flake input (4.6 pre-compiled binaries) | Main nixpkgs — `godot3-headless` + `godot3-export-templates` built from source |
| ROM dependency | Yes — NES ROM user-supplied | **None** — fully original game |
| Level format | `.lvl` (JSON) | **`.127level`** (custom CSV-encoded text, `current_format_version = "0.5.1"`) |
| aarch64 export preset | Added by Korri patch (upstream had only x86) | Needs investigation — Godot 3 template naming scheme differs from Godot 4 |
| Native extension story | GDExtension (`.gdextension` + `.so`); upstream ships arm64 `godotgif` `.so` | **NativeScript** (Godot 3's FFI); only Windows Discord `.dll` files present — no Linux `.so` |

The work is feasible and the SMBR file layout maps 1:1, but two unknowns
require early hands-on probing before writing the derivation: the aarch64
export template naming and the Discord NativeScript runtime behaviour on Linux.

---

## Primary Sources

### Upstream repository
- `project.godot` — confirms `config_version=4` (Godot 3), window size 768×432 (non-resizable), custom user dir `"dev"`, autoloads including `Discord="*res://addons/discord_game_sdk/discord.gd"`
- `export_presets.cfg` — only `Linux/X11` preset, `binary_format/architecture="x86_64"`, `embed_pck=false`, export path `../127export/linux/Super_Mario_127.x86_64`; no ARM64 preset
- `singletons/scene_switcher.gd` — `start_level(level_info, level_id, working_folder, …)` is the single choke-point for entering a level; this is the correct injection site for a `--level` launch patch
- `util/new/levels_list/level_list_util.gd` — level files at `user://level_list/<uuid>.127level`; lss-linked levels stored as UUIDs mapped to local paths in `user://level_list/level.links`
- `level/Data.gd` — level codec; current format `0.5.1`; levels are encoded text (versioned CSV), **not JSON**
- `scenes/menu/level_portal/http/http_request.gd` — live API calls to `https://levelsharesquare.com/api/levels/…`; level portal requires internet
- `singleton2.gd` — mod system reads `user://mods/active.127mod`; irrelevant to Korri packaging

### Releases
- Latest stable: **v0.9.1** ("The Dry, Dry Update") — Dec 21, 2024; tag `6118c65`
- Release assets are source-code archives only; binary distribution is on itch.io separately

### License
- README states "the SM127 legacy codebase is public and free to clone and use wherever you need!" (since v0.8.0)
- **No `LICENSE` file in the repository root** — the repo holds an `export.keystore` (Android signing only) but no SPDX-identifiable licence
- Must confirm before shipping: request a licence file from upstream or treat as permissive-but-unlicenced (analogous to some hobbyist community releases)

### Nix / nixpkgs
- `pkgs.godot3-headless` — version 3.6.2, supports `aarch64-linux`, `x86_64-linux`, `i686-linux`; compiled from source via scons
- `pkgs.godot3-export-templates` — same version, same platform support; installs template as `share/godot/templates/3.6.stable/linux_x11_64_release`
  - The installed name is **`linux_x11_64_release` regardless of build arch** — when compiled on aarch64, the file at that path IS the aarch64 binary
  - This differs from Godot 4 where templates are architecture-specific named binaries downloaded as pre-compiled binaries
- nixpkgs 25.11 already carries Godot 3.6.x — **no separate `nixpkgs-godot3` flake input is needed**, unlike the `nixpkgs-godot` pin SMBR requires

### Reference implementation
- `product/vendor/super-mario-bros-remastered/package.nix` — canonical pattern for Godot-headless-export derivations in this repo
- `product/vendor/super-mario-bros-remastered/README.md` — documents decisions about GDExtension, ROM, engine pin strategy, level launch contract
- SMBR patches `0001` (add ARM64 preset) and `0002` (add `--level` flag) both have SM127 equivalents

---

## Recommended Approach

### 1. Flake input

Add `sm127-src` alongside `smbr-src` in `flake.nix`:

```nix
sm127-src = {
  url = "github:Level-Share-Square/SuperMario127?rev=<PINNED_COMMIT>";
  flake = false;
};
```

Pin to the v0.9.1 tag (`6118c65`). Do **not** track `master` — README explicitly warns it is unstable.

No `nixpkgs-godot3` input is needed. Use `pkgs.godot3-headless` and
`pkgs.godot3-export-templates` from the main nixpkgs pin. The nixpkgs 25.11
channel carries Godot 3.6.2, which satisfies a Godot-3.6 project.

### 2. Vendor layout

```
product/vendor/super-mario-127/
├── README.md
├── package.nix
├── check.nix
└── patches/
    ├── 0001-fix-export-binary-name-and-arch.patch   # renames output binary; see §3
    ├── 0002-disable-discord-nativescript-on-linux.patch  # see §4
    └── 0003-add-level-launch-flag.patch              # see §5
```

### 3. Export-preset patch (0001)

The existing `Linux/X11` preset targets `x86_64` and names the output
`Super_Mario_127.x86_64`. For Korri's aarch64 builds, patch `export_presets.cfg`
to conditionally name the binary correctly.

The situation differs from SMBR: you do **not** need to add a new `[preset.N]`
for ARM64, because `godot3-export-templates` in nixpkgs installs the template
as `linux_x11_64_release` whether compiled for x86_64 or aarch64. The headless
exporter uses that name regardless of the host arch.

What the patch should do:
- Change `export_path` to a controlled Korri output name: `../build/super-mario-127`
- Remove or neutralise `binary_format/architecture="x86_64"` if it causes the
  headless exporter to reject the aarch64 template (needs probe — see Risks §1)
- Keep the preset named `Linux/X11` to match the headless `--export "Linux/X11"` call

> **Probe needed first**: Run `godot3-headless --export "Linux/X11" ./out` on an
> aarch64 system with the aarch64-built `godot3-export-templates`. If the
> `binary_format/architecture="x86_64"` field causes an error or silently uses
> an unavailable x86_64 template, the field must be patched out or changed to
> `arm64`. Confirm with `file -b` on the output binary.

### 4. Discord NativeScript patch (0002)

The game autoloads `Discord="*res://addons/discord_game_sdk/discord.gd"` on
every start. The `.gdns`/`.gdnlib` NativeScript bindings reference shared
libraries. The repository ships only Windows DLLs at the project root —
no Linux `.so` for the Discord Game SDK exists anywhere in the repo.

Unlike SMBR, where upstream's own GDScript explicitly guards `OS.has_feature("arm64")`,
SM127 has no such guard. On Linux, Godot 3 will attempt to load the NativeScript
library and, finding no matching `.so` in the GDNative search path, will either
log an error or crash on startup.

**Patch strategy**: Add a platform guard in `addons/discord_game_sdk/discord.gd`
analogous to SMBR's `DiscordManager.gd` pattern:

```gdscript
# proposed patch target: discord.gd _ready or _init
func _ready():
    if OS.get_name() != "Windows":
        return  # Discord Game SDK has no Linux binary; skip initialization
    # ... existing Discord setup ...
```

Alternatively, patch `project.godot`'s `[autoload]` section to remove the
Discord autoload entirely on Linux exports via a conditional in the export
preset's `custom_features` — but patching the GDScript is cleaner.

> **Must verify before committing**: Boot the unpatched game on Linux (in QEMU
> or on device) to confirm whether Godot 3 crashes fatally on missing NativeScript
> or just logs an error. If it gracefully no-ops, this patch may be optional.
> SMBR's README comment about Discord on aarch64 ("runtime code path that would
> dlopen them is unreachable") is not present in SM127.

### 5. Level-launch patch (0003)

SM127 has no `--level` CLI flag. The level-play flow is: LSS portal → HTTP
download → `Singleton.SceneSwitcher.start_level(level_info, level_id, folder, …)`.

Add a `--level`/`SM127_LEVEL` flag following the same pattern as SMBR's
`0002-add-level-launch-flag.patch`. The injection site is `scene_switcher.gd`
(or a new autoload singleton), called after the launcher scene transitions to
the main menu.

Level path resolution (analogous to SMBR):
- Bare UUID → `user://level_list/<uuid>.127level`
- Absolute or relative path containing `/` → used directly as a filesystem path
- Value ending in `.127level` → used as a filesystem path

The patch must call `Singleton.SceneSwitcher.start_level(level_info, level_id, working_folder, false, true)` with a `LevelInfo` constructed from the loaded `.127level` file. `LevelData` provides the codec (`LevelData.load_in(code)`) and `LevelInfo` wraps it.

```gdscript
# Proposed addition to a new autoload or to scene_switcher.gd _ready:
func _ready():
    parse_launch_level_arg()

func parse_launch_level_arg() -> void:
    var value := OS.get_environment("SM127_LEVEL")
    if value == "":
        for arg in OS.get_cmdline_args():
            if arg == "--level" and ...:
                ...
            elif arg.begins_with("--level="):
                value = arg.trim_prefix("--level=")
    if value != "":
        _defer_launch_level(resolve_launch_level_arg(value))
```

The launch must be deferred until after `init_levels_list()` completes (which
sets up `user://level_list/`). Hooking into the launcher scene's transition
(like SMBR hooks into `Disclaimer.gd`) is the cleanest seam.

### 6. Package derivation (`package.nix`)

Structure mirrors `product/vendor/super-mario-bros-remastered/package.nix`:

```nix
{
  lib,
  stdenv,
  autoPatchelfHook,
  makeWrapper,
  godot3-headless,
  godot3-export-templates,
  sm127-src,
  # runtime deps
  alsa-lib, dbus, fontconfig, freetype, libGL, libpulseaudio,
  libxkbcommon, systemdLibs, wayland, xorg,
}:
let
  godotTemplatesDir = "3.6.stable";  # matches installed path
  version = sm127-src.shortRev or "unknown";
  runtimeLibs = [ alsa-lib dbus.lib fontconfig.lib freetype libGL
                  libpulseaudio libxkbcommon systemdLibs wayland
                  xorg.libX11 xorg.libXcursor xorg.libXext xorg.libXfixes
                  xorg.libXi xorg.libXinerama xorg.libXrandr xorg.libXrender ];
in
stdenv.mkDerivation {
  pname = "super-mario-127";
  inherit version;
  src = sm127-src;
  nativeBuildInputs = [ autoPatchelfHook godot3-headless makeWrapper ];
  buildInputs = runtimeLibs;
  strictDeps = true;

  unpackPhase = ''copy src into writable staging dir'';
  patchPhase  = ''apply patches 0001 0002 0003'';

  configurePhase = ''
    # XDG/HOME dirs for Godot 3 template lookup
    export HOME=$PWD/godot-home
    export XDG_DATA_HOME=$HOME/.local/share
    mkdir -p "$XDG_DATA_HOME/godot/templates"
    ln -s "${godot3-export-templates}/share/godot/templates/${godotTemplatesDir}" \
          "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}"
  '';

  buildPhase = ''
    cd project
    godot3-headless --import || true
    godot3-headless --import
    mkdir -p ../build
    godot3-headless --export "Linux/X11" "$PWD/../build/super-mario-127"
    # verify binary and PCK exist
    test -f ../build/super-mario-127
    test -f ../build/super-mario-127.pck
  '';

  installPhase = ''
    install -d "$out/share/super-mario-127" "$out/bin"
    cp -R ../build/. "$out/share/super-mario-127/"
    chmod +x "$out/share/super-mario-127/super-mario-127"
    makeWrapper "$out/share/super-mario-127/super-mario-127" "$out/bin/super-mario-127" \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibs}
    # provenance manifest
    mkdir -p "$out/nix-support/super-mario-127"
    printf 'pname=super-mario-127\nversion=${version}\nengine=godot3 %s\n' \
      "$(godot3-headless --version)" > "$out/nix-support/super-mario-127/manifest.txt"
  '';

  dontStrip = true;
  meta = {
    description = "Super Mario 127 (community fan game) packaged natively for ${system}";
    homepage = "https://github.com/Level-Share-Square/SuperMario127";
    mainProgram = "super-mario-127";
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
```

**Key Godot 3 differences from SMBR**:
- Binary: `godot3-headless` (separate headless binary) vs SMBR's `godot --headless`
- Template location: `XDG_DATA_HOME/godot/templates/3.6.stable/linux_x11_64_release` (no dot-separated suffix)
- Export CLI: `godot3-headless --export "Linux/X11" <path>` (no `--export-release`)
- Godot 3 produces two files: `<name>` (binary) + `<name>.pck` (data). Both must be installed alongside each other. `embed_pck=false` in the preset.

### 7. Check derivation (`check.nix`)

Assertions to mirror SMBR's `check.nix`:

- `$out/bin/super-mario-127` exists and contains `LD_LIBRARY_PATH`
- `$out/share/super-mario-127/super-mario-127` is an ELF file with expected machine type (`ARM aarch64` on aarch64, `x86-64` on x86_64)
- `$out/share/super-mario-127/super-mario-127.pck` exists (Godot 3 must ship PCK alongside binary)
- `$out/nix-support/super-mario-127/manifest.txt` contains `engine=godot3`
- PCK contains launch contract strings (after patch 0003): `--level`, `SM127_LEVEL`, `parse_launch_level_arg`
- Level format version string (`0.5.1`) is present in PCK (pins the format contract — if upstream changes level format, evaluation fails)

Unlike SMBR there is no ROM allowlist to pin. The level-format version string replaces it as the "contract must not silently change" gate.

### 8. User data path

With `config/custom_user_dir_name="dev"`, Godot 3 on Linux places user data at:

```
$HOME/.local/share/dev/
```

Level files: `$HOME/.local/share/dev/level_list/<uuid>.127level`
LSS link map: `$HOME/.local/share/dev/level_list/level.links`
Settings: `$HOME/.local/share/dev/settings.cfg`

The `--level <uuid>` flag resolves the UUID to this path. Pre-seeding a
`.127level` file before first launch allows kiosk use without going through
the online portal.

---

## Risks and Unknowns

### Risk 1 — Godot 3 aarch64 export template naming ⚠️ HIGH

**What**: `godot3-export-templates` in nixpkgs installs the aarch64-compiled
template at `share/godot/templates/3.6.stable/linux_x11_64_release` — the
same name as the x86_64 template. The SM127 export preset sets
`binary_format/architecture="x86_64"`. Whether `godot3-headless` honours this
field literally (and rejects the aarch64 template) or uses it only as a binary
filename hint is **undocumented and needs empirical verification**.

**If it's a problem**: Patch `export_presets.cfg` to remove or blank
`binary_format/architecture` and set the output path to a neutral name. Godot 3's
headless export would then use whatever template is at the resolved template
path.

**Probe**: Build `godot3-headless` and `godot3-export-templates` on aarch64,
run `godot3-headless --export "Linux/X11" ./out/test` against the SM127
project tree, check the ELF arch of `./out/test`. If it's ARM, patch 0001 is
minimal (binary name only). If it errors, the field must be patched out.

### Risk 2 — Build time: scons from source ⚠️ MEDIUM

**What**: Unlike Godot 4 where SMBR uses a `nixpkgs-godot` pin with pre-compiled
binary substitutes cached at `cache.nixos.org`, Godot 3 in nixpkgs is
compiled from source via scons. On Thor/Sobo (aarch64) this is 45–90 minutes
per package. There are two packages: `godot3-headless` and `godot3-export-templates`.

**Mitigation**: Verify that `cache.nixos.org` has aarch64 substitutes for
`godot3-headless` and `godot3-export-templates` at the target nixpkgs commit.
If they're cached, build time collapses to a download. If not, evaluate whether
pinning a nixpkgs commit known to be cached (check `cache.nixos.org` via `nix
path-info --store https://cache.nixos.org/ nixpkgs#godot3-headless`) is
preferable to building from source.

### Risk 3 — Discord NativeScript crashes on Linux ⚠️ HIGH (must probe)

**What**: `project.godot` autoloads `Discord` eagerly. The Discord GDNative
library has no Linux `.so` in the repo. Godot 3 may crash or log a non-fatal
error. Unlike SMBR, upstream has no Linux guard.

**Probe**: Run `godot3-headless --no-window project.godot` (or the exported
binary) on Linux and check if the Discord autoload causes a fatal crash or a
logged-but-ignored error.

**If crash**: Patch 0002 is mandatory. Guard the Discord autoload body with
`if OS.get_name() != "Windows": return`.

**If graceful error**: Patch 0002 is still strongly recommended to keep stderr
clean and prevent future changes to the Discord init code from silently
re-enabling the crash path.

### Risk 4 — Missing explicit licence ⚠️ MEDIUM

**What**: No `LICENSE` file exists in the repository. The README's "free to
clone and use" language is informal. For Korri vendor packages, an explicit
licence is the norm (SMBR uses GPL-3.0 from the Godot project).

**Mitigation**: Open an issue or contact the SM127 team for a formal licence.
Until resolved, document the informal statement and treat it as permissive for
internal Korri use. The `meta.license` field in `package.nix` cannot be set
precisely; use `lib.licenses.unfreeRedistributable` with a comment until
upstream clarifies.

### Risk 5 — LSS API dependency for level portal ⚠️ LOW (architectural)

**What**: The in-game level portal requires live calls to `levelsharesquare.com`.
For kiosk use (no persistent internet), the portal UI is non-functional. This
is acceptable if the kiosk use case is direct level launch via `--level`, not
portal browsing.

**Mitigation**: The `--level` launch patch (patch 0003) bypasses the portal
entirely. Document in README that the kiosk workflow pre-seeds `.127level`
files and uses the launch flag. The portal UI remains accessible when internet
is present.

### Risk 6 — Window is non-resizable at 768×432 ⚠️ LOW

**What**: `window/size/resizable=false` and a fixed 768×432 resolution. On
a TV or handheld with a different native resolution, the game will appear at
its native size (letterboxed or not filling the screen) unless gamescope or a
compositor handles the scaling.

**Mitigation**: Document that SM127 is expected to run under gamescope (like
other Korri game sessions) with `--output-width`/`--output-height` flags to
scale up. This is already the Korri session model for fixed-resolution games.

### Risk 7 — Level format version contract pinning

**What**: SMBR pins the ROM SHA-256 allowlist to gate on upstream changes.
SM127 has no ROM, but the `.127level` codec has a `current_format_version`
(`0.5.1`). If upstream changes the format without incrementing the version, or
drops backward compatibility, previously-seeded level files will break silently.

**Mitigation**: Pin the format version string in `check.nix` (as recommended
in §7) so `nix flake check` fails if upstream alters it. This is a weaker
guarantee than SMBR's ROM hash (since it's a version string, not a hash of a
binary), but it catches the most common case.

---

## Validation Checklist

Pre-merge gates for the initial implementation:

- [ ] `nix build .#super-mario-127` passes on `x86_64-linux`
- [ ] `nix build .#super-mario-127` passes on `aarch64-linux` (Thor or Sobo)
- [ ] `file -b <out>/share/super-mario-127/super-mario-127` reports correct ELF arch per platform
- [ ] `<out>/share/super-mario-127/super-mario-127.pck` exists (Godot 3 PCK mandatory)
- [ ] `<out>/bin/super-mario-127` wrapper contains `LD_LIBRARY_PATH`
- [ ] Running `super-mario-127` on Linux does not crash at the Discord autoload
- [ ] `SM127_LEVEL=/path/to/test.127level super-mario-127` launches directly into that level
- [ ] `super-mario-127 --level <uuid>` resolves to `$HOME/.local/share/dev/level_list/<uuid>.127level`
- [ ] `nix flake check` (colocated `check.nix`) passes on both arches
- [ ] PCK binary-search for `parse_launch_level_arg` string succeeds (launch contract in PCK)
- [ ] PCK binary-search for format version string `0.5.1` succeeds (format contract pinned)
- [ ] `super-mario-127 --level` with a missing file prints an error and exits cleanly (does not hang)
- [ ] User data path (`$HOME/.local/share/dev/`) is documented in README
- [ ] Provenance manifest at `nix-support/super-mario-127/manifest.txt` contains `engine=godot3`

---

## Implications for Korri Paths

### New paths

```
product/vendor/super-mario-127/
├── README.md
├── package.nix
├── check.nix
└── patches/
    ├── 0001-fix-export-binary-name-and-arch.patch
    ├── 0002-disable-discord-nativescript-on-linux.patch
    └── 0003-add-level-launch-flag.patch
```

### Modified paths

| Path | Change |
|---|---|
| `flake.nix` | Add `sm127-src` flake input; **no** `nixpkgs-godot3` needed |
| `product/systems/nixos/overlays/korri-packages.nix` | Wire `super-mario-127` package from `product/vendor/super-mario-127/package.nix`, forwarding `sm127-src` |
| (future) kiosk module | Add a `kind: godot3-game` or reuse `kind: godot-game` launch-module entry pointing at the wrapped binary — out of scope for the initial vendor derivation, same deferral as SMBR |

### What is explicitly out of scope for the initial derivation

Following SMBR's README's "Out of scope" pattern:

- Kiosk launch-module wiring (new launch module entry, kiosk closure assertions)
- Online portal functionality under no-internet conditions (LSS is external)
- Windows / macOS / Android export presets (Korri is Linux-only)
- Mod system (`user://mods/active.127mod`) — mod loading is not a Korri use case
- Building a Discord SDK for Linux (upstream has no Linux Discord SDK and the feature is irrelevant to kiosk use)

### Comparison with `product/vendor/super-mario-bros-remastered`

The most important difference for the maintainer: SMBR's build uses
`godot3-headless`'s Godot 4 analogue (`godot`) plus pre-downloaded binary
export templates via `nixpkgs-godot`. SM127 uses `godot3-headless` and
source-compiled `godot3-export-templates` from the main nixpkgs pin. This
means:

1. **No separate flake input** for the engine (simpler `flake.nix`)
2. **Longer initial build** unless the binary cache has hits (verify first)
3. **Template naming differs**: Godot 3's template is `linux_x11_64_release`,
   not arch-named like Godot 4's `linux_release.arm64`
4. **Two output files** must be installed together: binary + `.pck` (Godot 4
   can embed PCK; Godot 3 with `embed_pck=false` cannot)
5. **No ROM handling machinery** needed at all

The Godot 3 `configurePhase` template-symlink idiom is the same but targets
`$XDG_DATA_HOME/godot/templates/3.6.stable/` (not `export_templates/`).
