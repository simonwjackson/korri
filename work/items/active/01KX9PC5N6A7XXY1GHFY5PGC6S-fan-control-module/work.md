---
id: 01KX9PC5N6A7XXY1GHFY5PGC6S
slug: fan-control-module
title: Systemic NixOS fan-control module with per-device curves
status: completed
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
- U4+U5 landed: `18be8e35` (namespace-scoped sysfs remount), `d0e5804d`
  (SM8550 enablement + config-check lock). Deployed and validated live on
  Bandai 2026-07-12.

## U5 hardware facts (Thor/Bandai)

- Fan hwmon `name`: `pwmfan` (unique; was hwmon40 that boot). Attrs: `pwm1`,
  `pwm1_enable`, `fan1_input` (tach present). No temp channel on the fan
  hwmon.
- Temp source: thermal zone `type = cpu7-top-thermal` (prime core; unique).
- Sysfs write posture: guest mounts `/sys` read-only at the mount level
  (`sysfs /sys sysfs ro`). Ladder landed on the in-unit best-effort
  `mount -o remount,rw /sys`, scoped by the unit sandbox's private mount
  namespace — verified the global `/sys` stays `ro` while the service writes.
- `pwm1_enable` accepts mode `2` (automatic): explicit stop leaves the kernel
  owning the fan.
- Crash semantics verified: `kill -9` → ExecStopPost restored `pwm_enable=2`,
  `Restart=on-failure` re-entered manual mode within seconds.
- Curve sweep verified with 8-core synthetic load: idle 39C → pwm 69
  (27% floor = stock quiet); 85.6–86.8C → pwm 255 at ~7,300 RPM; cooldown
  tracked back down (50.6C → 143, 46.7C → 128). The stock bug (90C at
  pwm 70) no longer reproduces.
- Suspend/resume `pwm_enable` interference: not observed in a dedicated test;
  the per-iteration re-assertion makes any reset self-healing within one
  5s poll regardless.
