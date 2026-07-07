---
id: 01KWXM1GXMGFJAYGF6Z39FJS6M
slug: fix-adaptive-shed-stopping-after-resolution-only-rescue
title: Fix adaptive shed stopping after resolution-only rescue
origin: parked
status: In Progress
priority: high
labels:
  - stream-control
  - adaptive
  - validation-regression
created: 2026-07-07
source: live-validation
---

# Fix adaptive shed stopping after resolution-only rescue

## Why it matters

Live Skate 3 validation showed startup-low/high-ceiling launch works, but under 6mbit/55ms/2% shaping auto rescue only applied 640x360 while bitrate/FPS stayed at 28409 kbps/120 fps. Manual `korri stream bitrate 500` and `fps 30` worked immediately, so the control path was reachable and the adaptive state/decision path likely stopped early or believed bitrate/FPS were already applied.

## Acceptance Criteria

- [ ] Reproduce with high-ceiling launch `bitrate=500k..6m..40m fps=30..120 resolution=640x360..1920x1080` followed by aka shaping `6mbit delay 55ms 15ms loss 2%`.
- [ ] Adaptive rescue dispatches and readback confirms bitrate floor, FPS floor, and resolution floor, not resolution-only.
- [ ] Adaptive state/lastEvent explains any pending/failed command instead of reporting dormant within-hysteresis while readback remains above floor.
- [ ] Manual intervention is not required to reach `500 kbps / 30 fps / 640x360` under the shaped link.

## Related

- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/stream-adaptive-controller.ts`
- `product/platform/stream/stream-session.ts`
- `docs/korri-stream-adaptive-validation-runbook.md`

## Notes

Observed 2026-07-07 on Bandai generation /nix/store/nacjq7pd8cbxw0363a6sg4agqd0zkdhv-nixos-system-bandai-25.11pre-git. Startup: 1920x1080/120 at ~6183 kbps, ramped to 28409 kbps on healthy link. Under shaping: RTT initially 5-12s, auto eventually applied 640x360 but kept 28409 kbps/120fps and adaptive lastEvent became dormant within-hysteresis. Manual bitrate/fps commands then applied immediately.
