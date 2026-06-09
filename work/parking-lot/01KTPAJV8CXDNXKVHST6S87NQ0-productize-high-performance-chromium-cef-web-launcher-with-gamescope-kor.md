---
id: 01KTPAJV8CXDNXKVHST6S87NQ0
slug: productize-high-performance-chromium-cef-web-launcher-with-gamescope-kor
title: "Productize high-performance Chromium/CEF web launcher with gamescope-korri"
origin: parked
legacy: backlog/task-027
status: To Do
priority: medium
labels:
  - "web-launcher"
  - "vendor"
  - "chromium"
  - "cef"
  - "electrobun"
  - "gamescope-korri"
  - "yfs"
created: 2026-06-04
source: user
---

# Productize high-performance Chromium/CEF web launcher with gamescope-korri

## Why it matters

We proved that for HTML5 game content that needs >60fps (and accepts ~1 GiB memory cost), Chromium-class browsers on this device hit 120fps via two distinct routes (standalone Chromium, and Electrobun with CEF renderer), while WebKit-stack runtimes appear capped near 60fps under our composition. Both routes have non-obvious traps (Wayland-client CSD titlebar inside gamescope, missing libGL.so.1, wrong use-gl value, Electrobun's default disable-gpu flags). Productizing this lane lets a future game say "I need the fast lane" and inherit a known-good config instead of every team re-discovering the same EGL/ANGLE/CEF flag combinations.

## Acceptance Criteria

- [ ] product/vendor/<web-launcher-chromium-name>/ exists with package.nix, launcher script(s), and check.nix; canonical variant chosen (likely standalone Chromium kiosk) with the Electrobun-CEF variant documented as the alternative
- [ ] Launcher composes gamescope-korri + evsieve + Chromium with all required flags (--no-sandbox, --ozone-platform=x11, --kiosk, --start-fullscreen, --allow-file-access-from-files, --autoplay-policy=no-user-gesture-required, --ignore-gpu-blocklist, isolated --user-data-dir) and gamescope-korri (-S fit -F pixel --force-windows-fullscreen -r 120 with the app's design viewport)
- [ ] Optional Electrobun-CEF variant has a documented recipe to swap libNativeWrapper_cef.so, populate bin/cef, set defaultRenderer:'cef', and apply the working chromiumFlags + LD_LIBRARY_PATH + libglvnd/Mesa paths without breaking the existing native-renderer Korri desktop
- [ ] A frozen `www/` payload (YFS or fixture) renders with hardware WebGL 2 confirmed in console (no llvmpipe/software fallback) and measured fps >= configurable floor (e.g. 100 on this device)
- [ ] Colocated check runs under headless gamescope backend, asserts canvas present + WebGL 2 + fps floor + no titlebar/CSD inside the gamescope surface
- [ ] Launcher cleanly stops evsieve + browser children + (CEF variant) bun Helpers on wrapper exit; no leaked virtual keyboard, no orphaned processes
- [ ] No global InputPlumber profile mutation; input mapping is scoped to launcher lifetime via the same 'Korri Scoped YFS Keyboard' pattern as the WebKit lane
- [ ] README documents memory cost (~800 MiB Chromium / ~1.1 GiB Electrobun-CEF PSS) and explicitly contrasts with the lighter Luakit lane so callers can pick

## Related

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`
- `product/vendor/gamescope-korri/package.nix`
- `product/apps/desktop/main.ts`
- `product/apps/desktop/nix/wrap.nix`
- `product/apps/desktop/nix/unwrapped.nix`
- `product/systems/nixos/overlays/korri-packages.nix`
- `backlog/task-026`

## Notes

Two viable variants — pick one canonical and keep the other documented as the alternative.

Variant A — standalone Chromium kiosk inside gamescope-korri:

- `chromium --no-sandbox --ozone-platform=x11 --kiosk --start-fullscreen --allow-file-access-from-files --autoplay-policy=no-user-gesture-required --ignore-gpu-blocklist --user-data-dir=...` launched under gamescope-korri `-W 1920 -H 1080 -w 832 -h 448 -r 120 -S fit -F pixel --force-windows-fullscreen`.
- Xwayland child mode is required so gamescope can own the surface; Wayland-client mode rendered a CSD titlebar inside gamescope.
- Drop `--expose-wayland` for the Xwayland path.
- Measured: ~120–122 fps, ~824 MiB PSS, ~1355 MiB RSS, ~178% CPU on this device.

Variant B — Electrobun CEF enclosure (reuses Korri's existing desktop app shell):

- Switch `Resources/build.json` to `defaultRenderer: "cef"` and bundle Electrobun's `libNativeWrapper_cef.so` + CEF runtime under `bin/cef` (symlinks for `libcef.so`, `libEGL.so`, `libGLESv2.so`, `libvk_swiftshader.so`, `libvulkan.so.1`).
- Remove Electrobun's default GPU-disabling flags via `chromiumFlags`: `disable-gpu:false`, `disable-gpu-compositing:false`, `disable-accelerated-*:false`, `use-gl:false`, `ignore-gpu-blocklist:true`, `enable-webgl:true`. Do NOT pin `use-gl=egl` — this CEF build only allows `egl-angle/default`.
- Required LD path additions: a glibc-2.40-compatible `libglvnd-1.7.0` and Mesa (e.g. `mesa-25.2.6/lib` + `/lib/dri` + `share/glvnd/egl_vendor.d`). Without `libGL.so.1` reachable, the GPU process repeatedly exits with `Could not dlopen libGL.so.1`.
- Required runtime libs in LD_LIBRARY_PATH: alsa-lib, at-spi2-core, cups.lib, dbus.lib, expat, mesa-libgbm, nss, nspr, pango (compatible glibc), systemd, xorg.lib{X11,xcb,Xcomposite,Xdamage,Xext,Xfixes,Xrandr}, libxkbcommon, plus the Korri desktop's existing webkitgtk/gtk3/glib chain.
- Measured: ~120–128 fps, ~1131 MiB PSS — higher memory than standalone Chromium but reuses Korri's existing window/preload/IPC plumbing.

Shared traps caught in this round:

- `--ozone-platform=wayland` is incompatible with Vulkan in this Chromium build; either disable Vulkan or use X11 ozone.
- `use-gl=egl` is rejected by current CEF (`egl-gles2,angle=none not in allowed [egl-angle,angle=default]`).
- `pango-1.57.x` against glibc 2.40 hits `undefined symbol: FcConfigSetDefaultSubstitute`; pin to `pango-1.52.x` (matches the existing Korri desktop's fontconfig/harfbuzz set).
- /tmp tmpfs on Sobo is ~750 MiB; CEF extraction and Chromium profile dirs must go under /root or similar, not /tmp.
- The system Korri desktop already uses Electrobun native WebKit (renderer "native"); the CEF variant must coexist or be selectable without breaking the existing app — do not flip the global default.

Shared composition with gamescope-korri (both variants):

- Xwayland child mode, `--force-windows-fullscreen`, `-S fit -F pixel`, `-r 120`, `-W 1920 -H 1080`, `-w <viewport-w> -h <viewport-h>` matching the app's design viewport (832x448 for YFS).
- Scoped evsieve sidecar (same "Korri Scoped YFS Keyboard" pattern as the Luakit lane) — keep input mapping a launcher concern, not an InputPlumber profile concern.
- CPU governor pinning to `performance` measurably helps; GPU/UFS devfreq cannot be pinned from userspace on this kernel (writes either EROFS or don't stick), so do not depend on it.

Reference artifacts on sobo (will rot):

- `/tmp/yfs-gamescope-korri-chromium-prototype.sh` (Chromium+gamescope-korri working config)
- `/tmp/yfs-electrobun-cef-prototype.sh` (Electrobun CEF working config)
- `/root/yfs-electrobun-cef/Korri-dev` (patched bundle with CEF runtime)
- `/root/yfs-electrobun-runtime/{core,cef}` (Electrobun v1.16.0 arm64 core + CEF downloads)
- `/tmp/yfs-governor-restore-*.sh` (CPU governor restore helper)

Reference doc already in repo:

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

Productization should land under `product/vendor/<web-launcher-chromium-name>/` (or `web-launcher-cef-electrobun/`) with a Nix package, a launcher script that composes gamescope-korri + evsieve + the browser with the proven flags/env, a fixture payload, and a colocated check that asserts WebGL is hardware (`[C3 runtime] ... WebGL 2 [Apple GPU]` or equivalent — not llvmpipe/software) and that fps stays above a configurable floor (e.g. 100 on this device). Decide the canonical default (likely Variant A for first slice — lower memory, simpler dependency surface), and capture Variant B as the alternative that reuses the Electrobun app shell for richer Korri integration.

Out of scope for the first slice: shared compositor between multiple web launchers, per-game memory budgets, automatic variant selection per device, replacing CPU governor pinning with a less invasive mechanism.
