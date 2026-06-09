---
id: 01KT2T2J1TA8JSPDNF7YMTE1XH
slug: define-runtime-settings-protocol-contract
title: Define runtime settings protocol contract
origin: parked
legacy: task-097
status: Done
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

- [x] Protocol spec documents capability query/ack, supported operations, diagnostic probe behavior, request IDs, timeout behavior, and error reasons
- [x] Resolution, bitrate, and FPS requests have clear bounds and failure semantics
- [x] Moonlight local-control API maps cleanly to protocol outcomes
- [x] Compatibility behavior is documented for hosts/clients that do not support the protocol

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `packages/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch`
- `packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch`
- `packages/moonlight-embedded-korri/patches`
- `tools/cli/moonlight-control.ts`
- `task-091`
- `task-092`
- `task-094`

## Notes

2026-06-09 dedupe pass: acceptance criteria are already complete and the canonical contract lives in `docs/acceptance/runtime-settings-protocol-contract.md`. Keep this item closed; downstream work should reference the contract document directly.
