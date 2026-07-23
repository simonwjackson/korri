---
id: 01KY6MK6M295A58KJA714XYTME
slug: fix-silently-broken-host-gpu-cpu-floor-hook-missing-path-bre
title: Fix silently-broken host gpu-cpu-floor hook (missing PATH breaks mount/tee)
origin: parked
status: To Do
priority: medium
labels:
  - hooks
  - power
  - bandai
  - config
created: 2026-07-23
source: se-debug
---

# Fix silently-broken host gpu-cpu-floor hook (missing PATH breaks mount/tee)

## Why it matters

The deployed host-level hook `gpu-cpu-floor` in the bandai korri.yaml runs its sysfs writes via `systemd-run --user ... /bin/sh -c 'sudo -n mount ...; sudo -n tee ...'` WITHOUT setting PATH or using absolute paths. Inside the systemd --user transient unit the PATH is minimal, so `sudo` reports `mount: command not found` and `tee: command not found` and the unit exits 1. Because the hook is `on-failure: warn`, korrid only warns and continues — so the intended global battery floor (CPU 307/499/595MHz, GPU 220MHz) has NEVER been applied, and every game without its own hook runs at full clocks. Confirmed on-device: the identical command fails with 'command not found', while the same command with absolute paths (/run/wrappers/bin/sudo, /run/current-system/sw/bin/tee) and no /sys remount succeeds. Fix: use absolute sudo/tee paths (and drop the unnecessary /sys remount, since sysfs attrs are writable directly) exactly like the new MGS5 release hook. Note the floor values are aggressive; revisit whether that global floor is still desired once it actually applies.

## Acceptance Criteria

- [ ] Host gpu-cpu-floor hook applies its CPU/GPU caps on a real korrid launch (verified via scaling_max_freq/devfreq max_freq)
- [ ] No 'command not found' from sudo in the transient unit
- [ ] Decision recorded on whether the 307/499/595/220 global floor values are still wanted now that the hook works

## Related

- `/var/lib/korri/config/korri.yaml`
- `product/platform/library/config/fixtures/hooks.korri.yaml`
