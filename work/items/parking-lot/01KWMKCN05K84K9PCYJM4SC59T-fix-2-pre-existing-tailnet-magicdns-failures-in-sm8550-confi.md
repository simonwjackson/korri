---
id: 01KWMKCN05K84K9PCYJM4SC59T
slug: fix-2-pre-existing-tailnet-magicdns-failures-in-sm8550-confi
title: Fix 2 pre-existing tailnet MagicDNS failures in SM8550 config-check
origin: parked
status: To Do
priority: low
labels:
  - korri
  - nix-on-rocks
  - tailnet
  - testing
created: 2026-07-03
source: se-plan
---

# Fix 2 pre-existing tailnet MagicDNS failures in SM8550 config-check

## Why it matters

The korri-rocknix-sm8550-config-check has two pre-existing tailnet MagicDNS assertion failures on trunk, unrelated to display. They block the SM8550 check from running fully green, which weakens the check as a merge gate. Fixing them lets the check be trusted end-to-end.

## Acceptance Criteria

- [ ] korri-rocknix-sm8550-config-check passes its tailnet MagicDNS assertions for both Thor and Odin systems
- [ ] just test-nix runs the SM8550 check fully green

## Related

- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `work/items/active/01KWMEQA5G7MV3RQWD0T16SV88-retire-swaydeviceconfig-neutral-display/plan.md`
