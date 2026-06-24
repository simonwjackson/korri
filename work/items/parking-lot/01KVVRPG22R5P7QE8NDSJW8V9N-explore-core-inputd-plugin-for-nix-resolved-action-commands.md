---
id: 01KVVRPG22R5P7QE8NDSJW8V9N
slug: explore-core-inputd-plugin-for-nix-resolved-action-commands
title: Explore core inputd plugin for Nix-resolved action commands
origin: parked
status: To Do
priority: medium
labels:
  - inputd
  - plugin-system
  - nixos
  - device-controls
  - sobo
created: 2026-06-24
source: user
---

# Explore core inputd plugin for Nix-resolved action commands

## Why it matters

Inputd currently relies on service PATH and ad-hoc platform overrides for actions like brightness, volume, workspace switching, and system-panel launch. This caused Sobo brightness chords to fail despite brightnessctl being installed, because inputd's PATH omitted the tool. A core always-included plugin could declare inputd/device-control semantics while the Nix materializer injects exact store-path commands, making kiosk controls reproducible across redeploys and devices.

## Acceptance Criteria

- [ ] Define the intended plugin-system shape for an always-included/core inputd or device-controls plugin.
- [ ] Decide which action defaults are owned by the core plugin versus platform profiles: brightness, volume, system panel, screen switch, workspace/output moves, bottom keyboard, power/lid.
- [ ] Prototype or document Nix materialization that resolves command dependencies to store paths instead of relying on inputd.service PATH.
- [ ] Preserve device/platform overrides for Sobo/RG-specific commands and power policy.
- [ ] Add tests or module checks proving brightness commands reference ${pkgs.brightnessctl}/bin/brightnessctl and required packages are in the closure.

## Related

- `product/services/device/inputd.ts`
- `product/services/device/inputd-actions.ts`
- `product/systems/nixos/modules/korri-input.nix`
- `product/systems/nixos/images/kiosk.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
