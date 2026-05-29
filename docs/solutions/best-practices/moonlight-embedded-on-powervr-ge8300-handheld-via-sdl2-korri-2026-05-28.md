---
title: Run Moonlight on PowerVR GE8300 fbdev handhelds with SDL2-korri's Batocera mali driver
date: 2026-05-28
category: docs/solutions/best-practices
module: moonlight-bringup
problem_type: best_practice
component: moonlight-embedded-korri
severity: medium
applies_when:
  - Bringing up moonlight-embedded-korri on a TRIMUI Brick or similar PowerVR/Mali handheld whose display is fbdev-only
  - nixpkgs SDL2 resolves to sdl2-compat and SDL_CreateWindow fails under -platform sdl
  - The stock OS already carries working vendor EGL/GLES blobs under /usr/lib
  - The first goal is SDL driver activation, not pixel-perfect output or hardware decode
tags:
  - moonlight
  - sdl2
  - mali
  - powervr
  - fbdev
  - trimui-brick
  - nix
  - korri
related_components:
  - moonlight-embedded-korri
  - SDL2-korri
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md
  - docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md
  - docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md
---

# Run Moonlight on PowerVR GE8300 fbdev handhelds with SDL2-korri's Batocera mali driver

## Context

The TRIMUI Brick can run the Korri Moonlight closure far enough to list Sunshine apps, but upstream nixpkgs `SDL2` is now `sdl2-compat`. That shim does not carry Batocera/Knulli's `mali` video driver, so `moonlight stream ... -platform sdl` cannot create a window on a display stack where `/dev/dri/card0` is render-only and the real scanout path is `/dev/fb0`.

Knulli solves the same hardware problem by shipping real SDL2 `release-2.32.8` from `libsdl-org/SDL` with Batocera's `sdl2_add_video_mali_gles2.patch`. Korri's equivalent is `SDL2-korri`: a real SDL2 build pinned to the same upstream tag with that patch applied and routed only into `moonlight-embedded-korri`.

## Guidance

### Build SDL2-korri as a broad SDL2, not a Brick-only library

Compile the standard drivers and the mali driver into one SDL2:

- `wayland`
- `x11`
- `kmsdrm`
- `vulkan`
- `mali`
- `opengl_es1`
- `opengl_es2`
- `dummy`
- `offscreen`

The Batocera patch is additive: it adds `SDL_VIDEO_DRIVER_MALI`, changes EGL platform-display selection, and forces GLES2 in the shared KMSDRM/GLES path when the mali driver is compiled. Non-Brick hosts still select their normal SDL driver at runtime. The broad build lets x86 kiosk, SM8550, and Brick consumers share one Korri Moonlight binary instead of forking packages per chipset.

### Keep the overlay seam narrow

Expose `pkgs.SDL2-korri`, then pass it as the `SDL2` argument to `moonlight-embedded` in `nix/overlays/korri-packages.nix`. Do not redefine global `pkgs.SDL2` until there is a separate decision with evidence for Sunshine, desktop, libretro, and other SDL consumers.

The invariant to gate is:

- `moonlight-embedded-korri` closure references `SDL2-korri-*`
- `moonlight-embedded-korri` closure does not reference `sdl2-compat-*`
- `pkgs.SDL2` still resolves to upstream `sdl2-compat`

### Use Knulli's vendor GLES blobs through a temporary shim

SDL2-korri owns SDL2 and the Batocera patch lineage. It does not yet vendor PowerVR GE8300 userspace. Until that package exists, create `/tmp/mali-shim` from Knulli's current `/usr/lib` before running Moonlight:

```sh
mkdir -p /tmp/mali-shim
for lib in $(ls /usr/lib | grep -iE '^lib(EGL|GLES|pvr|srv).*\.so(\.[0-9]+)*$'); do
  ln -sf /usr/lib/$lib /tmp/mali-shim/$lib
done
```

Then launch with the mali driver forced:

```sh
SDL_VIDEODRIVER=mali \
LD_LIBRARY_PATH=/tmp/mali-shim:/lib \
moonlight stream 192.168.1.117 -app Desktop -platform sdl -verbose
```

When using a Nix closure on Knulli, invoke the closure's own `ld-linux-aarch64.so.1` and include `/tmp/mali-shim` before the Nix library path so SDL's `dlopen` sees the vendor EGL/GLES first.

### Treat first light as driver activation, not rendering correctness

The success bar for this stage is any Sunshine desktop frame on `/dev/fb0`, even garbled. Pixel format, stride, and hardware decode are downstream work. Stock Knulli Moonlight can show the same garble, so do not conflate SDL driver activation with final video correctness.

## Verification status from the first SDL2-korri run

Verified:

- `SDL2-korri` builds on `x86_64-linux` and `aarch64-linux` from `release-2.32.8`.
- Installed `SDL_config.h` defines `SDL_VIDEO_DRIVER_MALI`, `SDL_VIDEO_DRIVER_KMSDRM`, `SDL_VIDEO_DRIVER_WAYLAND`, and `SDL_VIDEO_DRIVER_X11`.
- `moonlight-embedded-korri` x86 closure references `SDL2-korri-*` and the package-output check rejects `sdl2-compat-*` references.
- The aarch64 closure built on fuji and shipped to the Brick with chunked tar plus symlink replay.
- On the Brick, the new closure prints Moonlight help and lists Sunshine apps from `192.168.1.117`.

Inconclusive:

- The first `SDL_VIDEODRIVER=mali ... stream Desktop -platform sdl` attempt made the Brick unreachable over WiFi (`No route to host`) before logs could be collected and before a physical display observation was confirmed. Keep the stream test gated by a physical observer or a serial/recovery path until that failure mode is understood.

## Related

- [Bring up moonlight-embedded-korri on an aarch64 handheld via prebuilt closure + manifest-driven launcher](./moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md)
- [Ship Nix closures to constrained handhelds in 40-path chunks instead of a monolithic tarball](./chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md)
- [Busybox tar silently drops symlinks during closure extract; replay from manifest](../runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md)
