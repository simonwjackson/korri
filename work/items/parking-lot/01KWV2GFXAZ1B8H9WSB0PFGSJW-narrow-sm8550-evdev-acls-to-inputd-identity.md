---
id: 01KWV2GFXAZ1B8H9WSB0PFGSJW
slug: narrow-sm8550-evdev-acls-to-inputd-identity
title: Narrow SM8550 evdev ACLs to inputd identity
origin: parked
status: To Do
priority: medium
labels:
  - security
  - device
  - sm8550
  - follow-up
created: 2026-07-06
source: se-work
context:
  cwd: .
  branch: refactor/guest-owned-fake-suspend
  repo: korri
---

# Narrow SM8550 evdev ACLs to inputd identity

## Why it matters

The fake-suspend plan highlighted that broad runtime-user access to /dev/input/event* lets ordinary runtime/game processes read power/lid events. The current SM8550 posture still grants ACLs to the Korri runtime user because inputd runs as that user, so least-privilege input access needs a dedicated service identity or input group design rather than being folded into the fake-suspend controller slice.

## Acceptance Criteria

- [ ] SM8550 device access grants required power/lid event nodes only to inputd or a dedicated input group
- [ ] Config checks fail if broad runtime-user evdev ACLs are present without a reviewed exception
- [ ] Inputd still receives KEY_POWER and SW_LID on Bandai after the access change

## Related

- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `work/items/active/01KX0B4ND41F4K3SUSP3ND000-refactor-guest-owned-fake-suspend/plan.md`
