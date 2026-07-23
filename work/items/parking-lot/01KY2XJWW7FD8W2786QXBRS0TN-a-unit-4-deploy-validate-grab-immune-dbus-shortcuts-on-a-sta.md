---
id: 01KY2XJWW7FD8W2786QXBRS0TN
slug: a-unit-4-deploy-validate-grab-immune-dbus-shortcuts-on-a-sta
title: "A′ Unit 4: deploy + validate grab-immune DBus shortcuts on a stable SM8550"
origin: parked
status: To Do
priority: medium
labels:
  - input
  - inputplumber
  - fex
  - a-prime
  - deploy
created: 2026-07-21
source: se-debug
---

# A′ Unit 4: deploy + validate grab-immune DBus shortcuts on a stable SM8550

## Why it matters

A' code is committed and verified without deploy (inputd DBus shortcut source + ui_* mapping; InputPlumber routes shortcut buttons to a persistent dbus target; helper check confirms valid YAML). It takes effect only on a deployed generation. Deploy was deliberately deferred: it must be done on a stable device via a fresh generation (never live InputPlumber poking, which froze the daily driver earlier today), and the AYN device-specific mappings need on-device confirmation.

## Acceptance Criteria

- [ ] Deploy a fresh generation to Bandai (build on fuji, switch) when the device is stable
- [ ] Confirm InputPlumber comes up with dbus in TargetDevices and the merged Default profile loaded (no controller regression in the hub)
- [ ] With an x86/FEX game foreground, Home+L1/R1 returns to the GUI (the original bug), and spot-check other chords (Home+dpad workspace/output moves, kill chord L1+R1+Start+Select, Home+L3/R3)
- [ ] Verify no double-fire/double-tap (Home tap = system-panel once; back tap unaffected)
- [ ] If a specific chord does not route, tune the source->ui_ mapping in inputplumber-korri-dbus-shortcuts.yaml against the AYN ayn_mcu capability map
- [ ] Once validated, decide whether to keep the seccomp fix C as defense-in-depth or retire it (KORRI_STEAM_INPUT_GUARD_SECCOMP)

## Related

- `product/services/device/inputd-dbus-shortcut-source.ts`
- `product/systems/nixos/images/inputplumber-korri-dbus-shortcuts.yaml`
- `product/systems/nixos/images/inputplumber-platform-helpers.nix`
