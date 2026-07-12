---
id: 01KX7T49F64S9C4K0FQ0VSJ9EG
slug: support-steam-app-prefix-matching-in-stream-surface-selector
title: Support steam_app_* prefix matching in stream-surface selector
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - streaming
  - reliability
created: 2026-07-11
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
---

# Support steam_app_* prefix matching in stream-surface selector

## Why it matters

sessiond's stream-surface watchdog killed every Steam-client launch on aka after 60s: the selector only exact-matches (KORRI_STREAM_SURFACE_APP_IDS=gamescope) while Steam/Proton game windows carry X11 class steam_app_<appid>. Worked around on aka with a hand-generated drop-in listing all 49 installed appids plus a 180s timeout, but the list rots as apps are installed/removed. matchesSelector in game-stream-fullscreen.ts needs prefix/glob support (e.g. steam_app_*) or a dedicated steamApps flag, and the NixOS module should expose the selector as options instead of raw env baked into host drop-ins.

## Acceptance Criteria

- [ ] Selector matches class prefixes (or globs) so steam_app_<any> works without enumerating appids
- [ ] A steam -applaunch launch on a source machine survives surface repair with no per-app config
- [ ] korri-sessiond NixOS module exposes surface selector + timeout options; aka drop-in retired
