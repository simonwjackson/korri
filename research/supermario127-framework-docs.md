# SuperMario127 — Framework Documentation for Native Korri Support

**Research date:** 2026-06-04
**Upstream repo:** https://github.com/Level-Share-Square/SuperMario127
**Latest release:** v0.9.1 "The Dry, Dry Update" (Dec 2024)
**Reference package:** `product/vendor/super-mario-bros-remastered/` (nearest analogue in this repo)

---

## 1. Summary

Super Mario 127 is a fan-made 2D Mario-inspired platformer with a built-in level editor and online level sharing via the Level Share Square (LSS) portal. It is written entirely in **GDScript** on **Godot 3.6**. The source is public and free to use as of version 0.8.0.

Upstream distributes only Windows and HTML5 builds via itch.io and GitHub releases. The Linux binary in the release archive is x86_64 only. On aarch64 Korri hardware (Sobo / Thor / live USB) the game must be built natively from source using the Godot 3.6 headless export pipeline — the same strategy used for `smb-remastered`.

Key differences from `smb-remastered` that affect the package approach:
- **Godot 3**, not Godot 4 — different engine, CLI flags, plugin system, template layout
- **No ROM required** — the game is self-contained
- **No existing `--level` CLI flag** — must be added via source patch
- **Custom user-data directory name** (`"dev"`) — affects where level files are stored at runtime
- **Discord GDNative addon** (x86_64 Linux `.so`) — no aarch64 SDK from Discord; graceful null-safe fallback exists in game code

---

## 2. Version Information

| Item | Value | Source |
|------|-------|--------|
| Godot Engine | 3.6 (stable) | `README.md`, `project.godot` `config_version=4` |
| Latest game tag | `v0.9.1` | GitHub releases page |
| Level format version | `0.5.1` | `level/Data.gd` `current_format_version` |
| Level file extension | `.127level` | `level_list_util.gd` `get_level_file_path()` |
| Save file extension | `.127save` | encrypted JSON via Godot's `File.open_encrypted_with_pass` |
| Mod file extension | `.127mod` | `singleton2.gd` `_init()` |
| nixpkgs `godot3` | 3.6 (built from source at `3.6-stable` tag) | `pkgs/development/tools/godot/3/default.nix` |
| nixpkgs `godot3-export-templates` | 3.6 (derived from godot3, built from source) | `pkgs/development/tools/godot/3/export-templates.nix` |

### Version constraint

The README explicitly warns:
> "While you could attempt to transition the project from Godot 3 to Godot 4, we do not recommend it."

Use exactly **Godot 3.6**. Earlier 3.x versions lack arm64 export template support.

---

## 3. Key Concepts

### 3.1 Godot 3.6 arm64 Linux Export

Godot 3.6 officially added Linux arm64 (and arm32) export template support, first announced in the 3.6 beta 4 release (January 2024):

> "Just like Godot 4.2, we now have official Linux ARM builds (arm32 and arm64) of Godot 3.6. The Linux export template now lets you select the architecture at export time among the four options supported in 3.6: x86_64 (default), x86_32, arm64, arm32."

Source: https://godotengine.org/article/dev-snapshot-godot-3-6-beta-4/

The export preset `binary_format/architecture` controls the output:
- `"x86_64"` → standard 64-bit Linux binary
- `"arm64"` → aarch64 Linux binary (Korri's primary target)

**nixpkgs support:** `godot3-export-templates` (v3.6) lists `aarch64-linux` as a supported platform. The derivation uses `arch=${stdenv.hostPlatform.linuxArch}` from SCons flags, so on aarch64-linux it builds an arm64 template binary natively.

### 3.2 GDNative Plugin System (Godot 3)

SM127 uses Godot 3's **GDNative / NativeScript** extension system (not Godot 4's GDExtension). The relevant files are:

| File type | Purpose |
|-----------|---------|
| `.gdnlib` | Library manifest — maps platforms to shared library paths |
| `.gdns` | NativeScript class binding — maps GDScript class names to C++ symbols |

There is only one GDNative plugin in SM127: the Discord Game SDK, declared in `addons/discord_game_sdk/discord_sdk.gdnlib`.

### 3.3 Discord GDNative Addon

The Discord Game SDK for Linux ships as x86_64-only `.so` files — Discord has **never** published an aarch64 Linux build.

```
addons/discord_game_sdk/
├── discord_sdk.gdnlib          # library manifest
├── discord.gd                  # autoload (app ID: 729767289406095403)
├── libdiscord-game-sdk-godot.so   # GDNative binding (x86_64 Linux)
├── libdiscord_game_sdk.so         # Discord's own SDK (x86_64 Linux)
├── discord-game-sdk-godot.dll     # Windows binding
├── discord_game_sdk.dll           # Windows SDK
└── *.gdns                         # NativeScript class files
```

The `.gdnlib` maps `X11.64` → the x86_64 `.so` files. Godot 3's GDNative loader uses the `X11.64` entry for all 64-bit Linux — including aarch64. On aarch64:

1. Godot tries to load `libdiscord-game-sdk-godot.so` (x86_64 ELF)
2. Load fails (wrong machine type)
3. `DiscordCore.new()` returns `null`
4. The `_ready()` check in `discord.gd` handles it safely:

```gdscript
discore_core_ = DiscordCore.new()
if discore_core_:  # ← null check guards all Discord usage
    discore_core_.create(...)
    activity_manager = ActivityManager_.new(...)
    ...
```

Discord is silently disabled on aarch64. Error messages about the failed `.so` load will appear in the Godot log but are non-fatal.

The Nix `autoPatchelfHook` will fail to satisfy dependencies on the x86_64 `.so`s when building on aarch64. Add these to `autoPatchelfIgnoreMissingDeps`:

```nix
autoPatchelfIgnoreMissingDeps = lib.optionals (system == "aarch64-linux") [
  "libdiscord-game-sdk-godot.so"
  "libdiscord_game_sdk.so"
];
```

### 3.4 Export Output Layout (Godot 3, Linux, `embed_pck=false`)

Godot 3 exports with `embed_pck=false` (the upstream preset default) produce a binary + separate `.pck` file. Unlike Godot 4, the GDNative `.so` libraries are also copied flat next to the binary:

**x86_64 export:**
```
Super_Mario_127.x86_64              # engine binary
Super_Mario_127.pck                 # game data + GDScript + resources
libdiscord-game-sdk-godot.so        # x86_64 Discord binding
libdiscord_game_sdk.so              # x86_64 Discord SDK
```

**arm64 export:**
```
Super_Mario_127.arm64               # engine binary (aarch64)
Super_Mario_127.pck                 # same game data
libdiscord-game-sdk-godot.so        # x86_64 (included by Godot's exporter; fails to load at runtime)
libdiscord_game_sdk.so              # x86_64 (same)
```

The `.pck` filename matches the binary's base name by Godot 3 convention.

### 3.5 User Data Directory

```
config/custom_user_dir_name="dev"   # in project.godot
```

On Linux, this sets the Godot user data directory to:
```
$HOME/.local/share/dev/
```
(or `$XDG_DATA_HOME/dev/` if `$XDG_DATA_HOME` is set — **see open gap §7.3**).

Important paths:
```
~/.local/share/dev/
├── settings.cfg                        # LocalSettings autoload (game preferences)
├── level_list/
│   ├── <uuid>.127level                 # level code text files
│   ├── saves/<uuid>.127save            # encrypted save files
│   ├── thumbnails/<uuid>.png           # level thumbnails
│   ├── music/<uuid>-<area-id>.ogg      # custom per-level music
│   └── Developer Levels/               # bundled sample levels (copied from res://)
└── mods/
    └── active.127mod                   # path to active mod file (if any)
```

### 3.6 Level File Format

`.127level` files are plain-text comma-separated encoded strings. They are **not** JSON or binary.

Format version `0.5.1` header:
```
<format_version>,<name%>,<author%>,<description%>,<thumbnail_url%>,[<layout_ids>^<pins>],<area1>,<area2>,...
```

Where `%` = percent-encoded. Each area section:
```
<size_vec2>,<sky>,<background>,<music>,<gravity>,<bg_palette>,<timer>~<foreground_tiles>~<vbg_tiles>~<bg_tiles>~<vfg_tiles>~<objects>
```

Level decode/encode is handled entirely by `level_code_util.gd` and `level/Data.gd`. The format has gone through several migrations (0.4.0 → 0.5.1) handled by `conversion_util.gd`.

### 3.7 Mod System

Mods are `.127mod` files (resource packs applied via `ProjectSettings.load_resource_pack()`). Active mod path is stored at `user://mods/active.127mod`. Not relevant for basic Korri launch support, but the launcher startup sequence must survive if the mod path is absent or invalid.

---

## 4. Build and Export

### 4.1 Godot 3 CLI Export Syntax

Godot 3's command line interface differs significantly from Godot 4:

```bash
# Godot 3 — no --headless flag, no separate --import step
godot3 --no-window --export "Linux/X11" /output/Super_Mario_127.x86_64
godot3 --no-window --export "Linux ARM64" /output/Super_Mario_127.arm64

# Debug template variant:
godot3 --no-window --export-debug "Linux/X11" /output/Super_Mario_127.x86_64

# The preset name must match the [preset.N] name= field in export_presets.cfg exactly.
```

Key flags:
- `--no-window` — do not open an X11 window (headless build)
- `--export "Name"` — export using named preset
- `--path <dir>` — set the project directory (alternative to cd)

No equivalent of Godot 4's `--import` pass is needed. Godot 3 handles resource import inline during the export pass.

Official reference: https://docs.godotengine.org/en/3.6/tutorials/editor/command_line_tutorial.html

### 4.2 Required Export Presets Patch

`export_presets.cfg` (current master) declares:
- `[preset.0]` — HTML5
- `[preset.1]` — Windows Desktop (x86_64)
- `[preset.2]` — Mac OSX
- `[preset.3]` — Linux/X11 (`binary_format/architecture="x86_64"`)
- `[preset.4]` — Android

**No arm64 Linux preset exists.** Required patch adds a new preset:

```ini
[preset.5]

name="Linux ARM64"
platform="Linux/X11"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter="*.crt, *.cfg, *.127level, *.json"
exclude_filter=""
export_path=""
script_export_mode=1
script_encryption_key=""

[preset.5.options]

custom_template/debug=""
custom_template/release=""
binary_format/architecture="arm64"
binary_format/embed_pck=false
texture_format/bptc=false
texture_format/s3tc=false
texture_format/etc=true
texture_format/etc2=false
texture_format/no_bptc_fallbacks=true
```

Note: arm64 Linux typically uses `etc` texture compression (not `s3tc`), matching the export presets used by mobile/ARM targets.

### 4.3 Godot 3 Export Template Layout (nixpkgs)

From `pkgs/development/tools/godot/3/export-templates.nix`:

```nix
godotBinInstallPath = "share/godot/templates/${self.version}.stable";
installedGodotBinName = "linux_${self.godotBuildPlatform}_64_${self.godotBuildTarget}";
```

This installs a template at:
```
$out/share/godot/templates/3.6.stable/linux_x11_64_release
```

Godot 3.6 looks for export templates at `$XDG_DATA_HOME/godot/templates/<version>.stable/`:
- x86_64 template: `linux_x11_64_release`
- arm64 template: `linux_x11_arm64_release`

**⚠️ Open gap:** The nixpkgs derivation hardcodes `linux_x11_64_release` as the installed name regardless of the build host architecture. When building on aarch64-linux, the compiled template binary is aarch64-native but is named `linux_x11_64_release`. Godot 3.6 looks for `linux_x11_arm64_release` when exporting with `binary_format/architecture="arm64"`.

**Likely fix needed in the package derivation:**
```bash
# After symlinking templates:
ln -s "linux_x11_64_release" "$XDG_DATA_HOME/godot/templates/3.6.stable/linux_x11_arm64_release"
```

This needs validation by running an actual arm64 export on an aarch64-linux build system. See §7.2.

### 4.4 Nix Build Phase Outline (comparison to smb-remastered)

```nix
# unpackPhase: copy to writable staging dir (same pattern as smb-remastered)
mkdir -p project
cp -R --no-preserve=mode,ownership "$src/." project/

# patchPhase: apply export preset + level-launch-flag patches
cd project
patch -p1 < patches/0001-add-linux-arm64-export-preset.patch
patch -p1 < patches/0002-add-level-launch-flag.patch
cd ..

# configurePhase: symlink export templates into XDG_DATA_HOME
export HOME=$PWD/godot-home
export XDG_DATA_HOME=$HOME/.local/share
mkdir -p "$XDG_DATA_HOME/godot/templates"
ln -s "${godot3ExportTemplates}/share/godot/templates/3.6.stable" \
    "$XDG_DATA_HOME/godot/templates/3.6.stable"

# If arm64 symlink is needed (see §7.2):
cd "$XDG_DATA_HOME/godot/templates/3.6.stable"
ln -sf "linux_x11_64_release" "linux_x11_arm64_release"
ln -sf "linux_x11_64_debug"   "linux_x11_arm64_debug"
cd -

# buildPhase: single export step (no --import needed)
cd project
mkdir -p ../build
godot3 --no-window --export "${archEntry.preset}" "$PWD/../build/${archEntry.binaryName}"

# Verify outputs:
# - ../build/Super_Mario_127.x86_64 (or .arm64)
# - ../build/Super_Mario_127.pck
```

### 4.5 Runtime Library Closure

Godot 3 Linux X11 needs the following at runtime (via `dlopen` as well as ELF references):

| Library | Purpose |
|---------|---------|
| `alsa-lib` | ALSA audio backend |
| `libpulseaudio` | PulseAudio backend |
| `libGL` | OpenGL / GLES3 renderer |
| `libGLU` | OpenGL utilities |
| `libX11` | X11 windowing |
| `libXcursor` | Cursor theming |
| `libXext` | X11 extensions |
| `libXfixes` | X11 clipboard/DnD fixes |
| `libXi` | X11 input (multi-touch) |
| `libXinerama` | Multi-monitor |
| `libXrandr` | Screen resolution |
| `libXrender` | X11 Render extension |
| `freetype` | Font rendering |
| `openssl` | HTTPS for LSS API calls |
| `udev` (systemdLibs) | Input device enumeration |
| `zlib` | Compression |

Godot 3 has **no Wayland support** (added in Godot 4). The X11 backend works through gamescope's XWayland layer on Korri hardware.

Godot 3 does NOT need `fontconfig`, `libxkbcommon`, `dbus`, or `wayland` — those are Godot 4 runtime requirements. Verify against `pkgs/development/tools/godot/3/default.nix` `buildInputs`.

### 4.6 Texture Compression Notes

`project.godot` renderer settings:
```
quality/driver/fallback_to_gles2=true
quality/intended_usage/framebuffer_allocation=0   # 2D only
vram_compression/import_bptc=true
vram_compression/import_etc=true
```

Export preset options:
- x86_64: `s3tc=true, etc=false` (desktop GPU default)
- arm64: `s3tc=false, etc=true` (ARM GPU default, e.g. Mali)

The SM127 rendering pipeline is 2D-only; GLES2 fallback is enabled for maximum device compatibility. Korri's SM8550 (Sobo/Thor) uses Adreno 740 — GLES3 will be preferred but GLES2 fallback protects older/constrained devices.

---

## 5. Level-File Loading Seam

### 5.1 How Levels Are Loaded at Runtime

Level files flow through these classes:

```
<uuid>.127level (disk)
    → level_list_util.load_level_code_file(path)   # reads raw text string
    → level_code_util.decode(code)                  # parses to Dictionary
    → LevelData._init(code)                         # creates LevelData object
    → LevelInfo                                      # wraps LevelData
    → Singleton.CurrentLevelData                     # global state
    → scene_switcher.gd start_level()               # transitions to player.tscn
```

Key singletons:
- `Singleton` (autoload) = `main_singleton.gd` — lazy-loads scene nodes
- `Singleton2` (autoload) = `singleton2.gd` — game-wide state, mod loading
- `Singleton.CurrentLevelData` — holds the currently-active level
- `Singleton.SceneSwitcher` — handles scene transitions

### 5.2 No Existing CLI Launch Flag

There is currently **no command-line argument for launching a specific level** in SM127. The launcher scene (`launcher.tscn` / `launcher.gd`) checks for an active mod then immediately calls `Singleton.SceneSwitcher.quit_to_menu()`, which goes to the main menu unconditionally.

A source patch is required to add Korri's direct launch capability, following the SMBR pattern.

### 5.3 Level Launch Patch Design (SM127-specific)

The entry points that need modification are different from SMBR because SM127's startup flow is:
1. `launcher.tscn` — mod check + splash → calls `quit_to_menu()`
2. `menu_controller.tscn` — main menu hub
3. `levels_list/` → level selection UI
4. `scene_switcher.start_level()` → `player.tscn`

**Proposed patch sites:**

**`singleton2.gd` — add arg parsing in `_init()` or `_ready()`:**
```gdscript
var launch_level_path: String = ""
var launch_level_pending: bool = false

func _init():
    # ... existing mod loading ...
    parse_launch_level_arg()

func parse_launch_level_arg() -> void:
    var value := OS.get_environment("SM127_LEVEL")
    if value != "":
        set_launch_level(value, "environment")
        return
    var args := OS.get_cmdline_args()
    for i in range(args.size()):
        var arg: String = args[i]
        if arg == "--level" and i + 1 < args.size():
            value = args[i + 1]
        elif arg.begins_with("--level="):
            value = arg.substr("--level=".length())
        if value != "":
            set_launch_level(value, "argument")
            return

func set_launch_level(value: String, source: String) -> void:
    launch_level_path = resolve_launch_level_arg(value)
    launch_level_pending = (launch_level_path != "")
    if launch_level_pending:
        print("SM127 launch level (", source, "): ", launch_level_path)

func resolve_launch_level_arg(value: String) -> String:
    if value == "":
        return ""
    # Absolute paths or paths containing "/" are used directly
    if value.begins_with("/") or "/" in value or value.ends_with(".127level"):
        return value
    # Bare UUIDs are resolved as level IDs under the user level list
    return "user://level_list/" + value + ".127level"
```

**`launcher.gd` — branch after mod check:**
```gdscript
func _ready():
    if Singleton2.mod_active:
        current_mod.text = "Current Mod: " + Singleton2.mod_path.get_file().get_basename()
        yield(timer, "timeout")

    if Singleton2.launch_level_pending:
        launch_direct_level()
    else:
        Singleton.SceneSwitcher.quit_to_menu()

func launch_direct_level():
    # Load the level code from disk
    var path := Singleton2.launch_level_path
    # Resolve user:// paths
    if path.begins_with("user://"):
        path = ProjectSettings.globalize_path(path)

    if not File.new().file_exists(Singleton2.launch_level_path):
        printerr("Launch level not found: " + Singleton2.launch_level_path)
        Singleton.SceneSwitcher.quit_to_menu()
        return

    var level_code := level_list_util.load_level_code_file(Singleton2.launch_level_path)
    var level_data := LevelData.new(level_code)
    # ... build LevelInfo and call SceneSwitcher.start_level() ...
    Singleton2.launch_level_pending = false
```

**Note:** The exact patch shape depends on how `LevelInfo` is constructed from a `LevelData` object — this needs validation against the actual `LevelInfo` class and how the level list normally feeds into `start_level()`. The patch above is a conceptual sketch; the final patch may differ.

### 5.4 Proposed CLI Interface

Following the SMBR contract:

```bash
# By level UUID (resolved to user://level_list/<uuid>.127level)
super-mario-127 --level d4a7b3c2-1f89-4e56-a023-9b8c7d6e5f4a

# By absolute file path
super-mario-127 --level /home/user/.local/share/dev/level_list/my-level.127level

# Via environment variable
SM127_LEVEL=d4a7b3c2-1f89-4e56-a023-9b8c7d6e5f4a super-mario-127
```

---

## 6. Comparison with `smb-remastered`

| Aspect | `smb-remastered` (Godot 4) | `super-mario-127` (Godot 3) |
|--------|---------------------------|------------------------------|
| Engine | Godot 4.6.3 | Godot 3.6 |
| nixpkgs engine source | Separate `nixpkgs-godot` flake input | `pkgs.godot3` in main nixpkgs pin |
| Template install dir | `share/godot/export_templates/<ver>/` | `share/godot/templates/<ver>.stable/` |
| Template symlink needed | Yes (dash→dot version rename) | Yes (64→arm64 rename — see §4.3) |
| Import step | `godot --headless --import` (twice) | None needed |
| Export command | `godot --headless --export-release` | `godot3 --no-window --export` |
| Plugin system | GDExtension (`.gdextension`) | GDNative (`.gdnlib` / `.gdns`) |
| Discord handling | Upstream disables aarch64 in `.gdextension` | x86_64 `.so` fails to load; null-safe in GDScript |
| User data dir | `~/.local/share/SMB1R/` | `~/.local/share/dev/` |
| PCK file | `SMB1R.pck` | `Super_Mario_127.pck` |
| ROM required | Yes (`baserom.nes`) | No |
| Network features | Level downloads from LSS | Level downloads from LSS |
| Texture compression | S3TC (x86), BPTC+ETC2 (arm64) | S3TC (x86), ETC (arm64) |
| Wayland support | Yes (Godot 4 has Wayland) | No (X11 only; gamescope XWayland required) |

---

## 7. Open Documentation Gaps

These items need validation before or during the implementation phase.

### 7.1 ⚠️ Export Template Filename for arm64 (CRITICAL)

The nixpkgs `godot3-export-templates` derivation installs the compiled template as `linux_x11_64_release` regardless of the build architecture (hardcoded in `installedGodotBinName`). Godot 3.6 looks for `linux_x11_arm64_release` when exporting with `binary_format/architecture="arm64"`.

**Action needed:** Validate whether the symlink approach (`ln -sf linux_x11_64_release linux_x11_arm64_release`) is sufficient, or whether the built binary itself would fail at runtime if its self-reported architecture doesn't match the loader's expectations.

**Verification command on aarch64-linux:**
```bash
# After building godot3 and godot3-export-templates for aarch64:
file $(nix build nixpkgs#godot3-export-templates --print-out-paths)/share/godot/templates/3.6.stable/linux_x11_64_release
# Expected: ELF 64-bit LSB executable, ARM aarch64
# If confirmed aarch64, symlink should work.
```

### 7.2 godot3 Version in nixos-25.11

The repo's main nixpkgs pin is `nixos-25.11`. The godot3 package in nixos-25.05 is `3.6` (tag `3.6-stable`). Verify that nixos-25.11 carries the same version and that `godot3` + `godot3-export-templates` are both available for `aarch64-linux` without requiring a separate flake input (unlike the SMBR `nixpkgs-godot` pattern).

```bash
nix eval github:NixOS/nixpkgs/nixos-25.11#godot3.version
nix eval github:NixOS/nixpkgs/nixos-25.11#godot3-export-templates.version
```

If they are the same version string, a separate flake input is unnecessary. If they differ, add a `nixpkgs-godot3` flake input pinned to a commit where both are aligned.

### 7.3 Godot 3 + `custom_user_dir_name` + `$XDG_DATA_HOME`

The `project.godot` sets `config/custom_user_dir_name="dev"`. In Godot 3, verify the exact runtime path when `$XDG_DATA_HOME` is set:
- Expected: `$XDG_DATA_HOME/dev/`
- Or possibly: `$HOME/.local/share/dev/` (ignores XDG override)

This matters for Korri's pre-seeding of level files into the correct directory.

**Verification:** Run the exported binary with `XDG_DATA_HOME=/tmp/test-xdg ./Super_Mario_127.x86_64 --headless` and check where `settings.cfg` appears.

### 7.4 Level Launch Seam — `LevelInfo` Construction from Code

The `scene_switcher.start_level()` takes a `LevelInfo` object and a `working_folder`. The `LevelInfo` class (`res://classes/LevelInfo.gd`) is not inspected in this research session. The patch in §5.3 needs verification against how `LevelInfo` is populated from a `LevelData` object vs. how the normal level list flow constructs it.

Read `res://classes/LevelInfo.gd` and `res://scenes/shared/level_data.tscn` before finalizing the patch.

### 7.5 Discord `.so` in arm64 Export — Inclusion Behaviour

Does Godot 3's exporter include the x86_64 Discord `.so` files in an arm64 export package? The `.gdnlib` maps `X11.64` for all 64-bit Linux (no separate `X11.ARM64` entry exists). Godot 3's exporter may:
- (a) Include `X11.64` libraries even in an arm64 export (most likely)
- (b) Skip GDNative libraries with no matching architecture entry

Verify by inspecting the export output directory on aarch64-linux. If the `.so` files are present, ensure `autoPatchelfIgnoreMissingDeps` is set correctly.

### 7.6 gamescope XWayland + Godot 3 X11 Compatibility

Godot 3 uses the X11 backend (`platform=x11`). On Korri's SM8550 devices, the game runs inside gamescope's XWayland session. Validate that Godot 3's X11 initialization and input handling work correctly through gamescope.

Known potential issues:
- Godot 3's cursor handling (the game sets a custom cursor via `mouse_cursor/custom_image`) may behave differently under XWayland
- Window sizing: `window/size/width=768, height=432, resizable=false` with `stretch/mode=2d, aspect=keep` — verify gamescope honours the fixed-size hint correctly

### 7.7 Godot 3 `--no-window` Headless Export on aarch64 without X11

The Nix derivation build environment has no display server. Verify that `godot3 --no-window --export "Linux ARM64" output.arm64` runs to completion in a pure Nix sandbox on aarch64-linux (or confirm whether a virtual X11 display like `Xvfb` is needed, as some Godot 3 versions require X11 even for headless operations).

---

## 8. Source References

| Source | URL / Path |
|--------|-----------|
| Upstream README | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/README.md |
| `project.godot` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/project.godot |
| `export_presets.cfg` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/export_presets.cfg |
| `level/Data.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/level/Data.gd |
| `util/level_code_util.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/util/level_code_util.gd |
| `util/new/levels_list/level_list_util.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/util/new/levels_list/level_list_util.gd |
| `singletons/local_settings.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/singletons/local_settings.gd |
| `singletons/main_singleton.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/singletons/main_singleton.gd |
| `singleton2.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/singleton2.gd |
| `singletons/scene_switcher.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/singletons/scene_switcher.gd |
| `scenes/menu/launcher/launcher.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/launcher/launcher.gd |
| `addons/discord_game_sdk/discord_sdk.gdnlib` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/addons/discord_game_sdk/discord_sdk.gdnlib |
| `addons/discord_game_sdk/discord.gd` | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/addons/discord_game_sdk/discord.gd |
| Godot 3.6 arm64 announcement | https://godotengine.org/article/dev-snapshot-godot-3-6-beta-4/ |
| Godot 3.6 Linux export docs | https://docs.godotengine.org/en/3.6/tutorials/export/exporting_for_linux.html |
| Godot 3.6 CLI tutorial | https://docs.godotengine.org/en/3.6/tutorials/editor/command_line_tutorial.html |
| nixpkgs `godot3` default.nix | https://raw.githubusercontent.com/NixOS/nixpkgs/nixos-25.05/pkgs/development/tools/godot/3/default.nix |
| nixpkgs `godot3-export-templates.nix` | https://raw.githubusercontent.com/NixOS/nixpkgs/nixos-25.05/pkgs/development/tools/godot/3/export-templates.nix |
| Analogous Korri vendor package | `product/vendor/super-mario-bros-remastered/package.nix` |
| SMBR level launch patch (reference) | `product/vendor/super-mario-bros-remastered/patches/0002-add-level-launch-flag.patch` |
