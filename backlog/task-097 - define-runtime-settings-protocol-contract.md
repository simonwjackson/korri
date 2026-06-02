---
id: task-097
title: Define runtime settings protocol contract
status: To Do
priority: high
labels:
  - live-resolution
  - protocol
  - upstream
  - moonlight
  - sunshine
created: 2026-06-02
source: user
---

# Define runtime settings protocol contract

## Why it matters

The demo uses downstream runtime-settings control messages and local-control commands. To ship or upstream, the protocol needs versioning, capability negotiation semantics, request/ack/error behavior, idempotency, and unsupported-operation handling spelled out instead of being implicit in patches.

## Acceptance Criteria

- [ ] Protocol spec documents capability query/ack, supported operations, proof-gated operations, request IDs, timeout behavior, and error reasons
- [ ] Resolution, bitrate, and FPS requests have clear bounds and failure semantics
- [ ] Moonlight local-control API maps cleanly to protocol outcomes
- [ ] Compatibility behavior is documented for hosts/clients that do not support the protocol

## Related

- `packages/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch`
- `packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch`
- `packages/moonlight-embedded-korri/patches`
- `tools/cli/moonlight-control.ts`
- `task-091`
- `task-092`
- `task-094`
