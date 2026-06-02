---
id: task-081
title: Migrate sessiond control and event streaming to RPC
status: To Do
priority: medium
labels:
  - architecture
  - rpc
  - sessiond
  - inputd
  - follow-up
created: 2026-06-01
source: user
---

# Migrate sessiond control and event streaming to RPC

## Why it matters

Korri's product surfaces already use Effect RPC, but sessiond still exposes a bespoke REST/SSE control protocol for managed-launch status, start, terminate, and lifecycle events. Keeping this separate creates architectural drift, makes inputd/sessiond integration choose between two control styles, and leaves event streaming outside the canonical RPC channel.

## Acceptance Criteria

- [ ] Define a dedicated internal sessiond RPC group rather than importing the full app RPC group into sessiond.
- [ ] Expose RPC methods for sessiond status, control start/stop/reconcile, managed launch start, managed launch terminate, and managed-launch status.
- [ ] Replace `/managed-launch/events` SSE with an RPC-native streamed event surface or the project's chosen RPC streaming primitive.
- [ ] Migrate korri-server, game-stream runner/client helpers, inputd kill-current-game integration, and systemd/control startup helpers off bespoke REST endpoints.
- [ ] Keep compatibility shims only during migration, then remove the REST/SSE sessiond endpoints once all callers and hardware smoke tests pass.
- [ ] Add module/runtime tests proving sessiond RPC works for start/status/terminate/events and that old REST dependency is absent from product callers.

## Related

- `tools/device/sessiond.ts`
- `korri/shared/library/sessiond-managed-launch-client.ts`
- `korri/shared/library/sessiond-managed-launch-event-observer.ts`
- `korri/shared/library/session-launcher.ts`
- `tools/device/game-stream-runner.ts`
- `tools/device/inputd-actions.ts`
- `nix/modules/korri-sessiond.nix`

## Notes

Discovered while diagnosing Sobo home-screen launch/kill behavior. User explicitly wants streamed events over Korri's RPC channel rather than bespoke REST/SSE.
