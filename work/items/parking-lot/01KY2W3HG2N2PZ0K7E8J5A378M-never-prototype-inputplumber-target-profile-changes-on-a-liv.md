---
id: 01KY2W3HG2N2PZ0K7E8J5A378M
slug: never-prototype-inputplumber-target-profile-changes-on-a-liv
title: Never prototype InputPlumber target/profile changes on a live daily-driver session
origin: parked
status: To Do
priority: medium
labels:
  - input
  - inputplumber
  - process
  - safety
created: 2026-07-21
source: se-debug
---

# Never prototype InputPlumber target/profile changes on a live daily-driver session

## Why it matters

Manipulating InputPlumber live (SetTargetDevices/LoadProfilePath) and especially restarting inputplumber.service tears down and recreates the virtual controller under a running session. korri-inputd loses the pad, fails to re-resolve it (normalized gamepad unavailable), and the UI freezes — requiring a hard reboot. On-device validation of InputPlumber/inputd changes (e.g. the A' DBus-shortcut design) must go through a deployed NixOS generation (clean boot ordering) or a spare device, not live DBus poking + service restart on the device in use.

## Acceptance Criteria

- [ ] A' (and any InputPlumber routing change) is validated via a deployed config generation, not runtime DBus manipulation on the daily driver
- [ ] Any live InputPlumber experiment is gated to a non-critical device/session

## Related

- `product/services/device/inputd.ts`
- `product/systems/nixos/modules/korri-input.nix`
