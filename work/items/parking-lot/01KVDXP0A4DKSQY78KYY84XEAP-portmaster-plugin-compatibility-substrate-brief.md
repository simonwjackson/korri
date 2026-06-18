---
date: 2026-06-18
topic: portmaster-plugin-compatibility-substrate
artifact: brief
backlog: 01KVDXP0A4DKSQY78KYY84XEAP
---

# PortMaster Plugin Compatibility Substrate

## Chosen Thing

Build a plugin-owned PortMaster compatibility substrate so Korri can point at a PortMaster catalog entry, install the PortMaster/Nixified bundle, and launch it without Korri core knowing PortMaster-specific mechanics.

Korri core should orchestrate generic plugin capabilities only: catalog/search, acquisition, install/materialization, launch plans, fulfilled runtime resources, diagnostics, and dynamic library entries. The `@korri:portmaster` plugin should own PortMaster layout, scripts, architecture selection, runtime-pack interpretation, compatibility overrides, and launch-envelope behavior.

## Context

Recent Bandai smoke tests proved the problem and the path:

- **Wordle SDL** is a ready-to-run native `aarch64` PortMaster port, but needed NixOS/Bandai adaptation: ELF interpreter/rpath repair, script shebang handling, PortMaster directory environment, and Gamescope/foreground presentation.
- **Digger** includes a ready-to-run `x86_64` binary and launched successfully on Bandai through FEX using `FEX_ROOTFS`, bundled `libs.x86_64`, `SDL_VIDEODRIVER=x11`, and focused fullscreen presentation.
- These were not game-content problems. They were generic compatibility-contract problems.

The product direction is therefore: **do not Nixify every PortMaster game individually; Nixify the PortMaster compatibility contract as plugin-owned substrate.**

## Boundary

Korri core must not know these PortMaster details:

- `/roms/ports`
- `PortMaster/control.txt`
- `directory`
- `DEVICE_ARCH`
- `gptokeyb`
- PortMaster runtime names such as `frt_3.5.2.squashfs`
- individual port ids such as `digger.zip` or `wordlesdl.zip`

The `@korri:portmaster` plugin may depend on generic runtime plugins such as:

- `@korri:gamescope`
- `@korri:fex-runtime`
- future `@korri:retroarch-runtime`
- future `@korri:portmaster-frt-runtime`
- future `@korri:portmaster-love-runtime`
- future `@korri:portmaster-mono-runtime`
- future `@korri:portmaster-java-runtime`

Plugin dependencies and fulfilled resources should be resolved through existing/future generic plugin seams, not hardcoded in Korri core.

## Phased Approach

### Phase 1 — PortMaster install normalizer

Status: **complete locally, validated on Bandai**.

Goal: `@korri:portmaster` can install a catalog zip into Korri storage.

Plugin owns:

- download from catalog
- md5/hash verify
- unpack into writable PortMaster layout
- detect launch scripts
- detect binaries
- record installed manifest

Validation launch:

- **Wordle SDL**, native `aarch64`
- Launch may still use a minimal manual wrapper.
- Success: Wordle renders on Bandai.

Result:

- Added plugin-owned `portmaster.install` handler/exported installer.
- Installed `wordlesdl.zip` from the packaged catalog into a PortMaster `ports/` layout.
- Verified catalog MD5 and emitted `manifests/wordlesdl.json` with script and ELF detection.
- Bandai milestone rendered Wordle from the Phase 1 installed tree using the phase-allowed manual ELF patch and minimal Gamescope launch.

---

### Phase 2 — PortMaster compatibility envelope

Status: **complete locally, validated on Bandai**.

Goal: ports run through a generic PortMaster shell environment without per-port script edits.

Plugin owns:

- fake `/roms/ports` layout via wrapper/sandbox
- `control.txt`
- `directory`
- `DEVICE_ARCH`
- `get_controls`
- `pm_platform_helper`
- `pm_finish`
- `/bin/bash` compatibility
- safe stubs for `/dev/tty0` behavior

Validation launch:

- **Wordle SDL using its original `Wordle SDL.sh`**
- Success: no manual shebang/script patching.

Result:

- Added plugin-owned `portmaster.prepare-launch` handler/exported envelope generator.
- Wrote generated `control.txt` and `tasksetter` into both `$XDG_DATA_HOME/PortMaster` and `/roms/ports/PortMaster` compatible locations.
- Generated a bwrap/bash launch command with `/roms/ports`, `/bin/bash`, `/usr/bin/env`, fake `/dev/tty0`, and fake `/dev/uinput` bindings.
- Bandai milestone launched the original `Wordle SDL.sh` with its `#!/bin/bash` shebang unchanged and captured Wordle rendering. ELF patching remained the phase-allowed manual step pending Phase 3.

---

### Phase 3 — Native ELF repair lane

Goal: native Linux binaries from PortMaster are automatically made runnable on NixOS.

Plugin owns:

- ELF scanning
- interpreter detection
- rpath repair or sandboxed loader path
- bundled `libs.$DEVICE_ARCH` support
- native `aarch64` launch lane

Validation launch:

- **Wordle SDL**, fully installed/launched from catalog by plugin
- Success: user points at `wordlesdl.zip`; plugin handles the rest.

---

### Phase 4 — x86_64/FEX lane

Goal: ready-to-run `x86_64` PortMaster binaries run on Bandai through FEX.

Plugin owns:

- architecture selection
- `x86_64` binary detection
- `libs.x86_64` wiring
- FEX runtime dependency
- FEX rootfs env
- SDL backend fallback rules

Validation launch:

- **Digger**, forced `digger.x86_64`
- Success: Digger renders on Bandai through FEX.

---

### Phase 5 — Foreground session/game presentation

Goal: launched ports appear correctly in front of Korri.

Plugin owns:

- Gamescope wrapping
- X11 vs Wayland fallback
- window focus/fullscreen policy
- log capture
- process supervision
- clean shutdown

Validation launch:

- **Digger x86_64 via FEX + foreground wrapper**
- Success: launches from Korri and appears fullscreen without manual Sway commands.

---

### Phase 6 — Input compatibility

Goal: games are playable, not just visible.

Plugin owns:

- `gptokeyb` replacement or compatibility wrapper
- InputPlumber integration
- SDL controller mappings
- `/dev/uinput` strategy
- per-port control profile loading

Validation launch:

- **Wordle SDL** or **Digger**
- Success: can navigate/play using device controls.

---

### Phase 7 — Runtime plugin seam

Status: **complete locally, validated on Bandai with RetroArch/libretro auto-detection follow-up**.

Goal: PortMaster plugin can request runtime plugins without Korri knowing PortMaster details.

Add runtime plugins such as:

- `@korri:retroarch-runtime`
- `@korri:portmaster-frt-runtime`
- `@korri:portmaster-love-runtime`
- `@korri:portmaster-mono-runtime`
- `@korri:portmaster-java-runtime`

Validation launch:

- **2048.zip** through RetroArch/libretro
- Success: previously skipped libretro port now launches via runtime dependency.

Result:

- Added plugin-owned RetroArch/libretro runtime mode that generates `PortMaster/retroarch` and binds it at `/usr/bin/retroarch` inside the PortMaster envelope.
- Added plugin dependency on the RetroArch app-host provider so PortMaster can request RetroArch without Korri core knowing PortMaster runtime names.
- Bandai validation rendered 2048 using the original `2048.sh` and generated RetroArch wrapper.
- Follow-up implemented install-time runtime detection for incomplete catalog metadata: extracted launch scripts are scanned for `retroarch`/`-L`, extracted files are scanned for `*_libretro.so.*`, detections are recorded in `extracted.runtimeDetections`, and `prepare-launch` auto-selects `runtimeCompatibility.mode = "retroarch-libretro"` unless explicitly overridden.
- Added a generic PortMaster `runtime-mounts` seam for FRT/Godot/Weston-style `.squashfs` runtime contracts. Install records `portmaster-squashfs-runtime` detections from catalog runtime names such as `frt_3.5.2.squashfs`, `godot_4.3.squashfs`, and `weston_pkg_0.2.squashfs`; compatibility profiles can provide fulfilled runtime roots; `prepare-launch` generates placeholder `PortMaster/libs/*.squashfs` files and fake `mount`/`umount` helpers that symlink those roots into the paths expected by upstream scripts.
- Broadened the same seam to common Mono, dotnet, Java/Zulu, Ren'Py, Pyxel, GM Toolkit, Solarus, and RLVM squashfs runtime families. The generated mount helper also supports `mount --bind` overlays used by Ren'Py-style scripts.
- Added `.#portmaster-frt-runtime`, a plugin-owned extraction of upstream `frt_3.5.2.squashfs` that publishes `nix-support/runtime-name`, `runtime-root`, and a `compatibility-profile.json` for the `runtime-mounts` seam. Built and checked locally and for `aarch64-linux` via Fuji.

---

### Phase 8 — armhf / 32-bit ARM lane

Status: **complete locally, validated on Bandai with packaged aarch64 qemu + armhf runtime**.

Goal: 32-bit ARM PortMaster ports run on Bandai.

Plugin owns either:

- armhf rootfs + compat loader, or
- qemu-arm user emulation lane

Validation launch:

- **SkiFree**, forced `skifree_sdl.armhf`
- Success: plugin forces `DEVICE_ARCH=armhf`, wraps the armhf executable with qemu-arm, supplies armhf runtime libraries, and renders the game.

Result:

- Added plugin-owned install-time armhf qemu wrapper lane.
- Moves detected executable `armhf` payloads under `.korri-qemu-arm/` and replaces them with `#!/usr/bin/env bash` wrappers that run `qemu-arm -L $KORRI_PORTMASTER_ARMHF_ROOTFS`.
- Records `extracted.armhfQemuWrappers` in the installed manifest.
- `portmaster.prepare-launch` now prefers `DEVICE_ARCH=armhf` when an armhf qemu wrapper exists, exports armhf rootfs/library-path environment, and bubblewrap-binds absolute rootfs paths.
- Added wrapper `libraryPaths` support so plugin-provided armhf runtime libraries can be appended to `LD_LIBRARY_PATH` without editing upstream scripts.
- Focused test covers a fake Lineoff-style armhf port, verifies executable wrapping, avoids wrapping `.so` payloads, and verifies launch envelope env/bwrap behavior.
- Bandai verification:
  - No host `qemu-arm`, binfmt, or armhf rootfs was present before the phase.
  - Verified real PortMaster armhf helper binaries execute under qemu-arm: `xdelta3.armhf -h` and `7zzs.armhf` printed usage successfully.
  - Added `.#portmaster-armhf-runtime`, a plugin-owned Debian bookworm armhf SDL runtime rootfs package with `nix-support/armhf-rootfs`, `nix-support/library-path`, `nix-support/qemu-arm`, and `nix-support/env` metadata.
  - Package includes qemu-arm plus the armhf glibc/libstdc++/SDL2/SDL2_image/SDL2_mixer/SDL2_ttf dependency closure needed by small direct SDL armhf ports.
  - Built `.#packages.aarch64-linux.portmaster-armhf-runtime` via Fuji and copied it to Bandai.
  - Installed `skifree.zip` from the packaged catalog, generated a qemu wrapper for `skifree/skifree_sdl.armhf`, and launched the original `SkiFree.sh` unchanged.
  - Screenshot `/tmp/portmaster-phase8-skifree5-screen-focused.png` confirmed SkiFree rendered on Bandai through package-provided aarch64 `qemu-arm` and the package-provided armhf rootfs/library path.

---

### Phase 9 — Compatibility database

Status: **compatibility profile substrate complete locally**.

Goal: weird ports don’t require code changes.

Plugin owns declarative overrides:

```json
{
  "digger.zip": {
    "arch": "x86_64",
    "env": {
      "SDL_VIDEODRIVER": "x11"
    }
  }
}
```

Validation launch:

- Pick one previously failing/noisy port and fix it with only metadata.
- Success: no TypeScript/Nix code change needed for that port.

Result:

- Added plugin-owned `PortMasterCompatibilityProfile` metadata for launch-script, device-arch, env, runtime/input compatibility, and presentation defaults.
- Profiles can be supplied inline to `createPortMasterPlugin`, passed per install, or loaded from `KORRI_PORTMASTER_COMPATIBILITY_PATH` JSON.
- Install records the selected profile in the installed manifest; `prepare-launch` consumes manifest-stored compatibility defaults unless the caller explicitly overrides them.
- Focused test verifies a Digger-style profile selecting an alternate launch script, forcing `DEVICE_ARCH=x86_64`, setting `SDL_VIDEODRIVER=x11`, and applying a fullscreen presentation matcher without PortMaster-specific core branching.

---

### Phase 10 — Library integration

Status: **library-source substrate complete locally; UI install/search end-to-end still pending**.

Goal: installed PortMaster games appear as normal Korri library entries.

Plugin owns:

- installed-port discovery
- dynamic library source
- launch metadata
- uninstall/update metadata
- diagnostics

Validation launch:

- Search/install/launch **Digger** or **Wordle SDL** entirely through Korri UI.
- Success: Korri core remains unaware of PortMaster-specific mechanics.

Result:

- Added a PortMaster-owned installed library source overlay that scans `manifests/*.json` under the plugin install root and emits normal `PlayableLibraryEntry` records such as `@korri:portmaster/wordle`.
- Launch resolution for those entries delegates to the existing PortMaster launch envelope, so script selection, `/roms/ports` compatibility, runtime detection, FEX/qemu wrappers, and environment policy stay plugin-owned.
- The first-party `PluginLibrarySourceLayerLive` enables this overlay only when `@korri:portmaster` is enabled.
- `canResolveLaunchForGame` remains read-only; launch-preparation file generation happens only during actual resolution.
- Focused tests cover direct overlay behavior and live first-party layer wiring.

## End State

The user flow becomes:

1. Search PortMaster catalog.
2. Pick a game.
3. Install.
4. Launch.

Korri core only sees generic plugin capabilities. `@korri:portmaster` owns the whole PortMaster contract.

## Success Criteria

- Ready-to-run native `aarch64` ports launch without manual script or ELF repair.
- Ready-to-run `x86_64` ports launch on Bandai through a plugin-owned FEX lane.
- Runtime-dependent ports are routed through plugin-declared runtime dependencies.
- Unsupported architectures/runtimes produce structured diagnostics instead of mysterious launch failure.
- Per-port quirks are handled through declarative compatibility metadata where possible.
- Installed PortMaster games materialize as normal Korri library entries.
- Korri core contains no PortMaster-specific branching, paths, catalog ids, runtime names, or compatibility rules.

## Related Work

Brief is co-located with its backlog item under `work/items/parking-lot/`.

- Backlog: `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-build-plugin-owned-portmaster-compatibility-substrate.md`
- PortMaster plugin: `product/plugins/portmaster/src/plugin.ts`
- PortMaster package: `product/plugins/portmaster/packages/portmaster/default.nix`
- Plugin composition: `product/plugins/portmaster/nix/composition.nix`
- Gamescope plugin: `product/plugins/gamescope/src/plugin.ts`
- FEX runtime setup: `product/plugins/fex-runtime/packages/fex-runtime/setup-env`
