---
id: 01KT5CF92DWBF22WWZVG8KX3FD
slug: bind-stream-control-rpcs-to-the-active-moonlight-session
title: Bind stream-control RPCs to the active Moonlight session
origin: parked
legacy: task-118
status: To Do
priority: high
labels:
  - runtime-settings
  - product
  - rpc
  - sessiond
  - local-control
created: 2026-06-03
source: user
---

# Bind stream-control RPCs to the active Moonlight session

## Why it matters

The current StreamControl service reads MOONLIGHT_LOCAL_CONTROL_SOCKET from process env, which is useful for Evier/dev benches but not enough for product sessions. Product controls need to target the active launched stream and become disabled when that stream exits.

## Acceptance Criteria

- [ ] Stream-control config/state resolve the active Moonlight control socket from launch/session state instead of relying only on a static process env.
- [ ] When no active Moonlight session exists, stream-control state reports disabled/unavailable without attempting commands.
- [ ] When the active stream exits, subsequent stream-control state and mutations stop targeting the stale socket.
- [ ] Tests cover active session, no session, and exited/stale session behavior.

## Related

- `./01KSXN940WHC4SJ684MBEH0JNW-integrate-live-bitrate-controls-into-product-launches.md`
- `./01KT5CF92C0GE6W7V3DMKQNYGM-wire-moonlight-local-control-into-remote-product-launches.md`
- `korri/products/app/api/stream-control/service.ts`
- `korri/products/app/api/stream-control/stream-control.rpc-handler.test.ts`
- `tools/device/sessiond.ts`

## Notes

This is the product-session binding that sits between launch-local-control wiring and Evier/product controls.
