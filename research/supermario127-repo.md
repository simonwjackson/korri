# SuperMario127 Vendor Integration — Implementation Research

**Date:** 2026-06-04
**Upstream:** [Level-Share-Square/SuperMario127](https://github.com/Level-Share-Square/SuperMario127)
**Reference precedent:** `product/vendor/super-mario-bros-remastered/` (the SMBR integration)

---

## 1. Upstream Characterisation

### What the project is

SuperMario127 is a community-made **Godot 3.6** (GDScript) fan game in the style of Super Mario Sunshine / 64, with an online level-sharing ecosystem called **Level Share Square (LSS)**. Users can create, upload, and download `.127level` files (JSON). The project is public source under a permissive re-use intent (see README: "free to clone and use wherever you need").

**Latest stable release:** `v0.9.1` ("The Dry, Dry Update", Dec 21 2024), tagged at commit `6118c65`.

### Engine and exports

`project.godot` declares `config_version=4` — this is **Godot 3.x** format. The README explicitly says to use **Godot 3.6**.

Upstream `export_presets.cfg` contains five presets:
| # | Name | Platform | Architecture | Binary path |
|---|------|----------|--------------|-------------|
| 0 | HTML5 | HTML5 | web | `../127export/html5/index.html` |
| 1 | Windows Desktop | Windows Desktop | x86_64 | `Super_Mario_127.exe` |
| 2 | Mac OSX | Mac OSX | — | (path empty) |
| 3 | Linux/X11 | Linux/X11 | **x86_64 only** | `../127export/linux/Super_Mario_127.x86_64` |
| 4 | Android | Android | — | — |

**There is no Linux ARM64 export preset.** The `Linux/X11` preset sets `binary_format/architecture = "x86_64"`. A Korri patch must add an ARM64 preset.

### Releases

The GitHub releases page lists only **source archives** (Source code .zip/.tar.gz). There are no pre-built Linux binaries in any release asset. The same situation as SMBR: a Godot headless export from source is the only honest path to a native binary.

### No ROM requirement

Unlike SMBR, SuperMario127 is **entirely self-contained**. It ships its own original assets. There is no NES ROM gating, no `ROMVerifier`, and no user-supplied base ROM is needed. The `check.nix` equivalent will not need ROM-hash assertions.

---

## 2. Critical Differences from SMBR

| Dimension | SMBR | SuperMario127 |
|-----------|------|---------------|
| Godot version | 4.6.x | **3.6.x** |
| GDNative/Extension model | GDExtension (Godot 4) | **GDNative / NativeScript (Godot 3)** |
| Nixpkgs engine attribute | `godot` + `godot-export-templates-bin` | **`godot3-headless` + `godot3-export-templates`** |
| Separate nixpkgs pin for engine | Yes — `nixpkgs-godot` (main pin on Godot 4.5) | **Likely none needed** — nixpkgs 25.11 ships Godot 3.6.2 |
| Export templates type | Pre-built binaries (`godot-export-templates-bin`) | **Built from source** (`godot3-export-templates`) |
| Headless binary | `godot --headless --import` + `--export-release` | **`godot3-headless --export "Preset Name" path`** |
| Export templates XDG path | `$XDG_DATA_HOME/godot/export_templates/<ver>/` | **`$XDG_DATA_HOME/godot/templates/<ver>/`** |
| Template filenames | `linux_release.arm64`, `linux_release.x86_64` | **`linux_x11_arm64_release`, `linux_x11_64_release`** |
| Double import pass needed | Yes (Godot 4 UID cascade) | Likely not — Godot 3 imports on first `--export` |
| ROM requirement | Yes (user-supplied `baserom.nes`) | **None** |
| ROM hash contract in check.nix | Yes | **Not needed** |
| Discord integration | GDExtension, arm64 guarded in `.gdextension` | **GDNative `.gdns`, only Windows DLLs in project root — Linux behaviour UNKNOWN (see risks)** |
| User data dir | `$HOME/.local/share/SMB1R/` (autodetected by Godot) | **`$HOME/.local/share/godot/app_userdata/dev/`** (`custom_user_dir_name="dev"`) |
| Online dependency | None at startup | **LSS portal, music downloader, HTTP at startup** |
| Level format | `.lvl` JSON | **`.127level` JSON** |

---

## 3. Engine Pin Strategy

### Why SMBR needed a separate pin

The main nixpkgs pin (`nixos-25.11`) ships Godot 4.5.1, but SMBR's `project.godot` declares `config/features=("4.6", ...)`. Using 4.5 to export a 4.6 project is incorrect; the `nixpkgs-godot` input pinned a commit where Godot 4.6.3 is pre-cached on cache.nixos.org for both architectures.

### SM127's situation

SM127 requires Godot **3.6.x**, and `godot3-export-templates` in nixpkgs current is **3.6.2** (listed as supported for `aarch64-linux`, `i686-linux`, and `x86_64-linux` by MyNixOS). The main `nixpkgs-25.11` pin almost certainly carries Godot 3.6.x as well.

**Recommendation:** Try the main `nixpkgs` input first (no new flake input). If `pkgs.godot3-export-templates` on aarch64-linux is not in the binary cache for the specific `nixos-25.11` commit pinned, add a minimal `nixpkgs-godot3` input pinned to a commit where the templates are cached, following the exact `nixpkgs-godot` precedent.

### Template source vs pre-built binary

SMBR uses `godot-export-templates-bin` (pre-built, fetched directly from Godot's release assets). SM127 would use `godot3-export-templates`, which is **built from source** by nixpkgs. For aarch64-linux CI, confirm the derivation is available as a binary substitute before finalising the pin. Building Godot 3 from source on a handheld-class aarch64 machine takes 30–60 minutes.

---

## 4. Existing Patterns to Copy Directly

All of these come from `product/vendor/super-mario-bros-remastered/` with the Godot 3 adaptations noted.

### 4.1 Vendor directory structure

```
product/vendor/super-mario-127/
├── README.md      # engine pin rationale, Discord GDNative decision, online features note
├── package.nix    # stdenv.mkDerivation (see §5 for Godot 3 deltas)
├── check.nix      # colocated artifact-shape check (no ROM-hash section)
└── patches/
    ├── 0001-add-linux-arm64-export-preset.patch
    └── 0002-add-level-launch-flag.patch   # if launch-flag is in scope
```

Exact file-naming mirrors SMBR; only the subdirectory slug changes (`super-mario-127`, not `super-mario-bros-remastered`).

### 4.2 flake.nix source pin

```nix
# Super Mario 127 (community Godot 3 fan game by Level-Share-Square)
# source pin. Pinned to the v0.9.1 release tag. `flake = false` because
# upstream has no flake.nix and no submodules.
sm127-src.url = "github:Level-Share-Square/SuperMario127?rev=<v0.9.1-commit>";
sm127-src.flake = false;
```

Follow the same `flake = false`, pinned-rev, no-submodules pattern as `smbr-src`.

### 4.3 Overlay wiring (`korri-packages.nix`)

```nix
sm127 = final.callPackage ../../../vendor/super-mario-127/package.nix {
  inherit sm127-src;
  # pass godot3 pin once confirmed (either pkgs or nixpkgs-godot3.legacyPackages.${system})
};
```

Add to the overlay's function arguments `{ ..., sm127-src, ... }` and wire through the same call sites as `smbr-src`.

### 4.4 Overlay function signature update

`product/systems/nixos/overlays/korri-packages.nix` accepts `{ nix-on-rocks, fake-08-src, smbr-src, nixpkgs-godot }`. Add `sm127-src` (and optionally `nixpkgs-godot3`) to the destructured args.

### 4.5 flake.nix outputs wiring

Follow the same pattern as `smb-remastered`:

```nix
# packages
sm127 = pkgs.sm127;  # under pkgs.stdenv.isLinux attrset

# checks
sm127-check = import ./product/vendor/super-mario-127/check.nix {
  inherit pkgs;
  sm127Package = self.packages.${system}.sm127;
};
```

Register `sm127-check` in the `korri-standard-native-check` `ownerMatrix` under `"package-output"`.

### 4.6 check.nix structure

The colocated check follows the SMBR pattern exactly:
- Static assertions in `let checks = [...]` (Nix-level, instant to evaluate)
- `pkgs.runCommand` shell assertions for on-disk artifact shape
- ELF magic check (guard against wrong-preset binary)
- ELF machine check (guard against wrong-arch preset)
- Provenance manifest check (`nix-support/sm127/manifest.txt`)
- **No ROM-hash section** (SM127 has no user-supplied ROM)
- Korri launch contract assertion (if `--level` patch is applied): grep for strings baked into the `.pck`

### 4.7 Provenance manifest

Follow the SMBR `installPhase` pattern:
```bash
mkdir -p "$out/nix-support/sm127"
{
  printf 'pname=sm127\n'
  printf 'version=${version}\n'
  printf 'upstream-repo=github.com/Level-Share-Square/SuperMario127\n'
  printf 'upstream-rev=${sm127-src.rev or "unknown"}\n'
  printf 'engine=godot3 ${godot3Version}\n'
  printf 'export-preset=${archEntry.preset}\n'
  printf 'binary=${archEntry.binaryName}\n'
} > "$out/nix-support/sm127/manifest.txt"
```

---

## 5. `package.nix` — Godot 3 Deltas

The following are the specific differences from SMBR's `package.nix` that the implementer must apply:

### 5.1 Engine binaries

```nix
# Godot 3 headless export binary. No separate pkgs arg needed if using
# main pkgs. If a separate nixpkgs-godot3 pin is required, follow the
# nixpkgs-godot.legacyPackages.${system} pattern from SMBR.
godot3Headless = pkgs.godot3-headless;
godot3ExportTemplates = pkgs.godot3-export-templates;
godot3Version = godot3Headless.version;  # e.g. "3.6.2"
```

### 5.2 Export preset map

```nix
exportPresetByArch = {
  aarch64-linux = {
    preset = "Linux ARM64";       # name in the 0001 patch
    binaryName = "Super_Mario_127.arm64";
  };
  x86_64-linux = {
    preset = "Linux/X11";         # existing upstream preset name
    binaryName = "Super_Mario_127.x86_64";
  };
};
```

Note: In Godot 3, the Linux/X11 preset name must match `export_presets.cfg` verbatim. The new arm64 preset name added in `0001` should be consistent; a clean choice is `"Linux ARM64"`.

### 5.3 Export templates XDG path

Godot 3 uses `templates/` not `export_templates/`:

```bash
# configurePhase — DIFFERENT from SMBR's path
mkdir -p "$XDG_DATA_HOME/godot/templates"
ln -s "${godot3ExportTemplates}/share/godot/templates/${godotTemplatesDir}" \
  "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}"
```

The version directory name format in Godot 3 is `3.6.2.stable` (dot before `stable`, same as Godot 4). Verify the actual directory name from `godot3-export-templates`'s store path before committing.

### 5.4 Build phase — single pass, different command

Godot 3 does not need the double import pass from SMBR. The headless binary auto-imports on `--export`:

```bash
# buildPhase
cd project
godot3-headless --export "${archEntry.preset}" "$PWD/../build/${archEntry.binaryName}"
```

If the export fails because import didn't run, prepend:
```bash
godot3-headless --editor --quit || true
```
(Equivalent intent to SMBR's import pass but using Godot 3's `--editor --quit` idiom.)

Both the `.x86_64` (or `.arm64`) ELF and the `.pck` file must exist after this step.

### 5.5 Separate PCK file

In Godot 3, upstream presets use `binary_format/embed_pck=false`, so `--export` produces:
- `Super_Mario_127.arm64` (or `.x86_64`) — the engine binary
- `Super_Mario_127.pck` — the game data/resources

Both must be installed to `$out/share/sm127/`. The wrapper must be placed at `$out/bin/sm127` pointing to the engine binary, with the `.pck` file adjacent (Godot 3 finds the `.pck` by looking for a file with the same stem next to the binary).

```bash
install -d "$out/share/sm127" "$out/bin"
cp ../build/. "$out/share/sm127/"
chmod +x "$out/share/sm127/${archEntry.binaryName}"

makeWrapper "$out/share/sm127/${archEntry.binaryName}" "$out/bin/sm127" \
  --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibs}
```

### 5.6 Runtime libraries

Godot 3 with GLES2/GLES3 on Linux needs a similar closure to Godot 4 but verify the exact set. Start from the SMBR set as a baseline:

```nix
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
```

Godot 3 does not use Vulkan so no Vulkan runtime entry is needed. GLES2 renderer falls through to OpenGL/EGL — `libGL` covers this.

### 5.7 Discord GDNative — autoPatchelfIgnoreMissingDeps

SMBR had `autoPatchelfIgnoreMissingDeps` for `libdiscord_game_sdk.so` and `libdiscord_game_sdk_binding.so` on aarch64. SM127's Discord addon uses Windows DLLs (`discord-game-sdk-godot.dll`, `discord_game_sdk.dll`) which will not appear in the Linux export at all (they're not `.so` files and the Linux export's `include_filter` would not pick them up anyway). The Godot 3 Linux export produces only Linux-native shared libraries in the flat export; no Discord `.so` ships, so no `autoPatchelfIgnoreMissingDeps` entry is expected. Verify after a test export.

---

## 6. Files to Touch

| File | Change |
|------|--------|
| `flake.nix` | Add `sm127-src` input; optionally `nixpkgs-godot3` input; add `sm127` to `packages`; add `sm127-check` to `checks`; register `sm127-check` in `korri-standard-native-check` ownerMatrix |
| `product/systems/nixos/overlays/korri-packages.nix` | Add `sm127` to overlay, pass `sm127-src` |
| `product/vendor/super-mario-127/package.nix` | New file (Godot 3 derivation) |
| `product/vendor/super-mario-127/check.nix` | New file (artifact-shape check, no ROM section) |
| `product/vendor/super-mario-127/README.md` | New file (engine pin rationale, online features, Discord, launch flags) |
| `product/vendor/super-mario-127/patches/0001-add-linux-arm64-export-preset.patch` | New file (add arm64 preset to `export_presets.cfg`) |
| `product/vendor/super-mario-127/patches/0002-add-level-launch-flag.patch` | New file if level-launch is in scope (GDScript 3 API, not Godot 4) |
| `tools/nix/generated/bun-production-package-names.nix` | No change expected |

Note: **no NixOS module** is added in this change. SMBR's README explicitly deferred kiosk launch-module wiring to a follow-up; do the same here. The package lands as an additive `pkgs.sm127` lane, not as a runtime service default.

---

## 7. Patches to Write

### Patch 0001 — Add Linux ARM64 export preset

Append to `export_presets.cfg`. In Godot 3, the `[preset.N]` key must be the next sequential number after the last existing preset. The existing presets end at `[preset.4]` (Android), so the new ARM64 preset would be `[preset.5]`.

The preset must specify:
```ini
[preset.5]

name="Linux ARM64"
platform="Linux/X11"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter="*.crt, *.cfg, *.127level, *.json"
exclude_filter=""
export_path="../127export/linux_arm64/Super_Mario_127.arm64"
script_export_mode=1
script_encryption_key=""

[preset.5.options]

custom_template/debug=""
custom_template/release=""
binary_format/architecture="arm64v8"
binary_format/embed_pck=false
texture_format/bptc=false
texture_format/s3tc=true
texture_format/etc=true
texture_format/etc2=false
texture_format/no_bptc_fallbacks=true
```

Key notes:
- In Godot 3, the arm64 architecture string is `"arm64v8"` (not `"arm64"` which is Godot 4).
- `include_filter` should match the upstream filters from other Linux/HTML5 presets.
- `binary_format/embed_pck=false` keeps the `.pck` separate (consistent with upstream convention).
- Verify the exact architecture string by checking Godot 3.6.x export template file naming (`linux_x11_arm64_release` vs `linux_x11_arm64v8_release`).

### Patch 0002 — Level launch flag (if in scope)

Analogous to SMBR's `0002-add-level-launch-flag.patch` but written in **Godot 3 GDScript** (not Godot 4). Key API differences:

| Godot 4 (SMBR) | Godot 3 equivalent |
|---|---|
| `OS.get_environment("VAR")` | `OS.get_environment("VAR")` (same) |
| `OS.get_cmdline_args()` | `OS.get_cmdline_args()` (same) |
| `FileAccess.file_exists(path)` | `File.new().file_exists(path)` or `OS.file_exists(path)` |
| `FileAccess.open(path, FileAccess.READ)` | `var f = File.new(); f.open(path, File.READ)` |
| `JSON.parse_string(text)` | `JSON.parse(text).result` |
| `String.path_join(b)` | `String + "/" + b` or `String.plus_file(b)` |

The level file format is `.127level` (JSON). The game's `singletons/` directory is where the equivalent of SMBR's `Global.gd` would live. The main entry path would be traced from `launcher.tscn`.

Since the launch flag requires understanding the game's scene transition flow (similar effort to SMBR's patch), it can be deferred to a follow-up once the packaging derivation is verified working.

---

## 8. Integration Seams

### Engine version (Nix)

```
flake.nix inputs
  → sm127-src (game source)
  → (main pkgs or nixpkgs-godot3).godot3-headless
  → (main pkgs or nixpkgs-godot3).godot3-export-templates
  → korri-packages overlay
  → pkgs.sm127 (additive lane)
```

### Checks

```
flake.nix checks.sm127-check
  → product/vendor/super-mario-127/check.nix
  → asserts artifact shape, ELF arch, pck present, provenance manifest
  → registered in korri-standard-native-check ownerMatrix
```

### No kiosk module wiring in first cut

Following the SMBR precedent, defer adding a NixOS module that installs sm127 as a kiosk launch entry. That belongs in a follow-up that also confirms device-level launch behaviour (including the online LSS portal and Discord GDNative graceful degradation).

---

## 9. Tests and Checks to Add

### Nix-level (colocated check.nix)

```
1. Static passthru contract checks (eval-time, no build needed):
   - pkg.meta.mainProgram == "sm127"
   - pkg.passthru ? exportPreset && != ""
   - pkg.passthru ? binaryName && != ""

2. On-disk artifact shape (runCommand):
   - test -x $out/bin/sm127
   - test -f $out/share/sm127/${expectedBinaryName}   # ELF binary
   - test -f $out/share/sm127/Super_Mario_127.pck     # game data
   - grep -q LD_LIBRARY_PATH $out/bin/sm127
   - ELF magic check (7f454c46)
   - ELF machine arch check (ARM aarch64 / x86-64)

3. Provenance manifest:
   - test -f $out/nix-support/sm127/manifest.txt
   - grep -q '^engine=godot3 ' $out/nix-support/sm127/manifest.txt
   - grep -q '^export-preset=' $out/nix-support/sm127/manifest.txt

4. Launch contract (if --level patch applied):
   - grep --binary -- '--level' $out/share/sm127/Super_Mario_127.pck
```

### flake.nix integration

- Register `sm127-check` in `self.checks.${system}` under `pkgs.stdenv.isLinux`
- Add to `korri-standard-native-check` ownerMatrix as `owner = "package-output"`

---

## 10. Risks

### HIGH — Discord GDNative on Linux (unknown crash risk)

**What:** SM127 registers `Discord="*res://addons/discord_game_sdk/discord.gd"` as an autoload singleton. The addon uses GDNative NativeScript classes (`DiscordCore`, etc.). The project root only contains Windows DLLs (`discord-game-sdk-godot.dll`, `discord_game_sdk.dll`) — there is no Linux `.so` in the repository.

**Risk:** If the GDNative `.gdnlib` file (`addons/discord_game_sdk/*.gdnlib`) lists a Linux path for the library that doesn't exist in the export, Godot 3 may refuse to start or print a hard error. Even if Godot 3 is more lenient (skipping missing GDNative libraries), the `discord.gd` autoload calls `DiscordCore.new()` in `_ready()` — if the class is undefined because the library failed to register, this is a GDScript runtime error.

**Mitigation options:**
a. Inspect `addons/discord_game_sdk/*.gdnlib` — if there is no Linux entry, Godot 3 will not attempt to load the library on Linux and the NativeScript classes will be null/undefined. The `Proxy_` helper in `discord.gd` has a null-guard (`if not object_to_proxy_: return Result.InternalError`), which may be sufficient.
b. If a crash occurs, apply a small GDScript patch to guard the `DiscordCore.new()` call:
   ```gdscript
   # Godot 3 GDScript
   var discore_core_ = null
   if ClassDB.class_exists("DiscordCore"):
       discore_core_ = DiscordCore.new()
   ```
c. **This must be verified with an actual test export before publishing a package.** It is the highest-risk item.

### HIGH — Godot 3 export templates aarch64 binary cache

**What:** `godot3-export-templates` is built from source (unlike SMBR's `godot-export-templates-bin` which is a pre-downloaded binary). Building Godot 3 editor from source on aarch64 hardware takes ~30–60 minutes.

**Mitigation:** Before committing the flake pin, verify that `godot3-export-templates` for aarch64-linux is a cache hit on cache.nixos.org for the chosen nixpkgs commit. If not, pin a specific nixpkgs commit (in a new `nixpkgs-godot3` input) where the templates are cached, following the `nixpkgs-godot` precedent.

### MEDIUM — LSS portal network dependency at startup

**What:** SM127 makes outbound HTTPS requests to the Level Share Square API at startup (for level list, login, music download). In a Korri kiosk environment without proper network egress, these requests may hang or error visibly.

**Risk:** Startup hangs or unhandled network errors if the LSS backend is unreachable. No Korri-specific mitigation exists at the package level.

**Mitigation:** Document in `README.md`. The kiosk module (when written) should ensure a graceful network timeout or disable the LSS portal feature via startup flags if such flags exist. At minimum, verify the game degrades gracefully offline before declaring the kiosk integration complete.

### MEDIUM — Godot 3 arm64 architecture string in export preset

**What:** In Godot 3, the aarch64 export template naming convention may be `linux_x11_arm64_release` or `linux_x11_arm64v8_release` depending on the exact nixpkgs version. The `binary_format/architecture` string in `export_presets.cfg` must match what Godot 3's headless binary expects.

**Mitigation:** Confirm by inspecting the output of `ls $(nix build nixpkgs#godot3-export-templates --print-out-paths 2>/dev/null)/share/godot/templates/*/` and matching the template filename suffix to the correct `binary_format/architecture` value in the patch.

### LOW — `custom_user_dir_name="dev"` collision

**What:** SM127 stores user data at `$HOME/.local/share/godot/app_userdata/dev/`. The name "dev" is not unique — any other Godot 3 game with `custom_user_dir_name="dev"` would collide.

**Mitigation:** Document in README; on a single-game kiosk device this is not a practical risk. The kiosk module can manage `$HOME` or `$XDG_DATA_HOME` explicitly if needed.

### LOW — `.pck` flat embed decision

**What:** The upstream Linux/X11 preset uses `binary_format/embed_pck=false`. If the new arm64 patch also uses `embed_pck=false`, both the ELF binary and `Super_Mario_127.pck` must live adjacent for Godot 3's loader to find the `.pck`. The `installPhase` and the `makeWrapper` call must preserve this flat layout (which it does if files are copied from the build output).

**Mitigation:** Follow the SMBR `share/smb-remastered/` flat layout approach. Assert `test -f $out/share/sm127/Super_Mario_127.pck` in `check.nix`.

---

## 11. Implementation Outline

```
Phase 1 — Research gate (before writing any Nix):
  1.1  Confirm Discord GDNative behaviour on Linux:
       Inspect addons/discord_game_sdk/*.gdnlib for Linux entry.
       Test-export to x86_64-linux and attempt to launch.
  1.2  Confirm aarch64-linux godot3-export-templates is a binary cache hit
       on the nixos-25.11 pin (or identify a suitable commit).
  1.3  Confirm Godot 3 arm64 architecture string:
       inspect nixpkgs godot3-export-templates template filenames.

Phase 2 — Patches:
  2.1  Write 0001-add-linux-arm64-export-preset.patch
       (add [preset.5] to export_presets.cfg, architecture="arm64v8" or "arm64")
  2.2  Verify patch applies cleanly to the v0.9.1 source.
  2.3  (optional) Write 0002-add-level-launch-flag.patch in Godot 3 GDScript.

Phase 3 — package.nix:
  3.1  Start from super-mario-bros-remastered/package.nix as template.
  3.2  Apply all Godot 3 deltas documented in §5.
  3.3  Validate: `nix build .#sm127` on x86_64-linux, check ELF is x86_64.
  3.4  Validate: `nix build .#sm127` on aarch64-linux, check ELF is aarch64.

Phase 4 — check.nix:
  4.1  Port SMBR check.nix, remove ROM-hash section, add PCK assertion.
  4.2  `nix build .#checks.x86_64-linux.sm127-check` passes.

Phase 5 — flake.nix wiring:
  5.1  Add sm127-src input.
  5.2  Add sm127 to packages and sm127-check to checks.
  5.3  Register in korri-standard-native-check ownerMatrix.
  5.4  Run `nix flake check` to confirm no regressions.

Phase 6 — README.md:
  6.1  Write vendor README documenting engine pin, Discord GDNative stance,
       online LSS features, user data directory, launch flags (if any),
       and out-of-scope items (kiosk module wiring, Windows/HTML5 presets).
```

---

## 12. Out of Scope (first cut)

- NixOS module / kiosk launch-module wiring (follow SMBR's "not added here" stance)
- Windows Desktop, Mac OSX, HTML5, Android export presets (Korri targets Linux only)
- LSS account creation / authentication (user-managed, not part of packaging)
- Music download feature (network-dependent; user-initiated in-game)
- Multiplayer lobby support (Discord lobbies; Discord SDK Windows-only)
- A Korri acquisition plugin for the LSS API (separate Bazzar/acquisition track)

---

## 13. Cross-References

- Precedent package: `product/vendor/super-mario-bros-remastered/`
- Overlay: `product/systems/nixos/overlays/korri-packages.nix`
- Engine inputs in flake.nix: `smbr-src`, `nixpkgs-godot` entries (lines ~32–54)
- Check registration: `tools/testing/nix/korri-standard-native-check.nix` ownerMatrix
- SMBR check: `self.checks.${system}.smb-remastered-check` wiring in `flake.nix`
- Bazzar/LSS acquisition track: `docs/brainstorms/2026-06-01-001-bazzar-source-adapter-download-resolution-requirements.md`
