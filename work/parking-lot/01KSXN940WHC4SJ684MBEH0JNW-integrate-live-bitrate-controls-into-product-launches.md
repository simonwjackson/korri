---
id: 01KSXN940WHC4SJ684MBEH0JNW
slug: integrate-live-bitrate-controls-into-product-launches
title: Integrate live bitrate controls into product launches
origin: parked
legacy: task-058
status: To Do
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

- [ ] Normal remote product launches enable Moonlight local-control when runtime controls are required, with lifecycle-managed socket paths and cleanup on stream exit.
- [ ] The product RPC/UI path exposes live bitrate only when local-control and Sunshine capability both advertise `runtime.setBitrate`.
- [ ] Unsupported or unknown bitrate capability is surfaced as unsupported/pending, never as a reconnect or masked restart path.
- [ ] The product path supports restoring the launch-baseline bitrate when adaptation/user control stops.
- [ ] Product launches continue to pass the discovered InputPlumber virtual gamepad path and preserve controller input.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `korri/shared/stream/moonlight-control-client.ts`
- `korri/shared/stream/moonlight-control-protocol.ts`

## Notes

Grouped from the live bitrate shippability checklist after SM8550 h264_vaapi/v4l2m2m validation.
