---
id: 01KWX5FYS5CB4S2ZQBABSCWBEA
slug: diagnose-sm8550-gamescope-aborts-during-steam-appid-launches
title: Diagnose SM8550 Gamescope aborts during Steam AppID launches
origin: parked
status: To Do
priority: high
labels:
  - steam
  - sm8550
  - gamescope
  - observability
created: 2026-07-07
source: se-debug
---

# Diagnose SM8550 Gamescope aborts during Steam AppID launches

## Why it matters

Downwell reached the Windows/Cachy Proton process chain but was killed when the enclosing korri-steam-gamescope.service aborted with status 134. If this Gamescope abort pattern is not isolated, otherwise-working Steam titles can look like game-specific Proton regressions and systemd restarts can lose foreground state.

## Acceptance Criteria

- [ ] A read-only verifier summarizes Gamescope/service exits around a Steam AppID launch and distinguishes game exit from compositor abort.
- [ ] The 19:29 Downwell sequence is documented as Gamescope status=134 killing child Wine/FEX processes, not a Downwell Proton failure.
- [ ] A follow-up fix or mitigation prevents repeated Gamescope abort/restart loops during SM8550 Steam launches, or gates launches with a clear operational error.

## Related

- `product/plugins/steam/nix/nixos-module.nix`
- `tools/testing/steam/observe-bandai-steam-runtime.ts`
- `work/items/active/01K01KW51RPBVMTEAXE6R6NJW9-steam-self-managed-lifecycle/plan.md`

## Notes

Evidence: journal around 2026-07-06 19:29:46 shows gamescope Aborted, korri-steam-gamescope.service status=134, gamescopereaper killing children, and systemd SIGKILLing winedevice.exe after Downwell launched through proton-cachyos.
