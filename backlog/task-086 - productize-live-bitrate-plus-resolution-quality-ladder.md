---
id: task-086
title: Productize live bitrate plus resolution quality ladder
status: To Do
priority: high
labels:
  - streaming
  - productization
  - runtime-resolution
  - bitrate
created: 2026-06-02
source: user
---

# Productize live bitrate plus resolution quality ladder

## Why it matters

Resolution-only switching did not reduce measured bandwidth at a fixed bitrate; the useful low-bandwidth mode requires coordinated bitrate and resolution changes.

## Acceptance Criteria

- [ ] Expose a product-facing quality ladder that pairs each resolution with bitrate/fps defaults.
- [ ] Runtime commands apply resolution and bitrate in a safe order with observable applied state.
- [ ] Bandwidth measurement on bandai wlan0 confirms low modes reduce network usage.
- [ ] UI/API naming avoids implying that resolution alone saves bandwidth.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `korri/shared/stream/moonlight-control-client.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`
- `tools/cli/moonlight-runtime-watch.ts`
- `packages/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch`
- `packages/sunshine-korri/patches/0012-persist-runtime-config-and-reinit-capture-after-resolution.patch`

## Notes

Measured game-scene bandwidth: 1080p normal ~12 Mbps, 1024x576 same bitrate ~12 Mbps, 1024x576 + 4000 kbps ~6 Mbps. 360p @ 1 Mbps was visually less pixelated at motion than 1080p @ 1 Mbps.
