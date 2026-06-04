---
id: 01KT2T2J20HQC66JQ1NA2BWYWF
slug: define-gamescope-api-coverage-contract
title: Define Gamescope API coverage contract
origin: parked
legacy: task-105
status: To Do
priority: high
labels:
  - gamescope
  - runtime-control
  - api
  - coverage
  - docs
created: 2026-06-02
source: user
---

# Define Gamescope API coverage contract

## Why it matters

The v1 bridge exists, but the team still needs a written definition of what complete API coverage means so follow-up PRs can close specific contract rows instead of relying on implicit memory from validation sessions.

## Acceptance Criteria

- [ ] Document the Gamescope control API methods, request/response shapes, error semantics, timeout/readback expectations, and device acceptance criteria.
- [ ] Define a coverage matrix for valid requests, invalid requests, backend unavailable, backend timeout, applied-state readback, CLI behavior, and Bandai/device behavior.
- [ ] Link the matrix to the existing v1 bridge/API implementation and broad Gamescope control backlog items.

## Related

- `korri/shared/gamescope-control/gamescope-control-protocol.ts`
- `korri/shared/gamescope-control/gamescope-control-bridge.ts`
- `tools/cli/gamescope-control.ts`
- `packages/gamescope-korri/patches/README.md`
- `./01KT2T2J1W62XXHTAJSHT1PZ7J-implement-gamescope-live-ipc-control-plane.md`
- `./01KT2T2J1YK1SN1ZK0B8W0KBXJ-build-full-gamescope-rpc-control-api.md`

## Notes

PR phase 1 for taking the v1 Gamescope control API from validated MVP to complete coverage.

2026-06-02 interview decisions:

- V1 API boundary should be broad: include the full known Gamescope control surface, not only currently proven controls.
- Unsupported controls must fail clearly with a plain "not supported" result, not silently no-op.
- Successful commands should require real readback whenever possible before reporting done.
- V1 should include live events.
- Commands should be queued one at a time for v1 to avoid race conditions.
- Backend hangs/timeouts should fail fast with a clear timeout error; recovery is handled by higher-level Korri code.
- API transport should be a local-only Unix socket.
- `hello`/capabilities should provide detailed capability information with reasons.
- Resolution requests should accept any positive width/height rather than a restricted ladder.
- Observability should be maximized; patch Gamescope early when the bridge cannot provide strong state/events.
- Expose individual controls only, not a high-level quality-profile command in this contract.
- On readback mismatch, fail clearly and do not automatically roll back.
- `state` should fail as a whole if required state cannot be read, instead of returning partial or guessed state.
- The bridge should start even if Gamescope is unavailable, then report Gamescope unavailable until it appears.
- Socket access should be owner-only by default.
- API coverage can be satisfied by unit and mocked tests; hardware validation remains useful for product/visual claims but is not required for every API command's coverage row.
- Full contract guarantees apply to `gamescope-korri`, not arbitrary stock Gamescope builds.
