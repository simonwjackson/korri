---
id: 01KVR263SJBX9A7MGT6GGN9RG6
slug: promote-sobo-wireplumber-default-sink-into-an-explicit-audio
title: Promote Sobo WirePlumber default sink into an explicit audio route contract
origin: parked
status: To Do
priority: medium
labels:
  - audio
  - sm8550
  - follow-up
created: 2026-06-22
source: se-work
context:
  cwd: .worktrees/feat/handheld-audio-baseline
  branch: feat/handheld-audio-baseline
  repo: korri
---

# Promote Sobo WirePlumber default sink into an explicit audio route contract

## Why it matters

The handheld audio baseline intentionally lets no-route SM8550 profiles clamp WirePlumber's non-null default sink so Sobo can keep the validated no-ALSA-device path. A review swarm flagged that this still accepts any non-null auto-selected sink; making Sobo's validated sink identity explicit would tighten the safety gate without reintroducing app-level ALSA hardware overrides.

## Acceptance Criteria

- [ ] Sobo/SM8550 substrate or platform config exposes a validated non-hardware PipeWire/Pulse sink identity or equivalent route proof.
- [ ] The SM8550 audio bootstrap can reject arbitrary non-null defaults when a validated route is required.
- [ ] Nix checks distinguish validated WirePlumber-owned routes from temporary/unvalidated defaults.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `work/items/active/01KVQVJZN0M1GDWH0B18DKMMF3-handheld-audio-baseline/plan.md`
