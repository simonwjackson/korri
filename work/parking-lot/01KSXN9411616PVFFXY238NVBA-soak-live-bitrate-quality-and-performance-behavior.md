---
id: 01KSXN9411616PVFFXY238NVBA
slug: soak-live-bitrate-quality-and-performance-behavior
title: Soak live bitrate quality and performance behavior
origin: parked
legacy: task-063
status: To Do
priority: medium
labels:
  - performance
  - soak
  - hardware
  - runtime-settings
  - moonlight
  - sunshine
created: 2026-05-31
source: user
context:
---

# Soak live bitrate quality and performance behavior

## Why it matters

Single up/down changes proved feasibility; repeated realistic use needs confidence that latency, 120fps pacing, input, and encoder stability do not degrade over time.

## Acceptance Criteria

- [ ] Measure bandwidth before/after multiple sequential bitrate changes, including high, low, restore-to-baseline, and repeated up/down cycles.
- [ ] Capture moving-video evidence after each change and confirm no frozen frames or visible stalls.
- [ ] Confirm 120 FPS pacing remains intact and existing live FPS changes still work after bitrate changes.
- [ ] Measure or observe latency/frametime/input responsiveness during bitrate changes under real gameplay.
- [ ] Run a long-lived stream with several legal-cadence bitrate changes and confirm no accumulated encoder instability or log error growth.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `tools/cli/moonlight-runtime-watch.ts`
- `packages/sunshine-korri/README.md`

## Notes

Keep separate from clean product-path validation so the release gate can decide how much soak is required.
