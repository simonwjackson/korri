---
id: 01KXA6XD911EDDGXEXY3C87D0C
slug: add-before-after-launch-hook-primitives-to-korri-readable-co
title: Add before/after launch hook primitives to Korri readable config
origin: parked
status: In Progress
priority: high
labels:
  - korri-config
  - launch
  - performance
  - hooks
created: 2026-07-12
source: user
---

# Add before/after launch hook primitives to Korri readable config

## Why it matters

Hand-tuning Wonder on Bandai required per-game clocks (672MHz/1171MHz/1248MHz CPU, 220MHz GPU), display mode pinning, fan profile, and a 30fps game mod — all applied manually over SSH and lost on reboot. A launch.hooks primitive (before/after, cascade-merged host->launcher->release, after-always-runs semantics) would let users author these device/game performance profiles declaratively. Proven value: ~3x battery life (8W -> 2.7W) and ~35C cooler on Wonder at a locked 30 FPS.

## Acceptance Criteria

- [ ] launch.hooks with before/after lists accepted at host, launcher, library-entry, and release levels of the readable config cascade.
- [ ] before hooks run outermost-first, after hooks run in reverse order and always run on crash/abort (try/finally semantics).
- [ ] on-failure: abort|warn supported on before hooks; after hooks never block teardown.
- [ ] Hooks receive KORRI_GAME_ID/KORRI_LAUNCH_ID/KORRI_HOOK_PHASE env.
- [ ] Reusable named hook profiles definable once and referenced via hooks.use.
- [ ] Hooks execute raw user-authored commands as the session user; no new helper binaries (korri-perf/korri-fan dropped by user decision 2026-07-12).

## Related

- `product/platform/library/config/fixtures/steam-full.korri.yaml`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
