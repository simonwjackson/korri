---
title: "refactor: Make sessiond the canonical host lifecycle source"
type: refactor
status: active
date: 2026-05-29
deepened: 2026-05-29
origin: docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md
verify_command: "just typecheck && just test-unit"
---

# refactor: Make sessiond the canonical host lifecycle source

## Summary

Collapse Korri's split lifecycle truth by teaching the in-process `ForegroundSessionOwner` to consult sessiond as its idle authority when sessiond is configured, replacing the hardcoded `/__korri/desktop/foreground-session-status` bridge endpoint with a renderer atom that polls `app.server.status` over standard `/api/rpc`, and adding a `_tag`-discriminated rejection surface so callers can distinguish local-preflight from daemon-side busy/unavailable. ForegroundSessionOwner stays as the re-entry guard; no renderer-facing SSE is introduced; the durable design note lands in `docs/solutions/architecture-patterns/`.

---

## Problem Frame

The foreground-session arc has shipped three plans against the origin brainstorm: generic owner contract (Phase 1, 2026-05-26-006), sessiond as managed launcher adapter (Phase 4B, 2026-05-26-012), and lifecycle-session intent routing through sessiond (2026-05-27-003). The remaining seam is reporting: ForegroundSessionOwner still gates `app.library.launch` using only its own in-process state, the renderer reads a hardcoded `IdleReady` bridge endpoint that ignores sessiond entirely, and the two rejection paths (local owner vs sessiond) collapse to indistinguishable `failureKind: "session-busy"` on the wire. An out-of-band `/managed-launch` POST can put sessiond in `game` mode while the renderer still shows the host as idle. Task-012 closes the loop so one host has one answer.

---

## Requirements

- R1. Durable design note states that physical-host foreground lifecycle truth lives in sessiond, and ForegroundSessionOwner is a re-entry preflight guard rather than a parallel source of truth. *(task-012 criterion 1)*
- R2. Renderer-facing lifecycle status reflects sessiond's live state via `app.server.status`; the legacy hardcoded `/__korri/desktop/foreground-session-status` endpoint is removed. *(task-012 criterion 2; origin R10, R11)*
- R3. `app.server.status` remains the canonical server-side status proxy and surfaces sessiond mode/active/phase/failure to callers. *(task-012 criterion 3; Phase 4B decision)*
- R4. Out-of-band `/managed-launch` callers cannot leave `app.server.status` reporting idle; the next `app.library.launch` preflight detects the busy daemon and rejects accordingly. *(task-012 criterion 4; origin R13)*
- R5. ForegroundSessionOwner's role is clarified in code and the design note as a preflight/re-entry guard whose idle check consults sessiond when sessiond is configured. *(task-012 criterion 5)*
- R6. Launch responses surface a `_tag`-discriminated rejection so callers can distinguish local preflight rejection, daemon-side rejection, daemon unreachable, and execution failure. *(task-012 criterion 6; Learning #10 fail-closed contract)*
- R7. Tests prove an active sessiond launch is visible through `app.server.status` and through the renderer's `foregroundSessionGateStateAtom`. *(task-012 criterion 7)*

**Origin actors:** A2 (Player), A3 (Foreground session owner), A5 (Foreground session host).
**Origin flows:** F1 (Default foreground launch), F3 (Cloud gaming source launch).
**Origin acceptance examples:** AE5 (covers R10–R12, R15–R16 — sessiond is host lifecycle authority), AE6 (covers R13 — single foreground session per host, rejection on concurrent attempt).

---

## Scope Boundaries

- Restructuring `ForegroundSessionHostService` into a Layer-swappable Effect Service.
- Renderer-initiated cancellation of an active sessiond launch (status is read-only for this plan).
- Idle-blank source-machine semantics (owned by task-016).
- Routing `tools/device/game-stream-runner.ts` through the foreground lifecycle (already shipped in plan 2026-05-27-003).
- Sessiond capability-token rotation or renewal mechanics.
- Multi-foreground-session-per-host work (excluded by origin R13).
- Removing the live-USB `ForegroundSessionStatusLayerFixture` path.

### Deferred to Follow-Up Work

- **Renderer-side cancellation of active sessiond launches:** future task; covers origin AE7. This plan keeps the surfaced status read-only.
- **Aggregating server-side sessiond `/managed-launch/events` SSE into a single shared subscription:** today `app.server.status` does one-shot probes per RPC call, which is fine for low-rate polling but would benefit from a shared subscription if status moves to higher frequencies or cross-RPC consumers grow. Defer to task-009 (sessiond contract test coverage) or a dedicated performance pass.

---

## Context & Research

### Relevant Code and Patterns

- `korri/shared/stream/foreground-session-owner.ts` — generic owner state machine; current re-entry gate. Its `canAccept(state)` shape is the natural extension point for a sessiond consultation hook.
- `korri/shared/stream/foreground-session-lifecycle.ts` — `ForegroundSessionStateTag` (10 tags). Stays the in-process lifecycle vocabulary.
- `korri/shared/stream/foreground-session-status.ts` — wire shape for the renderer status atom; will be re-sourced from `app.server.status` rather than the bridge endpoint.
- `korri/products/app/api/library/launch.rpc-handler.ts` — convergence point for local + remote launches; both paths call `launchLocalForegroundSession`. Where the typed rejection surfaces.
- `korri/products/app/api/library/local-foreground-launch-adapter.ts` — wraps the in-process owner with the launch adapter; receives the sessiond-status hook injection.
- `korri/products/app/api/server/status.rpc-handler.ts` — already contains `probeSessiondStatus()` and returns `SessiondLifecycleSummary`. Extension point for R3, R4.
- `korri/products/app/api/server/status.rpc.ts` — RPC contract; may need an additive field clarifying which surface the renderer should read.
- `korri/products/app/stream/foreground-session-status-client.ts` — renderer-side HTTP client for the legacy bridge endpoint. Replaced by an RPC-backed source.
- `korri/products/app/features/home/foreground-session-status-layer-live.ts` — wires the live status atom. Layer composition change rather than atom contract change.
- `korri/products/app/features/library/library-atoms.ts` — declares `foregroundSessionGateStateAtom`. Adds a refresh interval / withRefresh; does not change the atom's downstream shape.
- `korri/deploy/desktop/main.ts` — hosts the hardcoded `/__korri/desktop/foreground-session-status` endpoint to delete; preserves the live-USB fixture path.
- `tools/device/sessiond.ts` and `tools/device/sessiond-launcher-client.ts` — sessiond TS client and managed-launch wrapper. No daemon-side changes in this plan.
- `korri/shared/api/rpc/envelope-guard.ts` — every new or changed RPC route inherits this middleware (Learning #7); no parallel `/api/rpc` mounts.

### Institutional Learnings

- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` — single-owner invariant for the host; sessiond's SSE/status surfaces; sessiond is the authoritative lifecycle source.
- `docs/research/foreground-session-lifecycle/repo-research.md` — names every file task-012 references; confirms `app.server.status` as the proxy surface.
- `docs/research/foreground-session-lifecycle/learnings-research.md` — Phase 1 implementation distillation; introduces the `Busy` / `NotReady` typed-rejection precedent that R6 generalizes.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` — three-layer SSE defense. Out of scope for this plan because no new SSE is introduced, but the learning explains why the chosen polling approach is preferable.
- `docs/plans/2026-05-26-012-feat-sessiond-managed-lifecycle-events-plan.md` — Phase 4B established `app.server.status` as the proxy and explicitly stated sessiond is not a renderer-facing protocol.
- `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md` — envelope guard required for any RPC route change.
- `docs/solutions/runtime-errors/kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27.md` — precedent for deleting bun-bridge endpoints in favor of standard `/api/rpc`.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` — origin of the fail-closed contract; explains why "host-unreachable" must be a typed rejection rather than a silent fallback.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` — typed `_tag` distinctions, not error-message-shape inference.

### External References

None used; local patterns are sufficient.

---

## Key Technical Decisions

- **ForegroundSessionOwner stays in place as a preflight/re-entry guard** rather than being deleted or restructured into a sessiond adapter. The owner is not currently a Layer-swappable Effect Service, and restructuring is out of scope. The owner gains a `consultExternalIdle?` hook that the desktop adapter wires to sessiond when `KORRI_SESSIOND_URL` is set.
- **`consultExternalIdle?` hook is three-valued** to match `probeSessiondStatus`'s existing return shape: `{ status: 'idle' } | { status: 'not-idle'; mode } | { status: 'unavailable'; reason: 'network' | 'token-rejected' }`. The owner's `ForegroundSessionOwnerLaunchResult` gains an `ExternalUnavailable` variant (distinct from `Busy` and `Failed`) so U3 can map directly to `HostUnavailable` without exception-path inference. A two-valued return shape would collapse `unavailable` into `not-idle` and produce the wrong `_tag` on the wire.
- **Renderer reads sessiond state by polling `app.server.status` over `/api/rpc`**, not via a renderer-facing SSE subscription. Honors Phase 4B's "sessiond is not a renderer-facing protocol" boundary, reuses the existing canonical proxy, and avoids the SSE three-layer-defense contract for a status surface that is fine at ~1 Hz.
- **Polling interval is 1 second** via `Atom.withRefresh(Duration.seconds(1))` from `@effect/atom-react` (no prior refresh pattern exists in the codebase; this is the first instance). Atom configured with `Atom.autoDispose` (or equivalent scope teardown) so polling stops when the home/library view unmounts. Fast enough for UI feedback; slow enough that the loopback `probeSessiondStatus()` cost is negligible. Interval can be tuned if UX feedback warrants.
- **Legacy `/__korri/desktop/foreground-session-status` bridge endpoint is deleted**, not retained as a proxy. Follows Learning #8: bun bridges that the renderer could call the server for directly produce silent decode failures and add no value.
- **Typed launch rejection is a discriminated `_tag` union** on the RPC response: `Accepted | PreflightRejected | DaemonRejected | HostUnavailable | LaunchFailed`. The first four are the new shape; `LaunchFailed` preserves today's failure surface. Existing fields (`status`, `failureKind`, `exitCode`) stay populated additively so any downstream caller that hasn't updated still works.
- **Token-rejected (HTTP 401) preserves its existing exit code 126 / `failureKind: 'host-control-disabled'`.** `probeSessiondStatus` is extended to distinguish 401 from generic unreachable, and the preflight maps 401 to `HostUnavailable` with the existing failureKind/exit-code pair. Without this, the preflight path would silently change a 401 from exit 126 (`host-control-disabled`) to exit 124 (`host-unavailable`) versus today's `session-launcher.ts` spawn-time mapping. The non-401 unreachable case continues to map to `host-unavailable` / exit 124.
- **`DaemonRejected` covers two distinct daemon-side rejection sources**: sessiond's internal status check inside `spawnViaSessiond` (the existing capability/mode check that runs before the POST) AND the POST itself. Both surface to the caller as `DaemonRejected` because both are sessiond saying "no, after preflight passed"; the `reason.source` field discriminates.
- **Out-of-band detection lives in the preflight, not in `app.server.status`** — the preflight reads sessiond before the local owner accepts a launch, so a direct `/managed-launch` POST is caught the next time anything calls `app.library.launch`. `app.server.status` continues to surface the latest sessiond mode so UI shows the truth in the polling cycle even without a launch attempt.
- **Design note lives in `docs/solutions/architecture-patterns/`** as `physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`, paired with inline architecture comments on `ForegroundSessionOwner` and `probeSessiondStatus`. Matches the institutional-learnings convention used by the existing kiosk-renderer-ownership-by-sessiond note.

---

## Open Questions

### Resolved During Planning

- **Renderer subscription mechanism — polling vs SSE?** Polling. Aligns with Phase 4B's renderer-facing-protocol boundary and avoids the SSE three-layer-defense contract for a surface that polls fine at 1 Hz.
- **ForegroundSessionOwner: preflight guard or thin sessiond adapter?** Preflight guard. The owner isn't currently a Layer-swappable Effect Service; restructuring is out of scope and the preflight-guard role is genuinely useful (catches re-entry without a network round-trip).
- **Keep or delete the bun bridge endpoint?** Delete. Learning #8 precedent.
- **Where does the typed rejection distinction live on the wire?** Discriminated `_tag` union on the launch RPC response. Today's buried `failureKind` is preserved additively for back-compat.

### Deferred to Implementation

- **Exact polling interval default** (1 s is the planned value; final number can move during implementation if UX feedback warrants).
- **Whether the typed rejection is a Schema tagged union returned in `success` or surfaces as Schema errors via `error` channel.** Both are valid Effect RPC shapes; the choice falls to whichever pattern the surrounding `launch.rpc.ts` already uses for non-fatal outcomes.
- **Whether `ForegroundSessionOwner`'s `consultExternalIdle` hook is sync or async-Effect.** Depends on how the existing owner's `canAccept` is shaped after Phase 4B — verify on first touch. The return-value shape is fixed (three-valued, see Key Technical Decisions); only the sync/Effect axis is deferred.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Current shape (split truth)

```
Renderer (React)
  └── foregroundSessionGateStateAtom
        └── GET /__korri/desktop/foreground-session-status   ←  hardcoded "IdleReady"
                                                                 (no sessiond input)

Renderer launch
  └── app.library.launch  (RPC)
        └── ForegroundSessionOwner.launch
              ├── owner-local idle check                    ←  ignores sessiond
              └── adapter.spawn → sessiond /managed-launch  ←  may reject with "session-busy"
                                                                 (caller can't tell from launch failure)
```

### Proposed shape (sessiond as authority)

```
Renderer (React)
  └── foregroundSessionGateStateAtom  (poll ~1 Hz, withRefresh)
        └── app.server.status         (RPC over /api/rpc)
              └── probeSessiondStatus
                    └── GET sessiond /managed-launch/status

Renderer launch
  └── app.library.launch  (RPC)
        └── ForegroundSessionOwner.launch
              ├── preflight idle check
              │     ├── owner-local re-entry guard
              │     └── consultExternalIdle?(sessiond) when configured  ── GET /managed-launch/status
              └── adapter.spawn
                    └── session-launcher.spawnViaSessiond
                          ├── internal status check                    ── GET /managed-launch/status
                          └── POST /managed-launch

  Three sessiond round-trips per launch when sessiond is configured.
  All three are loopback (sub-10ms typical); the second & third can produce
  DaemonRejected if mode changes between preflight and spawn.

Launch response → discriminated _tag:
  Accepted              { _tag, sessionId, … }
  PreflightRejected     { _tag, reason: { source: "owner-local" | "sessiond", … } }
  DaemonRejected        { _tag, reason: { source: "internal-status" | "spawn-post", … } }
  HostUnavailable       { _tag, reason: "network" | "token-rejected", failureKind, … }
  LaunchFailed          { _tag, failureKind, exitCode, … }
```

The renderer atom and `app.server.status` both surface the sessiond mode; the preflight hook is the load-bearing piece that makes out-of-band detection work.

### Mapper: `SessiondLifecycleSummary` → `ForegroundSessionStatusSnapshot`

The atom's downstream consumer (`foregroundSessionGateStateFromSnapshot` in `foreground-session-gate-state.ts`) switches on owner-vocabulary `state` strings. The mapper MUST emit owner-vocabulary strings or every active state collapses to `Unknown` in the renderer gate. Required mapping:

| Sessiond mode | Snapshot `state` | Notes |
|---|---|---|
| `home` / `idle` | `IdleReady` | Wire alias differs by role (kiosk → `home`, source-machine → `idle`); both mean idle. |
| `starting` | `IdleReady` | Daemon starting up; no managed session active. |
| `stopped` | `IdleReady` | No daemon-managed session. |
| `launching` | `Spawning` | Map to the owner's mid-launch tag. |
| `game` | `Running` | Active managed child. |
| `restoring` | `TearingDown` | Post-launch teardown. |
| `recovering` | `Recovering` | Sessiond's recovery attempts. |

`foreground-session-gate-state.ts` is NOT in the U4 file list because this mapping conforms to its existing switch; no downstream change is required.

---

## Implementation Units

### U1. Durable design note + inline architecture comments

**Goal:** Establish "sessiond is the authoritative host lifecycle source; ForegroundSessionOwner is a re-entry preflight guard" as a durable, citeable architectural decision before any code changes ride on that framing.

**Requirements:** R1, R5.

**Dependencies:** None.

**Files:**
- Create: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
- Modify: `korri/shared/stream/foreground-session-owner.ts` (top-of-file architecture comment)
- Modify: `korri/products/app/api/server/status.rpc-handler.ts` (comment on `probeSessiondStatus` clarifying it is the canonical renderer-facing proxy)

**Approach:**
- Design note follows the existing institutional-learnings shape (problem, decision, consequences, cross-references). Cross-link to `kiosk-renderer-ownership-by-sessiond-2026-05-27.md`, the three predecessor plans, and the origin brainstorm.
- Architecture comments are short (5–10 lines) and point at the design note.

**Patterns to follow:** `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md` shape.

**Test scenarios:**
- Test expectation: none — documentation and comment-only changes have no behavioral surface to test.

**Verification:**
- Design note exists at the planned path with the institutional-learnings frontmatter Korri uses for `docs/solutions/`.
- The two inline comments name the design note and frame the owner-vs-daemon roles consistently with R1/R5.

---

### U2. Preflight consults sessiond before accepting a launch

**Goal:** ForegroundSessionOwner's preflight reads sessiond status when sessiond is configured, so an out-of-band `/managed-launch` POST is detected on the next `app.library.launch` and surfaces as a rejection rather than a confusing spawn-time failure.

**Requirements:** R4, R5; origin R13.

**Dependencies:** U1 (the design note anchors the role this unit implements).

**Files:**
- Modify: `korri/shared/stream/foreground-session-owner.ts` — add optional `consultExternalIdle?` hook; add `ExternalUnavailable` variant to `ForegroundSessionOwnerLaunchResult`.
- Modify: `korri/products/app/api/server/status.rpc-handler.ts` — extend `probeSessiondStatus` to distinguish HTTP 401 (`{ kind: 'token-rejected' }`) from other unreachable cases.
- Modify: `korri/products/app/api/library/local-foreground-launch-adapter.ts` — wire `consultExternalIdle` to the extended sessiond-status probe when `KORRI_SESSIOND_URL` is set.
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts` — accept and propagate the typed rejection shape (covered in detail by U3).
- Test: `korri/shared/stream/foreground-session-owner.test.ts`
- Test: `korri/products/app/api/library/local-foreground-launch-adapter.test.ts`
- Test: `korri/products/app/api/server/status.rpc-handler.test.ts` (extended: 401 discrimination)

**Approach:**
- The owner's `consultExternalIdle?` is a no-arg hook returning a three-valued type: `{ status: 'idle' } | { status: 'not-idle'; mode: string } | { status: 'unavailable'; reason: 'network' | 'token-rejected' }`. When unset (live-USB / no sessiond), behavior is unchanged.
- `ForegroundSessionOwnerLaunchResult` gains an `ExternalUnavailable` variant carrying `{ reason: 'network' | 'token-rejected' }`, distinct from `Busy` (owner-local re-entry) and `Failed` (spawn-time errors). This is what U3 maps to `HostUnavailable`.
- The desktop adapter constructs the hook from the extended `probeSessiondStatus`; reuses the 2 s timeout and fail-closed posture.
- A sessiond-unreachable response from the hook surfaces as `ExternalUnavailable`, not silent fallback to local-only. 401 (token rejected) preserves the existing `failureKind: 'host-control-disabled'` and exit code 126 mapping; non-401 unreachable maps to `failureKind: 'host-unavailable'` and exit code 124.
- The preflight hook is not an atomic read-modify-write across concurrent callers; two concurrent launches could both see `idle` and proceed. The owner's existing synchronous state check is the actual mutex; the hook is a freshness optimization to catch out-of-band callers.

**Execution note:** Test-first for the new preflight rejection paths. The behavioral surface (sessiond busy → preflight rejection vs sessiond unreachable → host-unavailable rejection) is the load-bearing assertion.

**Patterns to follow:**
- `ForegroundSessionBusyRejection` shape in `foreground-session-status.ts`.
- `probeSessiondStatus` (`status.rpc-handler.ts`) for the fail-closed sessiond fetch posture.
- Real-implementation test seam: `makeInMemoryLauncherLayer` and the `fetchImpl`/`statusImpl` injection pattern (no `Mock*` prefix).

**Test scenarios:**
- *Covers AE6.* Happy path: owner in IdleReady with sessiond reporting `home` → preflight accepts; launch proceeds.
- Edge case: owner in IdleReady with sessiond reporting `game` (out-of-band caller) → preflight rejects as `PreflightRejected` with `reason.source: 'sessiond'`; no spawn attempted. Distinct assertion: `reason.source` is `'sessiond'`, not `'owner-local'`.
- Edge case: owner in Running with sessiond reporting `home` (stale daemon, racing exit observation) → preflight rejects as `PreflightRejected` with `reason.source: 'owner-local'`. Distinct assertion: `reason.source` is `'owner-local'`, not `'sessiond'`.
- Error path: sessiond unreachable (network error from the status probe) → owner returns `ExternalUnavailable` with `reason: 'network'`; surfaces as `HostUnavailable` with `failureKind: 'host-unavailable'`, exit code 124. No spawn attempted; no silent fallback.
- Error path: sessiond returns 401 (token rejected) → owner returns `ExternalUnavailable` with `reason: 'token-rejected'`; surfaces as `HostUnavailable` with `failureKind: 'host-control-disabled'`, exit code 126. No spawn attempted. (Preserves existing 401-exit-126 contract from `session-launcher.ts`.)
- Error path: `probeSessiondStatus` returns 503 (service unavailable) → owner returns `ExternalUnavailable` with `reason: 'network'`; same surface as the network case.
- Edge case: `consultExternalIdle` hook unset (live-USB or unconfigured sessiond) → preflight behaves as today; only owner-local state gates re-entry.
- Integration: owner's preflight runs before `adapter.prepare()` so a sessiond-busy rejection does not leak prepare-side-effects.

**Verification:**
- An out-of-band `/managed-launch` POST that places sessiond in `game` causes the next `app.library.launch` to surface a typed `PreflightRejected` with `reason.source: 'sessiond'` (R4 holds at the integration boundary).
- No spawn or prepare side-effects are observed when the preflight rejects, in any of the four rejection flavors above (sessiond-busy, owner-local-busy, network-unavailable, token-rejected).

---

### U3. Typed launch rejection on the wire

**Goal:** `app.library.launch` response surfaces a discriminated `_tag` (`Accepted | PreflightRejected | DaemonRejected | HostUnavailable | LaunchFailed`) so callers can distinguish where the rejection originated. Existing fields stay populated additively to preserve back-compat.

**Requirements:** R6.

**Dependencies:** U2.

**Files:**
- Modify: `korri/products/app/api/library/launch.rpc.ts` — extend the response schema with the discriminated `_tag` union.
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts` — populate the `_tag` based on which guard fired.
- Modify: `korri/shared/stream/foreground-session-status.ts` if a shared rejection-shape lives there; otherwise add a new shared module under `korri/shared/api/`.
- Test: `korri/products/app/api/library/launch.rpc-handler.test.ts`

**Approach:**
- The five tags map to: U2 owner preflight (PreflightRejected), sessiond status returning busy (still PreflightRejected — the preflight consulted sessiond and saw busy), sessiond rejecting the `/managed-launch` POST itself (DaemonRejected — daemon saw a state transition between preflight and spawn), sessiond unreachable / token rejected (HostUnavailable), and process-level failures (LaunchFailed). Two preflight sub-flavors share the same tag because they're the same caller experience; the `reason` field discriminates further.
- Decide during implementation whether the union surfaces in the RPC `success` channel or the `error` channel; pattern-match on the surrounding `launch.rpc.ts` shape.
- Today's `status`, `failureKind`, and `exitCode` fields remain populated for any field that has a defined value, so a downstream caller that hasn't been updated does not break.

**Execution note:** Test-first on the discrimination matrix — one test per tag plus integration coverage for the additive back-compat fields.

**Patterns to follow:**
- Effect Schema tagged unions used elsewhere in the RPC layer (search for `Schema.TaggedUnion` or `Schema.TaggedStruct` in `korri/products/app/api/`).
- `envelope-guard.ts` middleware: confirm the route stays under its protection.

**Test scenarios:**
- Happy path: successful launch returns `{ _tag: "Accepted", sessionId, ... }`; existing `status: "ok"` field is preserved.
- Edge case: owner-local re-entry rejection → `{ _tag: "PreflightRejected", reason: { source: "owner-local", currentState, ... } }`; back-compat assertion: `failureKind === 'session-busy'`, `exitCode === 121`.
- Edge case: owner preflight consulted sessiond and saw busy → `{ _tag: "PreflightRejected", reason: { source: "sessiond", mode: "game", ... } }`; back-compat assertion: `failureKind === 'session-busy'`, `exitCode === 121`.
- Error path: sessiond accepted preflight but its internal status check (inside `spawnViaSessiond`, before the POST) saw mode change → `{ _tag: "DaemonRejected", reason: { source: "internal-status", ... } }`; back-compat assertion: `failureKind === 'session-busy'`, `exitCode === 121`.
- Error path: sessiond accepted preflight and its internal status check, but rejected the POST body (rare race) → `{ _tag: "DaemonRejected", reason: { source: "spawn-post", ... } }`; back-compat assertion: `failureKind === 'session-busy'`, `exitCode === 121`.
- Error path: sessiond unreachable (network) → `{ _tag: "HostUnavailable", reason: "network", ... }`; back-compat assertion: `failureKind === 'host-unavailable'`, `exitCode === 124`.
- Error path: sessiond returns 401 (token rejected) → `{ _tag: "HostUnavailable", reason: "token-rejected", ... }`; **back-compat assertion: `failureKind === 'host-control-disabled'`, `exitCode === 126`** (preserves the existing 401-mapping from `session-launcher.ts`).
- Error path: process spawned but exited non-zero → `{ _tag: "LaunchFailed", failureKind, exitCode, ... }`; pre-existing failureKind values preserved.
- Integration: a back-compat caller reading only `status` and `failureKind` (without the `_tag` field) sees the same values they would have seen pre-change for the cases that existed pre-change — explicitly including the 401-token-rejected case.

**Verification:**
- The five tags are each produced by the matrix above; the back-compat assertion holds for all pre-existing rejection cases.

---

### U4. Renderer atom reads `app.server.status`; delete legacy bridge

**Goal:** Replace the hardcoded `/__korri/desktop/foreground-session-status` endpoint with an `app.server.status`-backed source for `foregroundSessionGateStateAtom`. Renderer gate state reflects sessiond's live mode. Live-USB fixture path is preserved.

**Requirements:** R2, R3, R7.

**Dependencies:** None on U2/U3 strictly — this unit can land in parallel — but in practice should follow U1 so the design note exists before the code re-source.

**Files:**
- Modify: `korri/products/app/features/home/foreground-session-status-layer-live.ts` — `ForegroundSessionStatusSource.get()` reads `app.server.status` via the existing RPC client.
- Modify: `korri/products/app/stream/foreground-session-status-client.ts` — delete or refit the HTTP client; replace with the RPC-backed implementation.
- Modify: `korri/products/app/features/library/library-atoms.ts` — add a refresh policy (~1 s) to `foregroundSessionGateStateAtom`.
- Modify: `korri/deploy/desktop/main.ts` — delete the hardcoded `/__korri/desktop/foreground-session-status` endpoint registration.
- Modify: `korri/deploy/desktop/create-desktop-app.ts` — remove the Hono route wiring for the deleted endpoint.
- Test: `korri/products/app/features/home/foreground-session-status-layer-live.test.ts` (new or extended)
- Test: `korri/products/app/features/library/library-atoms.test.ts` (extended)

**Approach:**
- The atom polls at 1 Hz via `Atom.withRefresh(Duration.seconds(1))` + `Atom.autoDispose` from `effect/unstable/reactivity/Atom` (same import path `library-atoms.ts` already uses). No prior `withRefresh` use in the codebase; this is the first instance.
- `Atom.autoDispose` ensures polling stops when the home/library view unmounts. Without it, the 1 Hz polling leaks across navigation.
- `ShiftHomeReadyBody.tsx`'s existing `setInterval(refreshForegroundGate, 1000)` block is deleted so polling cadence lives at the atom seam only — leaving both alive doubles the probe rate.
- The mapper converts `SessiondLifecycleSummary.mode` → `ForegroundSessionStatusSnapshot.state` using the table in the High-Level Technical Design section. Emitting owner-vocabulary strings (`IdleReady`, `Spawning`, `Running`, `TearingDown`, `Recovering`) is required for `foregroundSessionGateStateFromSnapshot` (in `foreground-session-gate-state.ts`) to produce meaningful gate `_tag` values without modifying that switch. The downstream mapping that file already implements: `IdleReady → Ready`, `Spawning → Preparing`, `Running → Running`, `TearingDown → Cooling`, `Recovering → Recovering`. Any other value falls through to `{ _tag: 'Unknown', state }`.
- Live-USB path (`ForegroundSessionStatusLayerFixture`) is untouched.

**Execution note:** Test-first for the mapper and the refresh behavior. The deletion of the bridge endpoint is mechanical and covered by a smoke-level check (the route no longer responds).

**Patterns to follow:**
- `effect/unstable/reactivity/Atom` import path already used in `library-atoms.ts`; this unit adds the first `withRefresh` + `autoDispose` combinator usage.
- `app.server.status` RPC client construction pattern already used elsewhere in the renderer.
- Learning #8: standard `/api/rpc` path, no parallel bun routes.

**Test scenarios:**
- *Covers AE5.* Happy path: sessiond reports `home` → atom resolves to snapshot `state === 'IdleReady'`, gate-state `_tag: 'Ready'`.
- Mapper coverage: each row of the mapping table has an assertion that `SessiondLifecycleSummary.mode = X` produces snapshot `state === Y`. Specifically: `home → IdleReady`, `idle → IdleReady`, `starting → IdleReady`, `stopped → IdleReady`, `launching → Spawning`, `game → Running`, `restoring → TearingDown`, `recovering → Recovering`.
- Edge case: `app.server.status` returns a response with no `sessiond` field (sessiond not configured) → atom falls back to `state === 'IdleReady'`. (Matches today's hardcoded behavior; explicitly captured rather than deferred.)
- Error path: `app.server.status` RPC fails (network error) → atom surfaces an error state without crashing the renderer; next refresh recovers when the RPC succeeds.
- Edge case: rapid sessiond mode changes between two polls (e.g., `home → launching → game → restoring → home` faster than the refresh interval) → the atom reflects whatever the latest poll returned; no requirement to observe every intermediate state.
- Edge case: navigation away from the home/library view stops polling (verifiable by asserting no further `app.server.status` calls are made after unmount; covers `Atom.autoDispose` scope teardown).
- **Integration / Covers AE5 (end-to-end visibility, folded in from former U5):** managed launch in flight via `makeInMemoryLauncherLayer.createManagedControl()` → `app.server.status.sessiond.mode === 'game'` AND the atom resolves to snapshot `state === 'Running'` (gate `_tag: 'Running'`) within one refresh tick. Resolve the launcher: within one further tick, sessiond returns to `home`/`idle`, the atom resolves to `state === 'IdleReady'` (gate `_tag: 'Ready'`). This is the load-bearing assertion for R7.
- Integration: managed launch transitions through `restoring` → atom resolves to `state === 'TearingDown'` (gate `_tag: 'Cooling'`) on the next poll.
- Integration: sessiond unreachable mid-launch → status RPC reports the failure; atom surfaces an error state without crashing the renderer.
- **U4 validation step (added by deepening pass):** before declaring the plan verified, measure actual loopback HTTP latency on Sobo (sm8550) under representative game load with all three round-trips on the critical path. If measured worst case exceeds ~250 ms total, promote the deferred shared-subscription pattern into scope before merging.

**Verification:**
- `/__korri/desktop/foreground-session-status` returns 404 (route deleted) in production builds; live-USB fixture path remains functional.
- The renderer atom, when running against a sessiond fixture in `game`, returns a state distinguishable from `IdleReady` within one refresh tick.
- The standard `/api/rpc` path serves the call; no new bun-side route is added.
- The end-to-end visibility integration scenario above proves R7 without a separate implementation unit.

<!-- U5 was folded into U4's integration scenarios during the deepening pass. The numbering gap is intentional. -->

---

### U5. [Folded into U4]

*The end-to-end visibility test originally planned as U5 has been folded into U4's integration test scenarios. U4's integration assertions now cover the same `app.server.status` + atom cross-layer scenario the standalone U5 specified, plus the latency validation step on the Sobo target. The U5 number is preserved (not renumbered) per the plan's U-ID stability rule.*

*(Original U5 content moved into U4's integration scenarios. See the deepening note above.)*

---

## System-Wide Impact

- **Interaction graph:** Renderer atom → RPC client → `/api/rpc` → `app.server.status` → `probeSessiondStatus` → sessiond HTTP. Launch path: Renderer → `/api/rpc` → `app.library.launch` → ForegroundSessionOwner → `consultExternalIdle?` → sessiond status (round-trip 1); then `session-launcher.spawnViaSessiond` does its own internal status check (round-trip 2) before POSTing `/managed-launch` (round-trip 3). Three loopback round-trips per launch when sessiond is configured.
- **Error propagation:** Sessiond-unreachable surfaces as `HostUnavailable` on the launch path and as an error state on the status atom. Neither silently falls back to local-only execution. Token rejection (HTTP 401) is distinct from network unreachable in the launch response and preserves its existing `failureKind: 'host-control-disabled'` / exit code 126 mapping.
- **State lifecycle risks:** Two race windows: (1) between preflight read and `spawnViaSessiond`'s internal status check, and (2) between that internal check and the POST. Both later checks are authoritative — sessiond returns `DaemonRejected` (discriminated by `reason.source: 'internal-status' | 'spawn-post'`) which propagates as the new tag. No split-brain.
- **Concurrency:** The preflight `consultExternalIdle` is not an atomic read-modify-write across concurrent callers. Two concurrent `app.library.launch` calls could both see `idle` and both proceed; the owner's existing synchronous state check is the mutex. Explicit comment in `foreground-session-owner.ts`.
- **API surface parity:** The launch RPC response gains an additive `_tag` field. Existing fields preserved for back-compat. No other RPC contracts change. The `/__korri/desktop/foreground-session-status` route is removed.
- **Integration coverage:** U4's end-to-end integration scenario (managed launch in flight → both `app.server.status` and the renderer atom reflect `game`; resolve → both return to idle) proves the seam holds end-to-end. Unit tests on the mapper and the preflight hook would not, on their own, prove that an active sessiond launch is visible in the renderer atom.
- **Unchanged invariants:** Sessiond's wire protocol, capability-token mechanism, fail-closed contract, single-foreground-session-per-host rule, live-USB fixture path, source-machine idle-blank semantics (task-016 scope), and the game-stream-runner lifecycle routing (already shipped) are not touched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Preflight sessiond-status probe adds a third loopback round-trip to every launch (preflight GET + session-launcher's internal GET + POST). | All three are local (`http://127.0.0.1:<port>`) with 2 s timeouts. Desktop-class typical latency is sub-50 ms total; worst-case under ARM gaming load is unmeasured and could reach ~6 s if every probe degrades near its timeout. **Validation step in U4:** measure actual loopback latency on Sobo (sm8550) under representative game load before declaring the plan verified; if measured worst case exceeds ~250 ms total, promote the deferred shared-subscription pattern into scope before merging. |
| Polling at 1 Hz from the renderer leaks if the home/library view unmounts without disposing the atom scope. | U4 explicitly configures `Atom.autoDispose` (or equivalent) and includes an unmount test scenario. |
| The discriminated `_tag` change is potentially breaking for downstream callers if rolled out non-additively. | Existing fields (`status`, `failureKind`, `exitCode`) stay populated for all pre-existing cases; downstream callers that haven't been updated continue to work. U3 explicitly tests back-compat. |
| Sessiond's status endpoint becomes a hotter call site; if it fans out further (more polls, more callers), it could need a shared-subscription pattern. | Captured under Deferred to Follow-Up Work. Current scope is fine at 1 Hz from a single renderer. |
| The atom's `SessiondLifecycleSummary` → `ForegroundSessionStatusSnapshot` mapper risks vocabulary drift between the owner and sessiond state spaces. | Mapper is a single point of conversion; choice is captured in a comment; downstream consumers continue to consume the existing snapshot shape. |
| Race window between preflight read and spawn POST where sessiond changes mode. | Spawn POST is authoritative; sessiond returns `DaemonRejected` and the RPC response distinguishes it from `PreflightRejected`. |

---

## Documentation / Operational Notes

- The design note in `docs/solutions/architecture-patterns/` is the canonical reference for the lifecycle-truth decision going forward; future plans touching this area should cite it.
- No deployment or operational rollout changes. Sessiond's daemon-side wire protocol is untouched; existing config attrs (`services.korri.server.sessiond.url`, `services.korri.gameStream.sessiond.url`) continue to apply.
- The deleted bridge endpoint may be referenced by older renderer builds; in practice the renderer is deployed atomically with the server because both ship from the same Electrobun bundle, so no transition period concern.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md](../brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md)
- **Predecessor plans (all completed):**
  - [docs/plans/2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md](2026-05-26-006-feat-foreground-session-lifecycle-phase1-plan.md) — generic owner contract
  - [docs/plans/2026-05-26-012-feat-sessiond-managed-lifecycle-events-plan.md](2026-05-26-012-feat-sessiond-managed-lifecycle-events-plan.md) — sessiond as managed launcher adapter, `app.server.status` proxy decision
  - [docs/plans/2026-05-27-003-feat-sessiond-session-lifecycle-unification-plan.md](2026-05-27-003-feat-sessiond-session-lifecycle-unification-plan.md) — lifecycle-session intent routing
- **Backlog source:** `backlog/task-012 - make-sessiond-canonical-lifecycle-source.md`
- **Load-bearing institutional learnings:**
  - `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`
  - `docs/research/foreground-session-lifecycle/repo-research.md`
  - `docs/research/foreground-session-lifecycle/learnings-research.md`
  - `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md` (envelope-guard requirement)
  - `docs/solutions/runtime-errors/kiosk-renderer-local-launch-rpc-decode-failure-2026-05-27.md` (delete-the-bridge precedent)
  - `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` (why polling, not SSE)
  - `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` (fail-closed contract)
