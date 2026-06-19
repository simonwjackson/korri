---
title: Korri launch config launchers and runtimes
date: 2026-06-02
---

# Korri launch config launchers and runtimes

Korri readable launch authoring is centered on content systems, launchers, runtimes, library releases, and plugin-owned launch policy.

- **Launchers** are runnable programs. First-party plugin launchers use plugin-qualified ids, for example `@korri:retroarch/retroarch`.
- **Runtimes** are launch support artifacts such as libretro cores. Runtime records own compatibility metadata such as `app` and `supports.systems`.
- **Plugin policy** lives under `settings.plugin`. RetroArch policy is owned by `@korri:retroarch`; generic platform records do not expose top-level `retroarch:` fields.
- **Library releases** choose the launcher/runtime pair in `launch:`.

Alpha config is intentionally breaking: old `apps.retroarch`, `release.apps`, `system.apps`, launcher `kind`, top-level `retroarch:`, `modules.fake08`, and `app: retroarch` records are not compatibility aliases.

```yaml
launchers:
  "@korri:retroarch/retroarch":
    plugin: "@korri:retroarch"
    command: retroarch
    settings:
      plugin:
        configFile:
          mode: generated
        paths:
          systemDirectory: /storage/bios
        lifecycle:
          saveOnExit: false
        extraSettings:
          video_driver: glcore
          config_save_on_exit: false
          video_fullscreen: true

runtimes:
  "@korri:pico8/fake08":
    kind: libretro-core
    app: "@korri:retroarch/retroarch"
    path: /etc/korri/cores/fake08_libretro.so
    supports:
      systems: [pico8]

systems:
  pico8:
    name: PICO-8

library:
  porklike:
    title: Porklike
    releases:
      - id: pico8
        system: pico8
        target:
          kind: file
          storage: roms
          path: pico8/porklike.p8
        launch:
          use: "@korri:retroarch/retroarch"
          runtime: "@korri:pico8/fake08"
```

## RetroArch soft patches

`patches:` declares launch-time soft patches for RetroArch content. Patch paths are ordinary absolute file paths on the target device; Korri does not download, discover, or catalog patches in v1.

Supported formats are IPS, BPS, UPS, and XDelta. The format is inferred case-insensitively from the file extension (`.ips`, `.bps`, `.ups`, `.xdelta`).

```yaml
launchers:
  "@korri:retroarch/retroarch":
    plugin: "@korri:retroarch"
    command: retroarch
    settings:
      plugin: {}

# The RetroArch plugin contributes the `gba` system and the
# `@korri:retroarch/mgba` runtime at /etc/korri/cores/mgba_libretro.so.
library:
  yoshi-island:
    title: Super Mario Advance 3 - Yoshi's Island
    releases:
      - id: gba
        system: gba
        target:
          kind: file
          storage: roms
          path: gba/Super Mario Advance 3 - Yoshis Island (USA).gba
        patches:
          - /storage/patches/yoshi/SMA3 - Yoshis Island Colour Restoration (U).ips
        launch:
          use: "@korri:retroarch/retroarch"
          runtime: "@korri:retroarch/mgba"
        presets:
          color-and-voice:
            patches:
              - /storage/patches/yoshi/SMA3 - Yoshis Island Voice Removal (U).ips
```

Patch lists append in cascade order. At launch time RetroArch materialization creates a launch-scoped artifact directory, symlinks the original ROM into that directory, and symlinks ordered patch sidecars next to it using RetroArch-compatible names such as `Game.ips`, `Game.ips1`, or `Game.bps2`. Source ROMs and patch files are not modified or copied.
