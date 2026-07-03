---
title: "feat: Complete the play-recording loop (per-user, event-driven)"
type: feat
status: active
date: 2026-07-03
verify_command: "just test-unit"
---

# feat: Complete the Play-Recording Loop (Per-User, Event-Driven)

## Summary

Re-key play history from game to **(user, game)** with a default user for now, derive per-user stats at the read seam, and record one gated entry by **reacting to a "session ended" event** — for both direct and sessiond-managed launches — with a single shared store behind reads and writes. No timer, no history on the catalog.

---

## Problem Frame

The shipped play-log feature (`work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/`) built the model, derivation, importer, and surfaces, but three things are wrong or missing for real use:

1. **History is keyed by game only.** Play history is personal — it belongs to a `(user, game)` pair. Keying it to the game conflates shared catalog data with a user's private data and would have to be untangled once real users exist.
2. **No live recording on the device.** On sessiond-managed hosts (the primary path) the foreground owner hands terminal observation to sessiond after readiness, so game exits are never caught and no play is recorded.
3. **Reads and writes could use different stores.** The store is injected optionally into the repository (read) and launch owner (write), but nothing constructs one shared instance at the composition root, so recording has no observable effect.

The design was settled in follow-up discussion (see the three backlog items in Sources): per-user history, event-driven recording (no timer, duration = end − start), catalog stays history-free, and one shared store.

---

## Requirements

- R1. Play history is keyed by `(user, game)`; a default user id is used when no user is supplied.
- R2. Game and release records carry no play history; last-played / times-played / total playtime are derived **per requesting user** at the read seam.
- R3. Each play entry references the game and may optionally tag the release it was launched from; the release never owns the history.
- R4. Recording is triggered by a "session ended" event (a subscriber/reaction). No component ticks or counts during play; duration = end timestamp − start timestamp.
- R5. Recording fires for both direct (owner-observed) and sessiond-managed terminals, correlating sessiond's `launchId` back to the launch's `(user, game)`.
- R6. One shared durable store instance backs both the read projection and the recorder — a single source of truth.
- R7. Prefer a self-describing terminal where feasible; otherwise hold only per-launch pending context (keyed by `launchId`) until the terminal — never a background timer.

---

## Scope Boundaries

- No real multi-user "current user" resolution: reads and writes resolve to a single **default user** constant for now. Threading a per-request authenticated user is out of scope (data model is ready for it; the resolution is not).
- No new UI. Surfaces already read derived `playStats`; this plan does not change what they render.
- No change to how the catalog, launch RPC contract, or sessiond protocol are shaped on the wire (sessiond stays game-agnostic; correlation stays library-side).
- No play-count fidelity beyond one entry per session (importer-seeded history stays a single synthetic entry, unchanged from the shipped feature).
- No retroactive re-keying migration tooling: existing on-disk game-keyed logs (none in production; alpha) are not migrated — the store starts fresh under the new key.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/records/play-log.ts` — `PlayEntry`, `PlayLog`, `PlayStats`. Add optional `releaseId` to `PlayEntry`; give `PlayLog` the `(user, game)` identity.
- `product/platform/library/play-log-store.ts` — `PlayLogStore` (`load`/`record`), in-memory + file-backed. Re-key `load`/`record` to a `{ userId, gameId }` key.
- `product/platform/library/play-stats.ts` — `derivePlayStats` (unchanged aggregate), `qualifiesForPlayLog` gate, `seedPlayStats`.
- `product/platform/library/proseql/library-repository.ts` — `attachPlayStats` + `listPlayableEntries`. Derivation gains a resolved user id.
- `product/apps/portal/api/library/play-recording-observer.ts` — current start/exit observer keyed by game only; evolves into the per-user, per-launch coordinator.
- `product/apps/portal/api/library/local-foreground-launch-adapter.ts` — owner wiring; `onStateEntered` seam.
- `product/apps/portal/api/library/launch.rpc-handler.ts` — has `payload.id` (game), `payload.userId`, and mints `launchId`; the seed point for a launch's recording context.
- `product/platform/library/sessiond-managed-launch-event-observer.ts` — exposes an `exited` promise per `launchId` (the managed-path "ended" signal).
- `product/platform/library/sessiond-managed-launch-protocol.ts` — terminal events (`child-exited`, `terminated`) keyed by `launchId`, carrying exit info but **not** game id.
- `product/platform/library/config/records/user.ts` — `UserPayload`; home for a `DEFAULT_USER_ID` constant.
- Composition roots: `product/apps/portal/api/rpc-server.ts`, `product/apps/portal/api/hono-app.ts`, `product/apps/portal/api/library/foreground-session-host-layer.ts`.

### Institutional Learnings

- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond owns lifecycle truth on managed hosts; recording must consume sessiond's terminal, not re-derive it.

### External References

- None. All patterns are local; this is a refinement of shipped code.

---

## Key Technical Decisions

- **History key is `(user, game)`, with a `DEFAULT_USER_ID` stand-in.** The catalog entry stays history-free; `playStats` is a per-user overlay attached at read time. Real per-request user resolution is deferred, but the key and store are user-shaped now so multi-user is mechanical later.
- **Correlation lives library-side, not in sessiond.** sessiond only knows `launchId`. The library owns `(user, game, releaseId)` and seeds a per-launch pending record at launch, completing it when the launch's terminal fires. This keeps sessiond game-agnostic and avoids a wire-contract change (honors R7's fallback: one sticky note per launch, no timer).
- **One recording coordinator, two terminal sources.** A single coordinator reacts to "launch ended" regardless of whether the owner observed it (direct) or sessiond reported it (managed). Duration = end − start; nothing runs during play.
- **`releaseId` is provenance only.** Entries may tag the release they ran; aggregate stats (last-played / count / total) ignore it. This preserves one unified per-game history while keeping per-release detail available.
- **Store starts fresh under the new key.** No migration of game-keyed logs (alpha, none in production).

---

## Open Questions

### Resolved During Planning

- Where does "current user" come from for reads/writes? A `DEFAULT_USER_ID` constant now; per-request resolution deferred (Scope Boundaries).
- Can the "ended" event be self-describing? Not on the managed path without changing sessiond's contract; use library-side per-launch pending context instead (Key Decisions).
- Does the sessiond terminal carry the game id? No — it is keyed by `launchId` only (verified in `sessiond-managed-launch-protocol.ts`).

### Deferred to Implementation

- Exact on-disk layout of the file-backed store under the `(user, game)` key (nested dirs vs. encoded filename) — pick during implementation; the store contract is what matters.
- Whether the managed-path subscription reuses the existing `sessiond-managed-launch-event-observer` `exited` promise or a dedicated terminal read — confirm which is already alive for a managed launch at the handler seam.
- Precise start anchor for duration on the managed path (POST-accepted vs. Running) — choose the transition that best matches "time actually playing".

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
  LAUNCH (seed context)                     TERMINAL (react + record)
  ─────────────────────                     ─────────────────────────
  launch.rpc-handler                        Direct path:  owner onStateEntered
    knows: userId, gameId,                    ExitObserved ─┐
           releaseId, launchId                              │
        │  coordinator.beginLaunch(          Managed path: sessiond terminal
        │    { launchId, userId, gameId,       (exited by launchId) ─┐
        │      releaseId, startedAt })                               │
        ▼                                                            ▼
  pending[launchId] = { user, game, release, startedAt }   coordinator.completeLaunch(launchId, endedAt)
                                                                 │ resolve pending; gate;
                                                                 │ duration = endedAt - startedAt
                                                                 ▼
                                              store.record({ userId, gameId },
                                                { occurredAt: endedAt, durationSeconds, releaseId })

  READ (per-user overlay)
  ───────────────────────
  listPlayableEntries → attachPlayStats(entries, store, resolvedUserId = DEFAULT_USER_ID)
        for each entry: playStats = derivePlayStats(store.load({ userId, gameId: entry.id }).entries)
  (catalog entry itself carries no history)
```

---

## Implementation Units

### U1. Re-key play history by (user, game); tag entries with release

**Goal:** Change the stored identity of play history from game to `(user, game)`, add optional release provenance, and introduce the default user constant.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/config/records/play-log.ts` (add optional `releaseId` to `PlayEntry`; `PlayLog` carries `userId` + `gameId`)
- Modify: `product/platform/library/play-log-store.ts` (`load`/`record` take a `{ userId, gameId }` key; file-backed path derives from both)
- Modify: `product/platform/library/config/records/user.ts` (export `DEFAULT_USER_ID`)
- Test: `product/platform/library/config/records/play-log.test.ts`, `product/platform/library/play-log-store.test.ts`

**Approach:**
- Introduce a small `PlayHistoryKey = { userId, gameId }` and thread it through the store contract.
- File-backed store encodes both ids in the path; the gate stays exactly where it is (in `record`).
- `derivePlayStats` is unchanged — `releaseId` is provenance, ignored by aggregation.

**Execution note:** Test-first for the new key contract and the release-tag round-trip.

**Patterns to follow:** existing `PlayEntry`/`PlayLog` schema and `createFilePlayLogStore` encoding in the shipped feature.

**Test scenarios:**
- Happy path: record for `(userA, game1)`; loading `(userA, game1)` returns it; loading `(userB, game1)` is empty.
- Edge case: same game, two users — histories are independent.
- Happy path: an entry with a `releaseId` round-trips; `derivePlayStats` ignores it in totals.
- Edge case: gate still rejects a sub-threshold entry under the new key.

**Verification:** store reads/writes are keyed by `(user, game)`; entries can carry a release tag; `DEFAULT_USER_ID` is exported and used by callers.

---

### U2. Derive play stats per requesting user at the read seam

**Goal:** `listPlayableEntries` attaches `playStats` derived for a resolved user id (default for now), keeping the catalog entry history-free.

**Requirements:** R2, R6

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/proseql/library-repository.ts` (`attachPlayStats` gains a resolved `userId`; loads `{ userId, gameId: entry.id }`)
- Test: `product/platform/library/proseql/library-repository.test.ts`

**Approach:**
- Resolve the read-side user to `DEFAULT_USER_ID` for now (single injection point so per-request threading is a later one-line change).
- Entry stays a shared catalog object; `playStats` is the per-user overlay.

**Patterns to follow:** the shipped `attachPlayStats` step in `listPlayableEntries`.

**Test scenarios:**
- Happy path: a play recorded for the default user surfaces as `playStats` on that game's entry.
- Edge case: a game with no history for the default user reads as never played (playCount 0).
- Edge case: history recorded for a non-default user does **not** surface for the default user's read.

**Verification:** list entries carry per-user derived `playStats`; catalog records contain no history.

---

### U3. Event-driven recording coordinator (replaces the game-only observer)

**Goal:** A single coordinator that seeds per-launch context and records one gated, per-user entry when a launch's terminal fires — no timer.

**Requirements:** R4, R7

**Dependencies:** U1

**Files:**
- Create: `product/apps/portal/api/library/play-recording-coordinator.ts`
- Remove: `product/apps/portal/api/library/play-recording-observer.ts` (superseded)
- Modify: `product/apps/portal/api/library/local-foreground-launch-adapter.ts` (owner terminal calls `completeLaunch`)
- Test: `product/apps/portal/api/library/play-recording-coordinator.test.ts`

**Approach:**
- `beginLaunch({ launchId, userId, gameId, releaseId, startedAt })` stores per-launch pending context (keyed by `launchId`).
- `completeLaunch(launchId, endedAt)` resolves the pending context, computes `durationSeconds = endedAt − startedAt`, and records for `(userId, gameId)` with the `releaseId` tag; gate applies in `store.record`.
- Direct path: the owner's `ExitObserved` transition calls `completeLaunch`. Nothing polls; the coordinator is idle between the two events.

**Execution note:** Test-first; the begin/complete logic is the behavioral core.

**Patterns to follow:** the shipped `createPlayRecordingObserver` (Running→ExitObserved), generalized to explicit begin/complete keyed by `launchId`.

**Test scenarios:**
- Happy path: begin then complete → one entry with the running-to-exit duration for `(user, game)`, tagged with the release.
- Edge case: complete for an unknown `launchId` (no begin) records nothing.
- Edge case: sub-threshold duration is gated out.
- Edge case: double complete for the same `launchId` records exactly once.
- Error path: `store.record` throwing is swallowed (recording never breaks teardown).

**Verification:** recording is a reaction to begin/complete events; no timer exists; duration is derived from the two timestamps.

---

### U4. Correlate and record on sessiond-managed terminals

**Goal:** On managed launches, seed the coordinator at launch and complete it when sessiond reports the launch's terminal — closing the primary-path gap.

**Requirements:** R4, R5

**Dependencies:** U3

**Files:**
- Modify: `product/apps/portal/api/library/launch.rpc-handler.ts` (call `beginLaunch` with `userId ?? DEFAULT_USER_ID`, `gameId = payload.id`, `releaseId`, `launchId`; subscribe to the launch's terminal and call `completeLaunch`)
- Test: `product/apps/portal/api/library/launch.rpc-handler.test.ts`

**Approach:**
- Reuse the existing managed-launch terminal signal (`sessiond-managed-launch-event-observer` `exited` by `launchId`); when it resolves, `completeLaunch(launchId, now)`.
- gameId/userId come from the pending context, not from sessiond (which only carries `launchId`).
- Keep the subscription lightweight and lifecycle-bounded to the launch; no long-lived timer.

**Execution note:** Start with a failing test that a simulated managed terminal records exactly one gated play for the correct `(user, game)`.

**Patterns to follow:** existing `launchId` correlation in `launch.rpc-handler.ts`; the observer's `exited` promise contract.

**Test scenarios:**
- Covers R5. Happy path: a managed launch that ends records one entry for `(default user, payload.id)`.
- Edge case: a launch that fails before running records nothing.
- Edge case: a streamed/managed session records identically to a direct one.
- Integration: launch handler seeds begin and the terminal subscription completes it end-to-end with a fake sessiond terminal.

**Verification:** device (managed) plays record for the current (default) user; no game exit is missed on the primary path.

---

### U5. Wire one shared store through the composition root

**Goal:** Construct a single durable play-log store and hand the same instance to the repository (read) and the coordinator (write).

**Requirements:** R6

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `product/apps/portal/api/rpc-server.ts` and/or `product/apps/portal/api/hono-app.ts` (create `createFilePlayLogStore` in a durable state dir; pass to `createLibraryRepository` and the coordinator)
- Modify: `product/apps/portal/api/library/foreground-session-host-layer.ts` (thread the coordinator/store into the owner + launch handler)
- Test: an integration test beside the composition root

**Approach:**
- One `createFilePlayLogStore(<state-dir>)` instance; both read and write reference it.
- Centralize default-user resolution so read and record agree.

**Test scenarios:**
- Integration: a play recorded during a (fake) session is visible as `playStats` on the next library list — proving read and write share the store.
- Edge case: absent state dir is created on first record.

**Verification:** recording has an observable effect on subsequent reads through the real composition; one store instance, one source of truth.

---

## System-Wide Impact

- **Interaction graph:** launch handler → coordinator.beginLaunch → (owner terminal | sessiond terminal) → coordinator.completeLaunch → store; library list → attachPlayStats(user) → store. Two terminal sources feed one coordinator.
- **Error propagation:** recording is best-effort — a `store.record` failure logs via `@shared/logger` and never blocks launch, teardown, or the RPC response.
- **State lifecycle risks:** pending context leak if a launch never terminates (bound it to the launch lifecycle / evict on completion); double-record across owner + sessiond both firing for one launch (idempotent complete keyed by `launchId`).
- **API surface parity:** the store contract changes shape (`{ userId, gameId }`); every caller (repository read, coordinator write, tests, dev-lab seed) moves together.
- **Unchanged invariants:** the `app.library.launch` RPC contract, the sessiond managed-launch protocol, and the catalog record shapes are unchanged; recording remains a passive observer.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Owner and sessiond both fire a terminal for one launch → double record | `completeLaunch` is idempotent per `launchId` (first completion wins) |
| Pending context never completes (crash / lost terminal) | Bind pending entries to the launch lifecycle; accept a dropped entry over a leak; no timer to strand |
| Re-keying the store breaks the shipped store-projection test/dev-lab seed | Move all store callers to `(user, game)` in U1/U2 as one coherent change |
| "Default user" hardcoding leaks into places that later need real users | Single `DEFAULT_USER_ID` resolution point; per-request threading is a bounded follow-up |

---

## Sources & References

- Design decisions (backlog): `01KWMW4X8CXS78K3Q01CDC9B82` (per-user, event-driven model), `01KWMCW3NWVD7H8ZEGBHJRJ8T0` (sessiond terminal hook), `01KWMCW3NYWBCPCAAZPTEB6Y6S` (shared store)
- Shipped foundation: `work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/plan.md`
- Recording seam: `product/apps/portal/api/library/play-recording-observer.ts`, `product/apps/portal/api/library/launch.rpc-handler.ts`
- Managed terminal: `product/platform/library/sessiond-managed-launch-event-observer.ts`, `product/platform/library/sessiond-managed-launch-protocol.ts`
