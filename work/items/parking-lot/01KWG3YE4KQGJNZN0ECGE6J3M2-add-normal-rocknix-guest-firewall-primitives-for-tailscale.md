---
id: 01KWG3YE4KQGJNZN0ECGE6J3M2
slug: add-normal-rocknix-guest-firewall-primitives-for-tailscale
title: Add normal ROCKNIX guest firewall primitives for Tailscale
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - rocknix
  - tailscale
  - follow-up
created: 2026-07-02
source: se-work
---

# Add normal ROCKNIX guest firewall primitives for Tailscale

## Why it matters

SM8550 Korri images currently need a temporary `--netfilter-mode=off` bridge because the ROCKNIX guest substrate lacks the MARK/netfilter compatibility pieces Tailscale expects for standard firewall mode. Without a tracked removal path, that weaker firewall posture can become permanent.

## Acceptance Criteria

- [ ] ROCKNIX guest kernel/module substrate exposes the required MARK/iptables/nft compatibility support for standard Tailscale firewall mode.
- [ ] Bandai-like SM8550 guests can run Tailscale without `--netfilter-mode=off` or router/firewall health warnings caused by missing MARK support.
- [ ] Korri SM8550 adapter removes the temporary netfilter bridge and its compensating comments/checks.

## Related

- `work/items/active/20260701193500-korri-owned-tailnet-policy/plan.md`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `../nix-on-rocks/guest/modules/network.nix`
