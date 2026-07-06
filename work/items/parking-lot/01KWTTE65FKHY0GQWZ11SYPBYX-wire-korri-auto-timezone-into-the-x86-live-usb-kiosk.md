---
id: 01KWTTE65FKHY0GQWZ11SYPBYX
slug: wire-korri-auto-timezone-into-the-x86-live-usb-kiosk
title: Wire korri-auto-timezone into the x86 live-USB kiosk
origin: parked
status: To Do
priority: low
labels:
  - nixos
  - timezone
  - live-usb
created: 2026-07-06
source: user
---

# Wire korri-auto-timezone into the x86 live-USB kiosk

## Why it matters

The auto-timezone product policy (commit b8bde995) covers the three ROCKNIX guest platforms but not the x86 live-USB kiosk composition, which still defaults to UTC. Korri's stated policy is that appliances derive local time automatically; the live USB is a portable appliance too.

## Acceptance Criteria

- [ ] x86 live-USB kiosk composition imports product/systems/nixos/modules/korri-auto-timezone.nix (or equivalent)
- [ ] live-usb config-check/nix checks stay green

## Related

- `product/systems/nixos/modules/korri-auto-timezone.nix`
- `product/systems/nixos/images/platforms/x86.nix`
