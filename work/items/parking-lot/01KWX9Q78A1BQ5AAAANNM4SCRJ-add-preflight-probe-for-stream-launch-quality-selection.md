---
id: 01KWX9Q78A1BQ5AAAANNM4SCRJ
slug: add-preflight-probe-for-stream-launch-quality-selection
title: Add preflight probe for stream launch quality selection
origin: parked
status: In Progress
priority: medium
labels:
  - stream-control
  - adaptive
  - preflight
created: 2026-07-07
source: user
---

# Add preflight probe for stream launch quality selection

## Why it matters

Launching at a high ceiling like 1080p120 can preserve the runtime envelope, but if the link cannot carry the initial stream, Korri can lose the ability to rescue. A lightweight preflight probe can choose a safe launch profile before the stream starts flooding the connection.

## Acceptance Criteria

- [ ] Define a preflight signal set for latency, loss, and estimated throughput between source and device before Moonlight launch.
- [ ] Compare iperf3 versus a lighter product-owned probe and document tradeoffs for setup, accuracy, and user friction.
- [ ] Map probe results to explicit launch profiles such as 1080p120 high, 1080p60 medium, 720p60 safe, and 640x360/30 rescue.
- [ ] Verify with aka/Bandai that bad preflight conditions avoid launching into an unrecoverable high-bitrate choke.

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/platform/stream/stream-adaptive-runner.ts`

## Notes

User asked whether iperf3 solves preflight. Capture as launch-time quality selection, not network-handoff rescue.
