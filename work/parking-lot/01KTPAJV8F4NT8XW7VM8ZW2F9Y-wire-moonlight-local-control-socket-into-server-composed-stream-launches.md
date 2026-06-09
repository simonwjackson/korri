---
id: 01KTPAJV8F4NT8XW7VM8ZW2F9Y
slug: wire-moonlight-local-control-socket-into-server-composed-stream-launches
title: "Wire Moonlight local-control socket into server-composed stream launches"
origin: parked
legacy: backlog/task-031
status: Done
priority: high
labels:
  - "streaming"
  - "moonlight"
  - "runtime-control"
created: 2026-06-05
source: user
---

# Wire Moonlight local-control socket into server-composed stream launches

## Why it matters

Bandai remote-source launches are composed as LaunchSpec values in korri-server/sessiond and currently do not create or publish MOONLIGHT_LOCAL_CONTROL_SOCKET, so runtime stream-control RPCs cannot mutate bitrate/FPS/resolution through the preferred controller socket path. Until this is wired, runtime-settings env hooks are the only practical mutation path for those launches.

## Acceptance Criteria

- [x] Standalone item disposition chosen: product launch socket ownership is tracked by `task-117`.
- [x] Active socket discovery/RPC targeting is tracked by `task-118`.
- [x] Sunshine capability gating for `runtime.setBitrate`, `runtime.setFps`, and `runtime.setResolution` is tracked by `task-119`.

## Related

- `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/platform/stream-control/stream-control-api-routes.ts`

## Notes

Discovered while enabling all custom Moonlight flags for Bandai; user explicitly wants mutation enabled even if the env hook is currently the only path.

2026-06-09 dedupe pass: this migrated backlog item is superseded by the newer product-runtime task split. Keep `task-117` as the canonical launch wiring item, with `task-118` and `task-119` owning active-session discovery and capability gating.
