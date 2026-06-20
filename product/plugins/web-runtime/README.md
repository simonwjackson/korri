# web-runtime

Shared Chromium runtime for HTML5/canvas web games on Korri devices. Encapsulates
the hard-won runtime behavior so each web game is thin content rather than a bespoke
script.

## What it does

`korri-web-runtime <url|file://…>` launches the game in Chromium **under gamescope**:

- runs Chromium on gamescope's **Xwayland** (`--ozone-platform=x11`) so gamescope's
  window manager fullscreens it; uses `--no-sandbox` only (never `--disable-gpu-sandbox`,
  whose infobar caused canvas scrollbars) and `--ignore-gpu-blocklist` for GPU accel;
- spawns gamescope `-S fit -F pixel` at the game's **native render resolution**, inflated
  by a per-device **gap** for fixed-canvas engines (e.g. GameMaker) so the canvas exactly
  fills the viewport with no scrollbars/clipping;
- clears the engine **start/focus gate** over CDP — a trusted canvas click (with a real
  down/up delay) grants user activation and dismisses GameMaker's canvas-drawn overlay.

## CLI

```
korri-web-runtime <locator> [--engine gamemaker|construct|…] [--native WxH|detect]
  [--output WxH] [--gap WxH] [--filter pixel|linear] [--flag F]* [--shim PATH]*
  [--no-gamescope] [--autoplay default]
```

Engine/combo launchers **declare** `--engine` and `--native` (deterministic). The
generic launcher defaults to `--engine auto --native detect` (best-effort; see backlog
for probe hardening).

## Layout

- `src/core/` — pure, unit-tested logic: chromium argv, native+gap resolution, engine
  classification, gate decision, gamescope request, engine profiles.
- `src/runtime/` — the `korri-web-runtime` bin: CDP client, orchestrator, in-page shims.
- `src/plugin/` — launcher-config helpers (CLI-arg composition from settings).
- `packages/korri-web-runtime/` — Nix package.

## On-device validation

Validated on Sobo (aarch64) against Stargrove Scramble (GameMaker, itch HTML embed) via
the declared path: gamescope-fullscreen, pixel-scaled, black pillarbox, start gate cleared
automatically, reaching the in-game title screen.

```sh
KORRI_WEB_RUNTIME_CHROMIUM=$(command -v chromium) \
KORRI_WEB_RUNTIME_GAMESCOPE=/…/gamescope-korri/bin/gamescope \
korri-web-runtime "https://html-classic.itch.zone/html/4625085/index.html?v=1732313745" \
  --engine gamemaker --native 1008x720
```
