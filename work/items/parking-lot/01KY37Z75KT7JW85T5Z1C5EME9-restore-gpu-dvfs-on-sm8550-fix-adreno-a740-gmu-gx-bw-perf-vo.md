---
id: 01KY37Z75KT7JW85T5Z1C5EME9
slug: restore-gpu-dvfs-on-sm8550-fix-adreno-a740-gmu-gx-bw-perf-vo
title: "Restore GPU DVFS on SM8550: fix Adreno A740 GMU GX_BW_PERF_VOTE stall (kernel/firmware)"
origin: parked
status: To Do
priority: medium
labels:
  - sm8550
  - gpu
  - adreno
  - gmu
  - kernel
  - dvfs
  - device-stability
created: 2026-07-21
source: se-debug
context:
  branch: trunk
  commit: 58d8d2af
  repo: korri
---

# Restore GPU DVFS on SM8550: fix Adreno A740 GMU GX_BW_PERF_VOTE stall (kernel/firmware)

## Why it matters

The GPU is currently pinned to `performance` (commit 58d8d2af) as an interim fix because load-following (`simple_ondemand`) intermittently stalls the Adreno A740 GMU and freezes the display. The user's real goal is "use only as much GPU as each state needs" WITHOUT ever capping peak (must reach 680MHz) — that is dynamic DVFS, which only works once the GMU vote stall is fixed at the driver/firmware level. Until then the device wastes power at 680MHz while actively rendering light UI. This is the path back to the desired feature.

## Acceptance Criteria

- [ ] Root mechanism: simple_ondemand per-frame freq/bandwidth votes go through the A740 GMU as HFI_H2F_MSG_GX_BW_PERF_VOTE (the new ADRENO_QUIRK_GMU_BW_VOTE feature); one intermittently times out -> a6xx_gmu_set_oob GPU_SET timeout -> a6xx_irq gpu fault -> hangcheck recover -> display freeze. Reproduces on game launch (low->high ramp).
- [ ] Device: kernel Linux 7.0.2 (ROCKNIX, built 2026-07-06), GMU firmware v4.1.9 (gmu_gen70200.bin). DT already has GPU interconnects + opp-table.
- [ ] Candidate fix A (leading): locate the ROCKNIX SM8550 kernel source; try dropping ADRENO_QUIRK_GMU_BW_VOTE from the A740 entry in drivers/gpu/drm/msm/adreno/a6xx_catalog.c so bandwidth voting falls back to the interconnect/OPP path while frequency DVFS keeps working; build + deploy + soak.
- [ ] Candidate fix B: backport drm/msm/a6xx 'Vastly increase HFI timeout to 1s' if 7.0.2 predates it.
- [ ] Candidate fix C: backport 'vote a reasonable bus quota before starting GMU init'; and check for a GMU firmware newer than v4.1.9.
- [ ] Validation: set GPU governor back to simple_ondemand, launch a demanding game and soak (multiple launches + gameplay), watch dmesg for zero gmu_set_oob / GX_BW_PERF_VOTE timeouts across a meaningful window; confirm 680MHz still reached under load.
- [ ] On success: revert the performance pin in rocknix-sm8550.nix + the config-check assertion back to simple_ondemand.
- [ ] Separate minor bug: a740_sqe.fw fails first-load with -2 then loads from fallback path (firmware packaging/path); fix so it loads on first attempt.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/modules/korri-clock-governor.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
