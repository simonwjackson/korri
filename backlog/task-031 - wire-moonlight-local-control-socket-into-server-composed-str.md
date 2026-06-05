---
id: task-031
title: Wire Moonlight local-control socket into server-composed stream launches
status: To Do
priority: high
labels:
  - streaming
  - moonlight
  - runtime-control
created: 2026-06-05
source: user
---

# Wire Moonlight local-control socket into server-composed stream launches

## Why it matters

Bandai remote-source launches are composed as LaunchSpec values in korri-server/sessiond and currently do not create or publish MOONLIGHT_LOCAL_CONTROL_SOCKET, so runtime stream-control RPCs cannot mutate bitrate/FPS/resolution through the preferred controller socket path. Until this is wired, runtime-settings env hooks are the only practical mutation path for those launches.

## Acceptance Criteria

- [ ] composeMoonlightLaunchSpec or the launch adapter can allocate a per-session Moonlight local-control runtime dir/socket and inject MOONLIGHT_LOCAL_CONTROL_* env into the launched process.
- [ ] The active stream-control surface can discover the generated Moonlight socket for the current foreground session.
- [ ] A focused test proves a remote-source launch exposes controller-authorized runtime.setBitrate, runtime.setFps, and runtime.setResolution when Sunshine advertises support.

## Related

- `product/apps/portal/api/stream/compose-moonlight-launch-spec.ts`
- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `product/platform/stream-control/stream-control-api-routes.ts`

## Notes

Discovered while enabling all custom Moonlight flags for Bandai; user explicitly wants mutation enabled even if the env hook is currently the only path.
