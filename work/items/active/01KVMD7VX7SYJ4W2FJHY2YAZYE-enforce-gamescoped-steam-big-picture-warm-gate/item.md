---
id: 01KVMD7VX7SYJ4W2FJHY2YAZYE
slug: enforce-gamescoped-steam-big-picture-warm-gate-for-steam-app
title: Enforce gamescoped Steam Big Picture warm gate for Steam AppID launches
origin: parked
status: To Do
priority: high
labels:
  - steam
  - gamescope
  - bandai
  - launch-policy
created: 2026-06-21
source: user
---

# Enforce gamescoped Steam Big Picture warm gate for Steam AppID launches

## Why it matters

Current Steam AppID launch paths can resolve to direct `steam -applaunch` or `korri-steam-app` service/direct fallback flows that do not prove Steam Big Picture is already running inside gamescope before the game starts. This can regress the Bandai path that preserves Steam Input and avoids stuck/non-gamescoped Steam sessions.

## Acceptance Criteria

- [ ] All `@korri:steam` AppID launches route through a single gamescoped Steam-session launcher, not raw `steam -applaunch`.
- [ ] If Steam Big Picture is absent, launch starts Steam Big Picture inside gamescope first and waits for warm readiness.
- [ ] AppID launch is sent only after the gamescoped Steam process/window is confirmed ready.
- [ ] No fallback starts Steam outside gamescope or via a non-gamescoped system service.
- [ ] Tests cover default readable Steam launches, `korri-steam-app` wrapper behavior, and Nix module generated scripts/units.

## Related

- `product/plugins/steam/src/plugin.ts`
- `product/plugins/steam/src/materializer.ts`
- `product/plugins/steam/src/launch-spec.ts`
- `product/plugins/steam/nix/nixos-module.nix`
- `product/plugins/gamescope/src/launch-companion/wrapper.ts`

## Notes

Validation after manual Bandai proof found live dry-run for flinthook resolves to `/run/current-system/sw/bin/korri-steam-app 401710`; current module has direct/system-service fallback and default materializer tests still assert `steam -applaunch`.
