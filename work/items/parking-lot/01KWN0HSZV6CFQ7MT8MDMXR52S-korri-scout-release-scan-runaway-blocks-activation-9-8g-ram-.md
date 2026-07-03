---
id: 01KWN0HSZV6CFQ7MT8MDMXR52S
slug: korri-scout-release-scan-runaway-blocks-activation-9-8g-ram-
title: korri-scout-release-scan runaway blocks activation (9.8G RAM / 44min CPU / 172GB reads)
origin: parked
status: To Do
priority: high
labels:
  - korri
  - scout
  - systemd
  - deploy
  - regression
  - sm8550
created: 2026-07-03
source: se-work
---

# korri-scout-release-scan runaway blocks activation (9.8G RAM / 44min CPU / 172GB reads)

## Why it matters

Deploying current trunk to Bandai surfaced a severe regression in the new korri-scout-release-scan.service: on activation it runs `korri scout scan configured` which consumed 9.8 GB peak memory, 44 min CPU, and 172.7 GB of disk reads on one run, and stays in 'activating (start)' for minutes. Because switch-to-configuration waits on its start job, it BLOCKS the entire nixos activation (the deploy hung; had to stop the scan to let the switch finish). On a 6 GiB-constrained SM8550 guest this risks OOM and makes every deploy/boot pathological. It is currently left stopped/failed and effectively un-maskable (nix-managed symlink). Needs: bound the scan (timeout, nice/ionice, memory cap), make it non-blocking for activation (Type=oneshot RemainAfterExit + not ordered before the graphical target, or Wants not After), and investigate why it reads 172 GB / uses 9.8 GB.

## Acceptance Criteria

- [ ] korri-scout-release-scan does not block nixos-rebuild switch (activation completes without waiting on the scan)
- [ ] The scan is resource-bounded (memory cap + ionice) and cannot OOM a 6 GiB guest
- [ ] Root-cause the 172 GB read / 9.8 GB memory (likely re-scanning full storage or a loop)
- [ ] A deploy to Bandai/Sobo completes cleanly end-to-end
