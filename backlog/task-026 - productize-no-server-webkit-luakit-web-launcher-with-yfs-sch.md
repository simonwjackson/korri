---
id: task-026
title: "Productize no-server WebKit/Luakit web launcher with yfs:// scheme and gamescope-korri"
status: To Do
priority: medium
labels:
  - web-launcher
  - vendor
  - luakit
  - webkitgtk
  - gamescope-korri
  - yfs
created: 2026-06-04
source: user
---

# Productize no-server WebKit/Luakit web launcher with yfs:// scheme and gamescope-korri

## Why it matters

We proved a no-server, low-memory path to launch HTML5 game content (YFS) on Korri device without a background HTTP server, but the prototype is all in /tmp on a single device. Without productizing it, every relaunch of this lane re-discovers the same EGL/DMABUF/scheme-handler/scaling traps. Locking it in as a vendored launcher means future Construct/HTML5 game integrations get a known-good template instead of starting from zero, and lets us A/B against the heavier Chromium lane on the same surface.

## Acceptance Criteria

- [ ] product/vendor/<web-launcher-luakit-name>/ exists with package.nix, launcher script(s), userconf.lua, metrics overlay, and check.nix
- [ ] Launcher composes gamescope-korri + evsieve + Luakit with all required env and flags (WEBKIT_DISABLE_DMABUF_RENDERER=1, GDK_BACKEND=x11, no --expose-wayland, -S fit -F pixel --force-windows-fullscreen, -r 120, scoped 'Korri Scoped YFS Keyboard' virtual keyboard)
- [ ] A frozen `www/` payload (YFS or a synthetic fixture) renders under the launcher with 'WebGL 2' confirmed in console and canvas aspect ≈ 832/448
- [ ] Colocated check asserts the renderer reaches the canvas and reports WebGL 2 without falling back to llvmpipe/software; check runs under headless gamescope backend in CI/local nix flake check
- [ ] Launcher cleanly stops evsieve + WebKit children on wrapper exit (no leaked virtual keyboard, no orphaned WebKit processes)
- [ ] README in the vendor dir documents the known WebKit ~60fps presentation cap and the chosen tradeoff vs the heavier Chromium lane
- [ ] No changes to global InputPlumber profile state; input mapping is scoped to the launcher lifetime only

## Related

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`
- `product/vendor/gamescope-korri/package.nix`
- `product/systems/nixos/overlays/korri-packages.nix`

## Notes

Working prototype shape captured on sobo:

- No-server Luakit `yfs://` custom scheme (in-process resource handler) serves a frozen `www/` tree; `file://` is not viable because of WebKit CORS (`Origin null is not allowed`).
- Required Luakit settings: `enable_webgl=true`, `enable_webaudio=true`, `hardware_acceleration_policy="always"`, `enable_accelerated_2d_canvas=true`.
- Required env on Sobo: `WEBKIT_DISABLE_DMABUF_RENDERER=1` (without it, white screen). `preserveDrawingBuffer:true` must NOT be set (sluggish gameplay).
- Direct-launch seam: read `?sample=`/`?code_url=`/`#code_b64=` early, call `validateLevelCode(JSONString)`, set `LevelCodeJSON` + play globals, jump straight to `Level` layout. Current prototype uses DOM automation behind a loading overlay; long-term wants a proper Construct/event-level patch.
- Scoped input: `evsieve` sidecar with a named virtual keyboard ("Korri Scoped YFS Keyboard"), lifetime tied to the launcher wrapper. Avoids global InputPlumber profile switching. Current bindings: d-pad+left-stick→arrows, west/south→z, north→a, east→x, start→p.
- Gamescope-korri integration: `gamescope-korri --backend wayland -f -b -W 1920 -H 1080 -w <W> -h <H> -r 120 -S fit -F pixel --force-windows-fullscreen -- luakit -U yfs://...`. Xwayland child mode (`GDK_BACKEND=x11`, no `--expose-wayland`) is required so `--force-windows-fullscreen` can size the child; Wayland-client mode left Luakit stuck at ~800x431.
- YFS base viewport per `data.json`: `project[10]=832`, `project[11]=448`, sampling `"nearest"`, framerate mode `"vsync"`. Aspect 832/448 ≈ 1.857; measured canvases at 720/480/360-ish all preserve this within ~1px.
- Measured perf: ~38–40fps unscoped → ~55–58.8fps in gamescope-korri at 1280x720 nested → ~60fps at 832x448 / 360p nested. Cap appears to be WebKitGTK rAF presentation (≈60Hz) under Xwayland+Gamescope even when output is 120Hz and gamescope is launched with `-r 120`; Chromium on the same device hits ~120fps, confirming this is a WebKit-stack limit, not the panel.
- Memory: Luakit/WebKitGTK web process + Luakit ~660–760 MiB PSS region; significantly lighter than the Chromium/CEF lanes.

Productization should land under `product/vendor/<launcher-name>/` (e.g. `web-launcher-luakit/`) with:

- a Nix package that bundles a frozen WebKit/Luakit closure (2.52.x), the userconf.lua scheme handler, the metrics overlay, and the direct-launch shim
- a launcher script that composes gamescope-korri + evsieve + Luakit with the proven flags and env (`WEBKIT_DISABLE_DMABUF_RENDERER=1`, `GDK_BACKEND=x11`, no `--expose-wayland`, `-S fit -F pixel`, `--force-windows-fullscreen`, `-r 120`)
- colocated checks: launch under headless gamescope backend, assert the page reaches a `canvas` element with the expected aspect ratio and that `[C3 runtime] ... WebGL 2` appears in console
- an integration seam so a future `product/vendor/yoshis-fabrication-station/` (and other Construct/HTML5 games) can drop their `www/` payload in and inherit the launcher

Reference artifacts on sobo (will rot — copy what is still useful before relying on them):

- `/tmp/yfs-scheme-luakit-config/luakit/userconf.lua` (yfs:// scheme + WebKit settings)
- `/tmp/yfs-gamescope-korri-luakit-prototype.sh` (gamescope-korri + evsieve + Luakit wrapper)
- `/tmp/YFSv3.13.1/www/` (patched payload: direct-launch shim, metrics overlay, data.json transition fixes)

Reference docs already in repo:

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md` (full capture of the ladder + measurements)

Out of scope for the first slice: per-app per-launcher overrides, multiple concurrent web sessions, automatic frame-rate adaptation, replacing the DOM auto-load with the proper Construct/event patch (track separately).
