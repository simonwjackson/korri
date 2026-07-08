---
id: 01KWZFHQ6TC7JEQMEK6EZJ69B6
slug: fix-bandai-switch-activation-hanging-on-scout-release-scan
title: Fix Bandai switch activation hanging on scout release scan
origin: parked
status: To Do
priority: medium
labels:
  - bandai
  - deployment
  - nixos
created: 2026-07-07
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/fix/steam-appid-exclusive-gamescope-lifecycle
  branch: fix/steam-appid-exclusive-gamescope-lifecycle
  repo: korri
---

# Fix Bandai switch activation hanging on scout release scan

## Why it matters

Repeated NixOS activations waited indefinitely on korri-scout-release-scan.service, leaving stale switch-to-configuration processes that reverted the device back to an older generation and made deployment verification unreliable.

## Acceptance Criteria

- [ ] nixos-rebuild switch completes without manual systemctl intervention on Bandai
- [ ] No lingering nixos-rebuild-switch-to-configuration*.service jobs remain after switch
- [ ] /run/current-system and /nix/var/nix/profiles/system agree after deployment

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `korri-scout-release-scan.service`
