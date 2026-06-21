---
id: 01KVHFVV6JRH4VVJPFKMZ26ZV2
slug: explore-moving-fex-and-proton-runtime-defaults-out-of-steam-
title: Explore moving FEX and Proton runtime defaults out of Steam state
origin: parked
status: To Do
priority: medium
labels:
  - fex
  - proton
  - steam
  - runtime-substrate
  - follow-up
created: 2026-06-20
source: se-challenge-plan
---

# Explore moving FEX and Proton runtime defaults out of Steam state

## Why it matters

The source-of-truth cleanup keeps current Bandai paths unchanged for safety, but generic FEX/Proton substrate paths living under `/var/lib/korri/steam` keeps a conceptual coupling to Steam. Exploring a Steam-independent location would clarify long-term ownership and reduce future drift.

## Acceptance Criteria

- [ ] Identify whether FEX rootfs and Proton runtime defaults can move out of `/var/lib/korri/steam` without breaking Steam AppID launches or non-Steam FEX/Proton consumers.
- [ ] Document required NixOS provisioning changes and migration/rollback considerations.
- [ ] Define validation gates for Steam AppID and Mega Man Arena after any path move.

## Related

- `work/items/active/01KVHEQDFEZE6SSFDV7Z5PA18B-fex-substrate-source-of-truth/plan.md`
- `product/plugins/fex-runtime`
- `product/plugins/proton-runtime`
- `product/plugins/steam`
