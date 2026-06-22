---
id: 01KVR7DB574NNVX08FV2BZ989T
slug: make-rg353m-pipewire-default-sink-expose-effective-graph-vol
title: Make RG353M PipeWire default sink expose effective graph volume
origin: parked
status: To Do
priority: high
labels:
  - audio
  - rg353m
  - rk3566
  - deployment-follow-up
created: 2026-06-22
source: se-work
context:
  branch: feat/handheld-audio-baseline
  commit: 7e8eb8d7
  repo: korri
---

# Make RG353M PipeWire default sink expose effective graph volume

## Why it matters

Deployment showed the RK3566 module-alsa-sink reports 100% and ignores `pactl/wpctl set-volume`, while the hardware ALSA Master mixer can be set low manually. This fails the graph-level hardware-button volume contract even though the device can be made physically safe with `amixer`.

## Acceptance Criteria

- [ ] On RG353M, `pactl set-sink-volume @DEFAULT_SINK@ 1%` changes `pactl get-sink-volume @DEFAULT_SINK@` to 1%.
- [ ] Hardware volume buttons adjust the same effective sink volume visible to app audio.
- [ ] Boot leaves both the effective graph volume and any required ALSA backing mixer at safe low levels.

## Related

- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
