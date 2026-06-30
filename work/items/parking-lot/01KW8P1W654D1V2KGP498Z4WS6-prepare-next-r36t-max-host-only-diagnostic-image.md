---
id: 01KW8P1W654D1V2KGP498Z4WS6
slug: prepare-next-r36t-max-host-only-diagnostic-image
title: Prepare next R36T Max host-only diagnostic image
origin: parked
status: To Do
priority: high
labels:
  - r36tmax
  - nix-on-rocks
  - diagnostics
  - sd-card-only
  - korri
created: 2026-06-29
source: user
---

# Prepare next R36T Max host-only diagnostic image

## Why it matters

R36T Max boots custom nix-on-rocks images far enough for kernel SD-card detection, then visually stalls before SSH/Wi-Fi is reachable. The device also has a loud continuous buzz from power-on. Future work needs enough context to resume without re-discovering the Korri payload/image history or accidentally writing internal storage.

## Acceptance Criteria

- [ ] Build a new SD-card-only R36T Max diagnostic image that disables Korri guest startup by default while preserving host SSH/Wi-Fi/recovery services.
- [ ] Suppress or isolate the loud buzz source as much as possible, including testing a no-audio/no-speaker-amp host configuration if feasible.
- [ ] Keep verbose boot/status logging and write any reachable host diagnostics to /storage/nix-on-rock/diagnostics/ without printing Wi-Fi secrets.
- [ ] Write only to confirmed YUKI /dev/sdb after explicit user confirmation, then verify bytes, expand STORAGE, and preload Korri rootfs only if the image is intended to test guest handoff.
- [ ] Document whether the diagnostic folder exists after a failed boot and whether SSH becomes reachable.

## Related

- `nix-on-rocks branch work/rk3326-r36tmax-diagnostics commit 6069cea`
- `nix-on-rocks run 28303675042`
- `/tmp/nor-rk3326-r36tmax-diag-28303675042/work/rocknix/target/ROCKNIX-RK3326.aarch64-20260628-R36TMax.img.gz`
- `/tmp/korri-r36tmax-candidate/rootfs/rocknix-guest-rootfs-r36tmax-6a0823bb0898.tar.zst`
- `product-payload-r36tmax.lock`
- `guest-r36tmax.lock`
- `patches/rocknix/0023-rk3326-r36tmax-diagnostics.patch`

## Notes

State at handoff: A working Korri/NixOS product payload exists from Korri commit 6a0823bb089861d3db5371a58894da32df71ef21. nix-on-rocks main has R36T Max guest lane and r36tmax locks. Diagnostic image branch work/rk3326-r36tmax-diagnostics commit 6069cea added RK3326_R36TMAX_DIAGNOSTIC=yes support: verbose boot flags, module blacklist for rocknix_joypad/rocknix_singleadc_joypad names, and a host-side diagnostic snapshot service. GitHub Actions run 28303675042 was green; artifact was downloaded, verified, written to YUKI /dev/sdb after confirmation, byte-verified, STORAGE expanded to 48G, and Korri rootfs preloaded/extracted under /storage/nix-on-rock/rootfs/current with seed archive retained. On hardware, user reports same behavior as previous custom nix-on-rocks images: loud heavy buzz immediately from power-on; screen shows kernel/systemd text then stalls. User provided last visible lines: dwmmc_rockchip ff370000.mmc successfully tuned phase, mmc1 new ultra high speed SDR104 SDXC card, mmcblk1 50.0 GiB, p1 p2. Assistant probed previous IPs 192.168.1.119 and 192.168.1.134; no ping/SSH, neighbor table had stale/probing entries. This suggests boot reaches kernel SD detection but probably not host network/SSH. Because diagnostic image blacklisted likely host joypad/rumble modules yet symptom persisted, next likely suspects include earlier hardware line/default state or speaker/audio amp, not userspace force-feedback. Safety constraints: R36T Max must stay SD-card-only; never write internal/eMMC; do not write SD cards without explicit target confirmation; correct SD target has been YUKI /dev/sdb removable USB MassStorageClass 50G. Avoid printing Wi-Fi secrets. On this NixOS environment avoid fd; use find/grep.
