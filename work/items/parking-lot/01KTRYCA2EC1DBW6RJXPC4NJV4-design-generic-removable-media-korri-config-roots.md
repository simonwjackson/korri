---
id: 01KTRYCA2EC1DBW6RJXPC4NJV4
slug: design-generic-removable-media-korri-config-roots
title: Design generic removable-media Korri config roots
origin: parked
status: To Do
priority: medium
labels:
  - config
  - removable-media
  - nixos
  - follow-up
created: 2026-06-10
source: se-challenge-plan
---

# Design generic removable-media Korri config roots

## Why it matters

Korri config should not be tied to SM8550 SD-card paths; future devices need USB drives and other removable media to expose config fragments through a shared, device-neutral convention without UUID/label assumptions.

## Acceptance Criteria

- [ ] Define a device-neutral removable media exposure contract under Korri-owned paths.
- [ ] Support multiple removable devices and media types, including USB drives and SD cards.
- [ ] Document how mounted media contributes Korri config roots without device-specific hardcoding.
- [ ] Add Nix/module checks for at least one non-SM8550 provider shape or a generic provider interface.
- [ ] Validate hotplug add/remove behavior and config event broadcasts on a real device or representative VM.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/modules`
