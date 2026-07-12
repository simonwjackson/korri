---
id: 01KX9PC5N6A7XXY1GHFY5PGC6S
slug: fan-control-module
title: Systemic NixOS fan-control module with per-device curves
status: in-progress
created: 2026-07-11
graduated: 2026-07-12
origin: parking-lot
source: user
labels: [thermal, fan-control, sm8550, nixos]
---

# Systemic NixOS fan-control module with per-device curves

Graduated from parking lot for planning. See item.md for the original capture and
plan.md for the implementation plan.

## Progress

- U1+U2 (module) and U3 (checks) landed on trunk: `204f43bd`, `3b3ce651`.
  Module check, identity audit, and SM8550 kiosk config check all green.
- U4 (SM8550 enablement) and U5 (device validation) pending: Bandai was
  unreachable when execution reached them. U5 must record here: fan hwmon
  `name`, temp source identity (thermal zone `type` or fan-hwmon channel),
  tach presence, sysfs write-posture ladder result, suspend/resume
  `pwm_enable` observation, and the confirmed idle floor.
