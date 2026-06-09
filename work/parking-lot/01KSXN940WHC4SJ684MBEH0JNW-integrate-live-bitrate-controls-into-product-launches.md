---
id: 01KSXN940WHC4SJ684MBEH0JNW
slug: integrate-live-bitrate-controls-into-product-launches
title: Integrate live bitrate controls into product launches
origin: parked
legacy: task-058
status: Done
priority: high
labels:
  - moonlight
  - sunshine
  - runtime-settings
  - product
  - rpc
  - ui
created: 2026-05-31
source: user
context:
---

# Integrate live bitrate controls into product launches

## Why it matters

The seamless path is proven manually, but users only benefit when normal Korri product launches expose bitrate controls through the supported capability contract without reconnect or restart fallbacks.

## Acceptance Criteria

- [x] Launch-local Moonlight control ownership moved to `task-117`.
- [x] Active stream-control RPC/socket binding moved to `task-118`.
- [x] Capability-gated product controls moved to `task-119`.
- [x] Accepted-versus-applied UI semantics moved to `task-120`.
- [x] Restore-to-launch-baseline behavior moved to `task-121`.
- [x] Input preservation proof moved to `task-122`.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `korri/shared/stream/moonlight-control-client.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`

## Notes

Grouped from the live bitrate shippability checklist after SM8550 h264_vaapi/v4l2m2m validation.

2026-06-09 dedupe pass: this broad product integration item has been decomposed into `task-117` through `task-122`. No standalone work should be picked up from this item.
