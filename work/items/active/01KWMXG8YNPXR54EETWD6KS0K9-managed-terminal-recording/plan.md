---
title: "feat: Complete play recording on the sessiond-managed terminal"
type: feat
status: active
date: 2026-07-03
verify_command: "just test-unit"
---

# feat: Complete Play Recording on the Sessiond-Managed Terminal

## Summary

Reuse the managed launch's already-observed `session.exited` promise to call `coordinator.completeLaunch(launchId)` when a game exits — closing the one remaining gap so device (sessiond-managed) plays record, not just direct launches.

---

## Problem Frame

The per-user recording loop is built and on `trunk`: the coordinator (`beginLaunch`/`completeLaunch`), the `(user, game)` store, the shared read/write store, and direct-path completion via the owner's `ExitObserved`. But on sessiond-managed hosts — the primary device path — the foreground owner hands terminal observation to sessiond after readiness and never fires `ExitObserved`, so `completeLaunch` is never called and device plays are silently not recorded. This is the last wire. See origin: `work/items/active/01KWMXG8YNPXR54EETWD6KS0K9-managed-terminal-recording/item.md`.

---

## Requirements

- R1. When a sessiond-managed launch's game exits, `coordinator.completeLaunch(launchId)` is called exactly once, recording one gated per-user play.
- R2. `userId`/`gameId`/`releaseId` come from the coordinator's pending context (seeded at launch), never from sessiond (which only knows `launchId`).
- R3. Completion is idempotent with the direct (owner `ExitObserved`) path — if both fire for one launch, exactly one entry is recorded.
- R4. No second sessiond subscription is opened per launch; the existing observer's terminal signal is reused.
- R5. Recording remains best-effort — a failure to observe or record never breaks launch, teardown, or the RPC response.

---

## Scope Boundaries

- No change to the sessiond managed-launch protocol, the `app.library.launch` contract, or the store/coordinator contracts (all already in place).
- No real multi-user resolution — writes still resolve to the default user via the seeded context.
- No duration-anchor rework — duration stays `end − start` from the coordinator's seeded `startedAt` (managed-path start-anchor precision is a separate concern if it ever matters).
- No handling of launches that never terminate beyond letting the pending context be dropped (no new timer/reaper).

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/session-launcher.ts` — `spawnViaSessiond` already calls `observeSessiondManagedLaunchEvents` and returns `ManagedLaunchResult` with `session.exited` / `session.ready`. This is the terminal signal to reuse.
- `product/platform/stream/foreground-session-owner.ts` — `ForegroundManagedSessionHandle.exited: Promise<{ exitCode }>`; the handle flows to the adapter's `SpawnedLocalLaunch.session`.
- `product/apps/portal/api/library/local-foreground-launch-adapter.ts` — the adapter where the session handle and the recording coordinator meet. Currently: `completeRecordingOnExit` on the owner's `ExitObserved` (direct path); `spawnLocalLaunch` produces `SpawnedLocalLaunch.session`; `PreparedLocalLaunch` does not yet carry `launchId`.
- `product/apps/portal/api/library/play-recording-coordinator.ts` — `completeLaunch(launchId, endedAt?)`, idempotent per `launchId`, gate + per-user record.
- `product/apps/portal/api/library/launch.rpc-handler.ts` — already seeds `beginLaunch(launchId, userId, gameId, releaseId, startedAt)` for each launch.

### Institutional Learnings

- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond owns lifecycle truth on managed hosts; consume its terminal rather than re-deriving it.

### External References

- None. All local; a small wiring refinement of shipped code.

---

## Key Technical Decisions

- **Reuse `session.exited`; do not open a second SSE stream.** `spawnViaSessiond` already observes the launch's terminal and surfaces `session.exited`. Registering `session.exited.then(() => completeLaunch(launchId))` reuses that one observer — simpler and cheaper than the fresh `observeSessiondManagedLaunchEvents` subscription the backlog item floated (R4). The backlog's "second subscription" wording is superseded by this cleaner seam.
- **Wire at the adapter, not the handler.** The session handle lives in the adapter (`SpawnedLocalLaunch.session`), and the coordinator is already an adapter dependency. The handler cannot reach `session.exited`. Keeping the wire at the adapter respects the boundary (no new platform→app import) and reuses the handle already in hand.
- **`launchId` rides on `PreparedLocalLaunch`.** The exit hook needs the launch's id to complete the right pending context; thread `request.launchId` through `prepare` so `spawnLocalLaunch` (and the exit hook) can key completion. The owner's `active.requestId` equals `launchId`, so the direct path stays consistent.
- **The exit hook covers both paths; idempotency makes coexistence safe.** `session.exited` resolves for direct and managed launches alike, so the hook alone would suffice — but the existing owner `ExitObserved` completion is kept as belt-and-suspenders. `completeLaunch`'s per-`launchId` dedupe guarantees one record (R3).
- **Best-effort.** The exit hook is a detached `.then`/`.catch`; failures are swallowed so teardown and the RPC are never blocked (R5).

---

## Open Questions

### Resolved During Planning

- How is the managed terminal observed? It already is — `session.exited` from `spawnViaSessiond` (verified in `session-launcher.ts`); no new subscription needed.
- Where to wire completion? The adapter, where the session handle and coordinator meet.
- How does `gameId`/`userId` reach the record on the managed path? From the coordinator's seeded pending context, keyed by `launchId`; sessiond only supplies the exit event.

### Deferred to Implementation

- Whether to retire the owner `ExitObserved` completion once the `exited` hook covers both paths, or keep both. Default: keep both (idempotent); consolidate only if it simplifies without losing the direct-only path.
- Exact place to register the exit hook inside the adapter (in `spawnLocalLaunch`'s success branch vs. the spawn closure) — pick whichever keeps `launchId` + coordinator in scope with least churn.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
  launch handler ── beginLaunch(launchId, user, game, release, startedAt) ──► coordinator.pending

  adapter.spawn(prepared)               prepared now carries launchId
    └─ spawnLocalLaunch → SpawnedLocalLaunch.session  (ForegroundManagedSessionHandle)
         │
         ├─ session.exited.then(() ─────────────────────────────┐   (managed terminal,
         │     => coordinator.completeLaunch(launchId))         │    already observed by
         │                                                      │    spawnViaSessiond)
         └─ owner reaches Running, then hands off to sessiond   │
                                                                ▼
  owner ExitObserved (direct only) ── completeLaunch(requestId=launchId) ──► coordinator
                                                                │
                          completeLaunch is idempotent per launchId — first wins
                                                                ▼
                          store.record({user,game}, {occurredAt, durationSeconds, releaseId})
```

---

## Implementation Units

### U1. Complete recording on the managed terminal via `session.exited`

**Goal:** When a launch's `session.exited` resolves, complete its recording — covering the sessiond-managed path the owner never reaches.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** None (builds on shipped coordinator + adapter)

**Files:**
- Modify: `product/apps/portal/api/library/local-foreground-launch-adapter.ts` (thread `launchId` onto `PreparedLocalLaunch` in `prepare`; register `session.exited.then(() => coordinator.completeLaunch(launchId))` on a successful spawn; detached + `.catch`)
- Test: `product/apps/portal/api/library/local-foreground-launch-adapter.test.ts`

**Approach:**
- Add `launchId` to `PreparedLocalLaunch`; copy `request.launchId` in `prepare`.
- Where the coordinator is in scope (inside `createLocalForegroundLaunchOwner`), wrap/observe the spawn so that on a `started` `SpawnedLocalLaunch` it registers the exit hook: `void session.exited.then(() => coordinator.completeLaunch(prepared.launchId)).catch(...)`.
- Leave the owner `ExitObserved` completion in place; rely on `completeLaunch` idempotency for coexistence.
- Do nothing when no coordinator is wired (behavior unchanged).

**Execution note:** Test-first — assert a resolving `session.exited` drives exactly one `completeLaunch`.

**Patterns to follow:**
- The existing `completeRecordingOnExit` / coordinator wiring in `local-foreground-launch-adapter.ts`.
- `session.exited` usage shape in `product/platform/library/session-launcher.ts` and `sessiond-managed-launch-event-observer.ts`.

**Test scenarios:**
- Happy path: a spawn whose `session.exited` resolves triggers `completeLaunch(launchId)` once; with a seeded pending context, one gated per-user entry is recorded.
- Edge case: a spawn that fails (no session) registers no exit hook and records nothing.
- Error path: `session.exited` rejecting (or `completeLaunch` throwing) is swallowed — no unhandled rejection, launch/teardown unaffected.
- Edge case (no coordinator): with no coordinator wired, spawn behaves exactly as before.

**Verification:** a resolving managed `exited` records one play for the launch's `(user, game)`; direct-path behavior and the RPC response are unchanged.

---

### U2. End-to-end managed-terminal recording proof

**Goal:** Prove seed→managed-exit→record end to end through the real coordinator + store, and that direct + managed completions don't double-record.

**Requirements:** R1, R3

**Dependencies:** U1

**Files:**
- Test: `product/apps/portal/api/library/local-foreground-launch-adapter.test.ts` (extend) or `product/apps/portal/api/library/foreground-session-host-layer.test.ts`

**Approach:**
- Build a host/owner with an in-memory store (real coordinator via `createForegroundSessionHost({ playLogStore })`).
- Seed a launch's context (`beginLaunch`), resolve a fake `session.exited`, and assert one entry lands for `(default user, gameId)` with the seeded release tag.
- Fire both a fake managed `exited` and an owner `ExitObserved` for the same `launchId`; assert exactly one entry (idempotency).

**Execution note:** Integration-style — real coordinator + in-memory store, fake session handle; no mocks of the recording seam.

**Test scenarios:**
- Integration: seed + managed `exited` → exactly one gated per-user entry with the release tag.
- Integration: managed `exited` and owner `ExitObserved` both fire for one `launchId` → exactly one entry.
- Edge case: sub-threshold duration → no entry (gate holds through the managed path).

**Verification:** the managed path records per-user plays end to end; direct + managed completions are idempotent.

---

## System-Wide Impact

- **Interaction graph:** launch handler `beginLaunch` → adapter registers `session.exited` hook → `completeLaunch`; owner `ExitObserved` → `completeLaunch`. Two terminal sources, one idempotent completion.
- **Error propagation:** exit-hook and record failures are swallowed and logged; never block launch, teardown, or the RPC.
- **State lifecycle risks:** double-completion across the two terminal sources (handled by `launchId` dedupe); a never-terminating launch leaves a pending context (dropped, no leak beyond a map entry — no new timer added).
- **API surface parity:** none — no wire/contract changes; purely an internal wiring addition.
- **Unchanged invariants:** the sessiond protocol, `app.library.launch`, the store/coordinator contracts, and direct-path behavior are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `session.exited` never resolves (lost terminal / crash) | Accept a dropped entry over a leak; no new reaper. The pending map entry is small and bounded per launch |
| Double record if both terminals fire | `completeLaunch` idempotency per `launchId` (already implemented and tested) |
| Threading `launchId` onto `PreparedLocalLaunch` ripples to other adapter callers | Additive optional-to-required field on an internal type; contained to the adapter |
| Unhandled promise rejection from the detached hook | Attach `.catch`; recording is best-effort |

---

## Sources & References

- **Origin item:** `work/items/active/01KWMXG8YNPXR54EETWD6KS0K9-managed-terminal-recording/item.md`
- Predecessor plan: `work/items/active/01KWMWAT06R3JG4FBR7VTDYNCV-play-recording-loop/plan.md`
- Terminal signal: `product/platform/library/session-launcher.ts` (`session.exited`), `product/platform/library/sessiond-managed-launch-event-observer.ts`
- Wiring seam: `product/apps/portal/api/library/local-foreground-launch-adapter.ts`
- Completion: `product/apps/portal/api/library/play-recording-coordinator.ts`
