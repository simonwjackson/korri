---
id: task-007
title: Define inline RetroArch input defaults in cascade
status: To Do
priority: high
labels:
  - bandai
  - retroarch
  - cascade
  - inputplumber
created: 2026-06-10
source: user
---

# Define inline RetroArch input defaults in cascade

## Why it matters

Bandai needs RetroArch controls to work out of the box when InputPlumber provides a normalized virtual controller, and the user prefers app-local YAML fields rather than a top-level controls key or an external autoconfig directory. Encoding explicit RetroArch input defaults in the app policy keeps the cascade readable and device defaults portable.

## Acceptance Criteria

- [ ] RetroArch app policy in the cascade can define player-1 normalized Xbox-style bindings directly through typed input fields and/or `extraSettings`.
- [ ] SM8550/Bandai platform defaults or catalog generation emits inline RetroArch input config for the normalized InputPlumber virtual controller without live `/var/lib/korri` edits.
- [ ] A focused check proves generated `retroarch.cfg` contains `input_joypad_driver = "udev"`, player-1 joypad index/device settings, D-pad/button/axis binds, and preserved aspect defaults.
- [ ] Physical Bandai verification confirms Yoshi responds to D-pad/buttons after rebuild/relaunch without manual RetroArch setup.

## Related

- `/var/lib/korri/library/library.yaml`
- `product/platform/stream/retroarch-launch-spec.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `korri-catalog-display-metadata.example.yaml`

## Notes

Live Bandai mitigation on 2026-06-09 rewrote `/var/lib/korri/library/library.yaml` to include inline RetroArch input defaults under `apps.retroarch`: `drivers.input/joypad: udev`, player-1 ports, and `extraSettings` for Xbox-style D-pad/buttons/axes.
