---
id: 01KXBEBSEB8JB4K6AVMJB4VE4Z
slug: add-run-wrappers-bin-and-system-path-to-sessiond-hook-path
title: Add /run/wrappers/bin and system path to sessiond hook PATH
origin: parked
status: To Do
priority: medium
labels:
  - hooks
  - ergonomics
  - sessiond
  - nixos
created: 2026-07-12
source: user
---

# Add /run/wrappers/bin and system path to sessiond hook PATH

## Why it matters

Launch hooks inherit sessiond's systemd user-unit environment, whose PATH lacks /run/wrappers/bin (NixOS setuid sudo) and can miss /run/current-system/sw/bin, so every authored hook needs 'export PATH=...' boilerplate and swaymsg needs an explicit SWAYSOCK. First real deployment hit both (exit 127 sudo-not-found, swaymsg no-socket). The image (or the hook runner's env assembly in sessiond-launch-hooks.ts) should provide a sane baseline PATH, and consider SWAYSOCK, so hook YAML stays clean.

## Acceptance Criteria

- [ ] Hooks can call sudo and swaymsg without PATH/SWAYSOCK boilerplate on SM8550 images.
- [ ] Decision recorded whether the fix lives in the NixOS unit env or the hook runner env assembly.
- [ ] Existing hooks with explicit exports keep working.
- [ ] Authoring fixture/docs updated to drop the boilerplate.

## Related

- `product/services/device/sessiond-launch-hooks.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
