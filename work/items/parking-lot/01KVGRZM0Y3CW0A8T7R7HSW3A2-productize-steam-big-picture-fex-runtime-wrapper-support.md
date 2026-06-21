---
id: 01KVGRZM0Y3CW0A8T7R7HSW3A2
slug: productize-steam-big-picture-fex-runtime-wrapper-support
title: Productize Steam Big Picture FEX runtime wrapper support
origin: parked
status: To Do
priority: high
labels:
  - steam
  - sm8550
  - runtime
  - fex
  - gamescope
created: 2026-06-19
source: se-work
---

# Productize Steam Big Picture FEX runtime wrapper support

## Why it matters

Flinthook debugging proved the Steam-owned launch path needs durable FHS-visible FEX support, runtime wrapper repair beyond Sniper, and predictable compat-tool selection; today those were patched temporarily on Bandai.

## Acceptance Criteria

- [ ] Steam Big Picture/Gamepad UI can launch x86 Steam apps through Steam on SM8550 without manual /usr/bin/FEX or pressure-vessel edits.
- [ ] Runtime prep repairs Sniper/Soldier/Scout pressure-vessel helpers or provides equivalent binfmt/FEX support.
- [ ] Korrid/Steam plugin can select appropriate compat policy (native vs Proton) without per-device config hacks.
- [ ] Regression check verifies 30XX still launches and Flinthook reaches at least the same SteamLaunch process state.

## Related

- `product/systems/nixos/modules/korri-steam.nix`
- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`

## Notes

Temporary Bandai changes included /usr/bin/FEX shim, binfmt_misc FEX registrations, Flinthook compat mapping toggles, and manual pressure-vessel wrapper patches for Sniper/Soldier.
