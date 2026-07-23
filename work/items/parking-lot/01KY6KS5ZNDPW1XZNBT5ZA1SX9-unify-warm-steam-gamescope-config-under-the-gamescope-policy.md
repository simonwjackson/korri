---
id: 01KY6KS5ZNDPW1XZNBT5ZA1SX9
slug: unify-warm-steam-gamescope-config-under-the-gamescope-policy
title: Unify warm-Steam gamescope config under the gamescope policy cascade
origin: parked
status: To Do
priority: medium
labels:
  - gamescope
  - steam
  - config-cascade
  - architecture
created: 2026-07-23
source: user
---

# Unify warm-Steam gamescope config under the gamescope policy cascade

## Why it matters

The warm Steam service (product/plugins/steam/nix/nixos-module.nix) builds its gamescope invocation from nix cfg.gamescope* mkOptions baked at build time, while the launch-companion GamescopePolicy (product/plugins/gamescope/src/launch-companion/policy.ts) is a rich YAML-cascadable schema (output/scaling/cursor/input/scheduling/stats.path/steam.mangoapp/hdr) consumed only by per-launch companions in the portal (Moonlight, library launches). Because MGS5 and every Steam game run INSIDE the persistent warm-Steam gamescope (AppIDs are forwarded into it), the YAML gamescope cascade never reaches the compositor that actually renders Steam games. That means settings like mangoapp, stats, scaling, framerate-limit, HDR authored in YAML silently do not apply to Steam. It also forces one-off nix options (and tempts ad-hoc env toggles like KORRI_STEAM_MANGOAPP) instead of a single source of truth. Unifying so the warm-Steam service sources the GamescopePolicy cascade would let one YAML policy govern both per-launch and warm-Steam gamescope uniformly.

## Acceptance Criteria

- [ ] Warm-Steam gamescope args are derived from the GamescopePolicy cascade (YAML) rather than nix-only cfg.gamescope* options
- [ ] steam.mangoapp / stats.path / scaling / framerateLimit set in YAML take effect for a Steam game running in the warm-Steam gamescope
- [ ] No separate ad-hoc env toggle is needed to enable mangoapp for Steam
- [ ] A single documented precedence order governs both per-launch companions and the warm-Steam service

## Related

- `product/plugins/steam/nix/nixos-module.nix`
- `product/plugins/gamescope/src/launch-companion/policy.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
