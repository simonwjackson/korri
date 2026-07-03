---
id: 01KT5CF92C0GE6W7V3DMKQNYGM
slug: wire-moonlight-local-control-into-remote-product-launches
title: Wire Moonlight local-control into remote product launches
origin: parked
legacy: task-117
status: Done
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

- `./01KSXN940WHC4SJ684MBEH0JNW-integrate-live-bitrate-controls-into-product-launches.md`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `docs/acceptance/runtime-settings-protocol-contract.md`

## Notes

Discovered while reviewing Evier stream-control work: Evier has UI/RPC controls, but normal remote launches still compose a LaunchSpec without per-launch local-control ownership.

2026-06-09 dedupe pass: this is the canonical product launch wiring item. It supersedes migrated `backlog/task-031` for socket/env ownership and is the first implementation task in the product-runtime sequence. Broader live-bitrate integration from `task-058` is now split across `task-117` through `task-122`.

2026-07-03 reconciliation: DONE for the launch side. `product/apps/portal/stream/moonlight-launcher.ts` creates a per-session control runtime dir + socket (`moonlightControlHandleFromOptions`) at `$XDG_RUNTIME_DIR/korri-moonlight/<sessionId>/control.sock` (mode 0700) and injects `MOONLIGHT_LOCAL_CONTROL_{AUTHORITY,RUNTIME_DIR,SESSION_ID,SOCKET}` via `moonlightControlEnvForHandle`. SM8550 commits `host.moonlight.control = { enable = true; authority = "controller" }` (rocknix-sm8550.nix). The remaining product gap is the portal binding, not launch wiring: `stream-control/service.ts` still resolves the socket only from static `MOONLIGHT_LOCAL_CONTROL_SOCKET` process env — see `task-118`.
