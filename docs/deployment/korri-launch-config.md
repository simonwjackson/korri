---
title: Korri launch config apps and modules
date: 2026-06-02
---

# Korri launch config apps and modules

Korri launch authoring is centered on content systems, apps, modules, and `launch` blocks.

- **Apps** are runnable programs such as `retroarch`, `mame`, `dolphin`, and `solarus`.
- **Modules** are loadable artifacts such as libretro cores. `fake08` is a module used by the `retroarch` app.
- **Launch blocks** on `systems`, `games`, presets, global config, users, and one-off overrides choose `app`, optional `module`, scalar `settings`, and launch-local `args`/`env`/`cwd` contributions.

Built-in app ids are known by Korri and by the image. Users do not need to restate `type: retroarch` or `command: retroarch` for built-ins. The optional top-level `apps.<id>` record overrides app defaults, most commonly `settings`, or defines a custom app by supplying `command` and optional `args`.

```yaml
version: 1

apps:
  retroarch:
    settings:
      video_driver: glcore
      config_save_on_exit: false
      video_fullscreen: true

modules:
  fake08:
    kind: libretro-core
    path: /etc/korri/cores/fake08_libretro.so

systems:
  pico8:
    name: PICO-8
    extensions: [.p8, .png]
    launch:
      app: retroarch
      module: fake08
      settings:
        video_scale_integer: true

  arcade:
    name: Arcade
    extensions: [.zip, .7z]
    launch:
      app: mame
      settings:
        video: opengl
        joystick: true
        skip_gameinfo: true

  wii:
    name: Nintendo Wii
    extensions: [.rvz, .iso, .wbfs]
    launch:
      app: dolphin
      settings:
        video_backend: Vulkan
        internal_resolution: 2x-native

  solarus:
    name: Solarus
    extensions: [.solarus, .zip]
    launch:
      app: solarus
      settings:
        fullscreen: true

games:
  porklike:
    system: pico8
    contentPath: /storage/roms/pico8/porklike.p8
    metadata:
      name: Porklike
    launch:
      settings:
        video_scale_integer: false
      args:
        - --verbose
```

Settings are typed scalar maps (`string | number | boolean`). Nested settings and `null` are rejected by strict schema decoding. Settings cascade through the existing layer order: global, user, system, app, legacy launcher, game, selected preset chain, then ephemeral override. More-specific keys win, including explicit `false` and `0`. `inherit: false` truncates the inherited cascade layer as a whole.

## RetroArch soft patches

`patches:` declares launch-time soft patches for RetroArch content. Patch paths are ordinary absolute file paths on the target device; Korri does not download, discover, or catalog patches in v1.

Supported formats are IPS, BPS, UPS, and XDelta. The format is inferred case-insensitively from the file extension (`.ips`, `.bps`, `.ups`, `.xdelta`). Korri's packaged RetroArch is built with XDelta/liblzma support and the Nix checks assert `retroarch --help` exposes `--xdelta` before `.xdelta` is accepted by config validation.

```yaml
version: 1

systems:
  gba:
    name: Game Boy Advance
    launch:
      app: retroarch
      module: mgba

modules:
  mgba:
    kind: libretro-core
    path: /etc/korri/cores/mgba_libretro.so

games:
  yoshi-island:
    system: gba
    contentPath: /storage/roms/gba/Super Mario Advance 3 - Yoshis Island (USA).gba
    patches:
      - /storage/patches/yoshi/SMA3 - Yoshis Island Colour Restoration (U).ips
    presets:
      color-and-voice:
        patches:
          - /storage/patches/yoshi/SMA3 - Yoshis Island Voice Removal (U).ips
      color-voice-and-qol:
        patches:
          - /storage/patches/yoshi/SMA3 - Yoshis Island Voice Removal (U).ips
          - /storage/patches/yoshi/SMA3 - Yoshis Island QoL Hack (U).xdelta
      voice-only:
        inherit: false
        patches:
          - /storage/patches/yoshi/SMA3 - Yoshis Island Voice Removal (U).ips
```

Patch lists append in cascade order. A game-level `patches:` list applies to the base launch. A selected preset contributes additional patches after the base game patches, so `color-and-voice` above stages colour restoration first and voice removal second. `inherit: false` keeps the existing broad cascade escape hatch: on a layer that supports it, less-specific inherited contributions for that layer are dropped before that layer's own fields are applied.

Korri hides RetroArch's indexed sidecar naming from authors. At launch time it creates a launch-scoped artifact directory, symlinks the original ROM into that directory, and symlinks ordered patch sidecars next to it using RetroArch-compatible names such as `Game.ips`, `Game.ips1`, or `Game.bps2`. Source ROMs and patch files are not modified or copied. If a patch path is missing, unreadable, not a regular file, uses an unsupported extension, or targets a non-RetroArch app such as Dolphin, launch resolution fails with a patch-specific diagnostic.

Patched and unpatched presets for the same declared base game share the same save and savestate identity. The v1 identity is derived from the base `system` plus the declared `contentPath`, not from the selected preset or patch list. This means trying a colour-restoration preset does not silently fork saves from the unpatched game.

Device smoke testing is still useful execution evidence, but it is not a v1 implementation dependency. A manual smoke should record the YAML used, the resolved launch command/artifact root, the staged sidecar order, and whether RetroArch booted the expected patched content on device.

## Migration aliases

Legacy fields remain valid during the migration window:

| Legacy field | New meaning | Precedence |
|---|---|---|
| `launchers.<id>` | Legacy app/command template | Used as fallback and for compatibility |
| `launcher` | Alias for `launch.app` | Loses to same-layer `launch.app` |
| `core` | Alias for `launch.module` / direct legacy core string | Loses to same-layer `launch.module` |
| `systems.<id>.cores.<app>` | Legacy default module/core for an app | Used when no `launch.module` exists |
| `byLauncher.<id>` | Scoped contribution for the resolved app/launcher id | Kept unchanged in v1 |

Dry-run validation (`tools/library/launcher-config-cli.ts`) reports resolved app, module, settings, materialized artifact paths, and the final `LaunchSpec`. Use it before device smoke when editing YAML.

## Operational boundaries

App packages are image capabilities. Naming `launch.app: dolphin` in YAML does not add Dolphin to a product image; the image or Nix module must put the executable on sessiond's PATH. The current kiosk product capability remains RetroArch plus the stable fake08 module path at `/etc/korri/cores/fake08_libretro.so`.

Korri materializes per-launch app config under `KORRI_LAUNCH_ARTIFACTS_DIR`, not under `/tmp`, because sessiond uses `PrivateTmp`. The generated files are runtime artifacts, not durable user data. Sessiond still receives the unchanged structured `LaunchSpec` shape and remains foreground lifecycle owner.
