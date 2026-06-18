---
id: 01KV9R9DDVKHY933GBQ031YP3E
slug: add-renderer-suspend-resume-to-preserve-gui-state-across-gam
title: Add renderer suspend/resume to preserve GUI state across games
origin: parked
status: To Do
priority: medium
labels:
  - desktop
  - sessiond
  - ux
  - foreground-lifecycle
  - architecture
created: 2026-06-17
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
  invoked_by: user
---

# Add renderer suspend/resume to preserve GUI state across games

## Why it matters

Returning from a game currently kills and relaunches Electrobun, so the user lands back on home instead of the previous route/selection/scroll state. This feels rigid and broken. A renderer-owned suspend/resume capability can preserve UI continuity without coupling sessiond product logic directly to Sway.

## Acceptance Criteria

- [ ] Sessiond uses a renderer capability such as suspend()/resume() before/after managed game launches instead of always stop()/launch() when supported
- [ ] Electrobun desktop host keeps the React app alive across a game session and returns to the prior route/selection/scroll state after exit
- [ ] Input dispatch and renderer polling are paused or safely gated while the renderer is suspended so game input is not double-consumed
- [ ] If suspend/resume is unsupported or the renderer crashes while suspended, sessiond falls back to the existing kill/relaunch path
- [ ] Sway-specific window control, if needed, is hidden behind a backend/interface and is not the product-level contract

## Related

- `product/services/device/sessiond-renderer.ts`
- `product/services/device/sessiond-role.ts`
- `product/services/device/sessiond.ts`
- `product/services/device/sessiond-sway.ts`
- `product/apps/desktop/main.ts`
- `product/apps/desktop/input-broker.ts`

## Notes

Design direction from discussion: avoid direct sessiond-to-Sway coupling by extending KorriRendererController with foreground-yield semantics, e.g. suspend/resume or hide/show. Preferred hierarchy: native Electrobun hide/show if available; GTK/toolkit hide/show if reachable; compositor-specific adapter behind interface; existing kill/relaunch fallback. Current kiosk role beforeChildLaunch stops renderer and restoreIdleAfterLaunch relaunches it, which drops all in-memory React state. The goal is Option B (hide/keep alive) with a safe fallback, not a blind replacement of current deterministic home invariant.
