---
id: task-034
title: Cover ForegroundSessionStatusLayerLive end-to-end via an RPC-client stub
status: Done
priority: medium
labels:
  - testing
  - foreground-session
  - rpc
  - quality
created: 2026-05-29
source: se-code-review
context:
  cwd: .
  branch: refactor/sessiond-canonical-lifecycle-source
  commit: 43af31e
  repo: simonwjackson/korri
  invoked_by: se-code-review
---

# Cover ForegroundSessionStatusLayerLive end-to-end via an RPC-client stub

## Context

task-012 (`refactor/sessiond-canonical-lifecycle-source`) rewires the renderer's `foregroundSessionGateStateAtom` so it polls `app.server.status` over `/api/rpc` at 1 Hz, replacing the deleted `/__korri/desktop/foreground-session-status` bun bridge. The new live layer is at:

- `korri/products/app/features/home/foreground-session-status-layer-live.ts`

It composes two responsibilities:

1. The pure mapping `SessiondLifecycleSummary.mode → ForegroundSessionStatusSnapshot.state` (exported as `snapshotStateFromSessiondMode` / `snapshotFromServerStatus`).
2. The Effect RPC plumbing: `RpcClient.make(serverRpcGroup)` → `client["app.server.status"]({})` → `Effect.matchEager({ onFailure: error → { _tag: "LoadError", message } })`.

task-012 directly tests (1) with 9 mapper-table cases in `foreground-session-status-layer-live.test.ts`. It does NOT instantiate the Layer or exercise (2) — there is no test that constructs `ForegroundSessionStatusLayerLive`, stubs the RPC transport, and asserts the round trip.

Specific gaps identified by se-testing-reviewer in task-012's review (T-01, T-02):

- The `onFailure → LoadError` branch (the renderer's degraded-mode handling for Bun-API-restarting) is the new failure pathway introduced by task-012 and has no test at all.
- The `Atom.withRefresh(Duration.seconds(1))` + `foregroundSessionStatusLayerAtom` seam in `library-atoms.ts` is the chain that delivers a live `mode=game` server response to the renderer as `{ _tag: "Running" }`. No test wires `ForegroundSessionStatusLayerLive` through `foregroundSessionStatusLayerAtom` and asserts the end-to-end behavior.

Both gaps share the same blocker: the repo has no reusable RPC-client-stub layer for client-side Effect RPC tests. Without one, layer-level tests either spin up a real HTTP server or mock at the wrong level (replacing `RpcClient.make` itself defeats the test).

## Why it matters

`foreground-session-status-layer-live.ts` is the renderer's only path to know whether a game is running. A regression in the RPC plumbing (wrong method name after a refactor, broken error routing, dropped layer provision) silently leaves the home screen stuck on its initial gate state — a "black screen" class bug for the operator. Pure-helper tests cannot catch it.

The same RPC-client-stub infrastructure would unblock future renderer-side RPC layer tests (currently every such layer faces this same gap).

## Acceptance Criteria

- [ ] A reusable client-side test helper exists for constructing an `RpcClient` over a stubbed transport (in-memory route handler, no real HTTP). Lives where renderer-side RPC test infrastructure belongs (likely `tools/testing/library/` or alongside `app-rpc-group.ts`). Configurable behavior, not `Mock*`/`Stub*`/`Fake*`-named.
- [ ] `foreground-session-status-layer-live.test.ts` (or a sibling integration file) constructs `ForegroundSessionStatusLayerLive` over the stub transport, configures the stub to return `{ sessiond: { mode: "game", active: { launchId: "x", mode: "game" } } }`, calls `ForegroundSessionStatusSource.get()`, and asserts the snapshot is `{ state: "Running", active: { requestId: "x", gameId: "x" }, ... }`.
- [ ] Same harness covers the `onFailure → LoadError` branch: configure the stub to fail with a transport error, assert `source.get()` returns `{ _tag: "LoadError", message: ... }`.
- [ ] An end-to-end test exercises the seam `HomeRuntimeLayersRoot` uses: swap `foregroundSessionStatusLayerAtom` to `ForegroundSessionStatusLayerLive` backed by the stub, read `foregroundSessionGateStateAtom` via `Atom.runtime`, configure the stub to return `mode=game`, assert the atom emits `{ _tag: "Running", requestId, gameId }` within one refresh tick (≤ 1 s budget).
- [ ] A test verifies `Atom.withRefresh(Duration.seconds(1)) + autoDispose` stops polling when the atom is unmounted — promised by the task-012 plan but not currently asserted.
- [ ] `just typecheck && just test-unit` exit green; no `Mock*`/`Stub*`/`Fake*` doubles.

## Related

- `korri/products/app/features/home/foreground-session-status-layer-live.ts`
- `korri/products/app/features/home/foreground-session-status-layer-live.test.ts`
- `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx`
- `korri/shared/library/library-atoms.ts`
- `korri/products/app/api/app-rpc-group.ts`
- `korri/products/app/api/server/rpc-group.ts`
- `docs/plans/2026-05-29-004-refactor-sessiond-canonical-lifecycle-source-plan.md`

## Notes

Captured during task-012 Tier 2 code review (T-01 and T-02 from se-testing-reviewer). Bundled into one item because both findings share the same blocker (no client-side RPC-stub infrastructure) and would land in the same PR.

Distinct from task-009 (which scopes sessiond's HTTP/SSE contracts, the in-process owner, and Nix wiring) — this is renderer-side RPC client wiring, not daemon-side.
