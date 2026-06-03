---
id: task-117
title: Wire Moonlight local-control into remote product launches
status: To Do
priority: high
labels:
  - runtime-settings
  - moonlight
  - product
  - launch
  - local-control
created: 2026-06-03
source: user
---

# Wire Moonlight local-control into remote product launches

## Why it matters

Evier can send runtime-control RPCs, but normal remote launches do not yet create a per-launch Moonlight local-control socket or pass the required environment to the Moonlight process. Without this, product users only get controls when a static socket env is preconfigured, not from normal launch/session lifecycle.

## Acceptance Criteria

- [ ] Remote-source product launches create a per-launch Moonlight local-control runtime directory and socket path.
- [ ] Moonlight launch env includes MOONLIGHT_LOCAL_CONTROL_SOCKET, MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR, MOONLIGHT_LOCAL_CONTROL_SESSION_ID, and controller authority when runtime controls are enabled.
- [ ] The launch path keeps Gamescope wrapping and existing Moonlight args unchanged except for the local-control environment.
- [ ] Control setup fails closed when required runtime-dir inputs are unavailable; it does not synthesize a reconnect/restart fallback.

## Related

- `backlog/task-058 - integrate-live-bitrate-controls-into-product-launches.md`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`

## Notes

Discovered while reviewing Evier stream-control work: Evier has UI/RPC controls, but normal remote launches still compose a LaunchSpec without per-launch local-control ownership.
