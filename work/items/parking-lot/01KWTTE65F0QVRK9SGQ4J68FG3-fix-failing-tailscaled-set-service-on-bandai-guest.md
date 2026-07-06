---
id: 01KWTTE65F0QVRK9SGQ4J68FG3
slug: fix-failing-tailscaled-set-service-on-bandai-guest
title: Fix failing tailscaled-set.service on bandai guest
origin: parked
status: To Do
priority: low
labels:
  - nixos
  - tailscale
  - sm8550
created: 2026-07-06
source: user
---

# Fix failing tailscaled-set.service on bandai guest

## Why it matters

tailscaled-set.service exits 2/INVALIDARGUMENT on every switch/boot on the SM8550 guest (pre-existing; observed 2026-07-05 before and after an unrelated deploy). Tailscale connectivity works, but a permanently failed unit masks real failures and suggests services.tailscale.extraSetFlags ("--netfilter-mode=off") is not accepted by `tailscale set` on this build.

## Acceptance Criteria

- [ ] systemctl --failed on bandai guest shows no tailscaled-set.service failure after a switch
- [ ] netfilter-mode intent from the sm8550 adapter is still honored (or the bridge comment updated)

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
