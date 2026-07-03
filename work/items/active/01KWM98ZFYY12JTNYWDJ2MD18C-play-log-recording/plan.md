---
title: "feat: Play log recording and derived play stats"
type: feat
status: active
date: 2026-07-03
origin: work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/requirements.md
verify_command: "just test-unit"
---

# feat: Play Log Recording and Derived Play Stats

## Summary

Store an append-only per-game **play log** as the sole truth for play history; derive last-played, times-played, and total-playtime from it at the library read seam; and record one gated entry each time a Korri-launched session ends. Big-bang replaces the authored `userData.lastPlayed`/`playtime` fields — no backwards compatibility.

---

## Problem Frame

Launching a game inside Korri never updates its own history: the recency sort and "Continue" affordance on the home screen are frozen at whatever the previous-system import wrote. As native play grows, the surfaces meant to reflect recent activity drift further from the truth, and there is no record at all of how much or how often anything was played in Korri. See origin: `work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/requirements.md`.

---

## Requirements

- R1. Playing a game in Korri appends one entry (occurrence time + duration) to that game's play log. (origin R1, R2)
- R2. A threshold gates what gets logged; default `0` (any real session), designed to be tuned later without touching recording logic. (origin R3)
- R3. Sub-threshold sessions are never written — gate at the door. (origin R4)
- R4. A play counts regardless of where the game runs (local or streamed). (origin R5)
- R5. Last-played, times-played, and total-playtime are derived from the log, never stored independently. (origin R6, R7, R8)
- R6. A game with an empty/absent log reads as never played. (origin R9)
- R7. Existing surfaces (home recency sort, "Continue", playtime label, detail stats) reflect the derived values on next read. (origin R10)
- R8. The prior single-date `userData.lastPlayed`/`playtime` representation is removed; the play log is the sole stored representation. No dual-model support. (origin R11)
- R9. Any stored/seed/config/fixture data in the old shape is regenerated into the new shape; no runtime backwards-compatibility path. (origin R12)
- R10. The previous-system importer produces data in the new shape. (origin R13)

**Origin acceptance examples:** AE1 (covers R1/R5), AE2 (covers R2/R3), AE3 (covers R6), AE4 (covers R4), AE5 (covers R7 recency ordering).

---

## Scope Boundaries

- No user-facing control to change the threshold — it stays `0`; only the mechanism accepts a different value.
- No new home/detail UI beyond feeding existing recency sort, "Continue", and playtime displays.
- No ability to re-judge past short sessions when the threshold later rises (gate, not lens).
- Nothing richer than time + duration per session (no save-state hooks, achievements, per-session notes).
- `favorite` is untouched — it stays an authored attribute, not derived from the log.
- No backwards compatibility with the old single-date model.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/records/game.ts` — `GameUserData` (the `lastPlayed`/`playtime`/`favorite` shape being split). Effect Schema `Schema.Struct` pattern to mirror for new record types.
- `product/platform/library/config/records/library-item.ts` — `LibraryItemPayload` / `ContainedPlayablePayload` carry `userData`; both are read at the projection seam.
- `product/platform/library/proseql/library-repository.ts` — `KorriLibraryRepository` interface with `upsert*` capabilities and `toPlayableLibraryEntry()` (the read projection that assembles `userData`). Non-canonical collections (`games`, `apps`, `config`) are precedent for a store not declared in the readable YAML config graph.
- `product/platform/library/proseql/library-db-core.ts` — `collectionsSchema` / `KorriLibraryDb` collection wiring; `keyedCollection` helper.
- `product/platform/library/playable-library.ts` — `PlayableGame` / read entry shape carrying `userData` to consumers.
- `product/platform/stream/foreground-session-owner.ts` — session lifecycle owner tracking `identity.gameId`, `sessionId`, and terminal exit transitions (`Running` → `ExitObserved` → `TearingDown`). The recording seam.
- `product/platform/library/rocknix/gamelist.ts` + `product/platform/library/rocknix/rocknix-source.ts` — importer parsing `<lastplayed>`/`<gametime>`/`<playcount>` and `compareByLastPlayedDesc` (reads `userData.lastPlayed`).
- Surfaces reading play stats today: `product/surfaces/web/shift/config.tsx` (`relativeLastPlayed`, `toGame`), `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`, `product/surfaces/web/shift/pages/shift-library-query.ts`, `product/surfaces/web/shift/pages/shift-library-sections.ts`, `product/surfaces/web/shift/pages/shift-library-game.ts` (`lastPlayedAt`), and the detail views (`ShiftDetailStats.tsx`, `shift-detail-copy.ts`).

### Institutional Learnings

- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond is the lifecycle truth; the foreground-session owner mirrors it. Recording must consume the owner's terminal transition, not re-derive lifecycle from process signals.

### External References

- None. All patterns are local (Effect Schema records, proseql repository capabilities, existing surface adapters).

---

## Key Technical Decisions

- **Play log stored as a per-game document, keyed by playable id, in the writable library store — not the readable YAML config graph.** Play history is high-churn runtime user-state, unlike authored config. Model as `PlayLog { playableId, entries: PlayEntry[] }` where `PlayEntry = { occurredAt, durationSeconds }`; appending is a read-modify-write of the keyed document. Single-user alpha makes this concurrency-simple.
- **Derive at the read projection; expose a distinct `playStats` object, not the old field names.** `toPlayableLibraryEntry` joins the play log and attaches `playStats { lastPlayed?, playCount, totalPlaytimeSeconds }`. Reusing `userData.lastPlayed` would blur authored-vs-derived on one field name and undercut the "no dual model" intent. Authored `userData` keeps only `favorite`.
- **Threshold is a config value, default `0`, gate applied at write (`durationSeconds >= threshold`).** Inclusive boundary; `0` logs any session that started. No UI, no read-time re-judging.
- **Importer seeds one synthetic entry per imported game that has a last-played date** (`occurredAt = imported lastPlayed`, `durationSeconds = imported gametime ?? 0`). Preserves day-one recency ordering. Times-played fidelity is intentionally lossy (starts at 1 even if the old `playcount` was higher) — acceptable at alpha; see Alternatives.
- **Recording is triggered from the foreground-session terminal transition but the library write is performed at the composition boundary that owns the writable store.** The stream-layer owner must not import the library repository directly (surface/boundary rule); it exposes the terminal (gameId + timing), and the composing daemon calls `recordPlay`.

---

## Open Questions

### Resolved During Planning

- Log storage shape: per-playable `PlayLog` document in the writable proseql store (see Key Decisions).
- Importer old-data handling: seed a single entry from the imported last-played date (see Key Decisions).
- Derived-vs-stored surface shape: distinct derived `playStats`, authored `userData` keeps only `favorite`.

### Deferred to Implementation

- Which composed process owns the writable library store at session-end time and is therefore the correct place to call `recordPlay` (daemon vs. a library service layer). U4 confirms this against the live composition before wiring; if no writable-store owner observes the terminal today, U4 adds the minimal subscription rather than moving the write into the stream layer.
- Exact start-time anchor for duration: session `Running` entry vs. spawn time. Pick the transition that best matches "time actually playing" when wiring U4; both are available on the owner.
- Whether `playableId` keys on the item id or the full contained playable id — follow whatever `toPlayableLibraryEntry` uses as the stable entry id.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
  RECORD (write path)                          READ (projection path)
  ─────────────────────                        ──────────────────────
  foreground-session-owner                     library repository
    terminal: gameId + start + end               toPlayableLibraryEntry(entry)
        │                                             │  loads PlayLog[playableId]
        │ (gameId, durationSeconds, occurredAt)       │
        ▼                                             ▼
  composition boundary  ── recordPlay ──►  PlayLog store   ──►  derivePlayStats(entries)
        │  gate: durationSeconds >= threshold          (keyed        │
        │  (below threshold → no write)                 by id)       ▼
        ▼                                                     playStats {
  PlayLog[playableId].entries += { occurredAt, durationSeconds }   lastPlayed?      = max(occurredAt)
                                                                    playCount       = entries.length
                                                                    totalPlaytime   = Σ durationSeconds
                                                                  }
                                                             │
                            surfaces (home recency sort, "Continue",
                            playtime label, detail stats) read playStats
```

---

## Implementation Units

### U1. Play-log data model and threshold config

**Goal:** Define the stored play-log records and the gate threshold config value.

**Requirements:** R1, R2, R5, R8

**Dependencies:** None

**Files:**
- Create: `product/platform/library/config/records/play-log.ts`
- Modify: `product/platform/library/config/records/game.ts` (drop `lastPlayed`/`playtime` from `GameUserData`; keep `favorite`)
- Test: `product/platform/library/config/records/play-log.test.ts`

**Approach:**
- `PlayEntry` = `{ occurredAt: Date/DateFromString, durationSeconds: number }`; `PlayLog` = `{ playableId, entries: readonly PlayEntry[] }`, mirroring the `Schema.Struct` style in `game.ts`.
- Introduce the derived view type `PlayStats = { lastPlayed?, playCount, totalPlaytimeSeconds }` (derived only, never authored).
- Threshold: a single config value (seconds), default `0`. Co-locate with the play-log records or the config-cascade defaults; expose a typed accessor so U2/U4 read one source.

**Execution note:** Implement schema + threshold default test-first.

**Patterns to follow:**
- `GameUserData` struct and `Schema.Union([Schema.Date, Schema.DateFromString])` in `product/platform/library/config/records/game.ts`.

**Test scenarios:**
- Happy path: decode a `PlayLog` with two entries; encode/decode round-trips dates.
- Edge case: empty `entries` decodes cleanly.
- Edge case: `GameUserData` no longer accepts `lastPlayed`/`playtime` (excess-property rejection under STRICT), still accepts `favorite`.
- Happy path: threshold default resolves to `0` when unset.

**Verification:**
- New record types compile and are exported; `just test-unit` covers the record and threshold-default tests.

---

### U2. Repository capability: recordPlay + play-stats derivation

**Goal:** Add the writable `recordPlay` capability (gated append) and the pure `derivePlayStats` helper.

**Requirements:** R1, R2, R3, R5, R6

**Dependencies:** U1

**Files:**
- Modify: `product/platform/library/proseql/library-repository.ts` (add `recordPlay` to `KorriLibraryRepository`; add play-log load/upsert)
- Create: `product/platform/library/play-stats.ts` (pure `derivePlayStats(entries) -> PlayStats`)
- Test: `product/platform/library/play-stats.test.ts`
- Test: `product/platform/library/proseql/library-repository.test.ts` (extend)

**Approach:**
- `recordPlay(playableId, entry, opts?)`: if `entry.durationSeconds >= threshold`, read-modify-write the keyed `PlayLog` document appending the entry; else no-op (gate at the door). Threshold sourced from U1.
- `derivePlayStats(entries)`: `lastPlayed = max(occurredAt)` (Option/undefined when empty), `playCount = entries.length`, `totalPlaytimeSeconds = Σ durationSeconds`. Pure and independently unit-tested.
- Store `PlayLog` in the writable proseql db as a non-canonical keyed collection (precedent: legacy `games`/`config` collections not in the readable YAML graph).

**Execution note:** Implement `derivePlayStats` and the gate test-first; they are the behavioral core.

**Patterns to follow:**
- `upsert<T>()` and the `KorriLibraryRepository` capability list in `product/platform/library/proseql/library-repository.ts`.

**Test scenarios:**
- Covers AE1. Happy path: record one 35-min entry onto an empty log → log has 1 entry; `derivePlayStats` → lastPlayed = that time, playCount 1, total 2100s.
- Covers AE2. Edge case: with threshold 120s, a 30s entry is not written; log unchanged.
- Happy path: threshold 0 records a 0-duration entry (inclusive boundary).
- Covers AE3. Edge case: `derivePlayStats([])` → no lastPlayed, playCount 0, total 0.
- Happy path: three entries across days → lastPlayed = newest, playCount 3, total = sum.
- Integration: `recordPlay` then reload repository → appended entry persists.

---

### U3. Inject derived playStats into the read projection

**Goal:** Attach derived `playStats` to playable read entries; drop authored last-played/playtime from the carried `userData`.

**Requirements:** R5, R6, R7, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `product/platform/library/proseql/library-repository.ts` (`toPlayableLibraryEntry` loads the play log and attaches `playStats`)
- Modify: `product/platform/library/playable-library.ts` (read entry shape gains `playStats`; `userData` narrows to `favorite`)
- Test: `product/platform/library/proseql/library-repository.test.ts` (extend)

**Approach:**
- In `toPlayableLibraryEntry`, load `PlayLog[entryId]` and set `playStats = derivePlayStats(entries)`. Absent log → empty stats (never-played).
- Batch-load play logs for a `list()` call to avoid N reads where the read path already batches; follow the existing list assembly.

**Patterns to follow:**
- Existing `toPlayableLibraryEntry` merge of `metadata`/`userData` in `product/platform/library/proseql/library-repository.ts`.

**Test scenarios:**
- Covers AE1/AE5. Happy path: a game with a recorded entry lists with correct `playStats`.
- Covers AE3/AE6. Edge case: a game with no log lists as never played (empty `playStats`).
- Edge case: authored `favorite` still surfaces on `userData`; no `lastPlayed`/`playtime` present.

**Verification:**
- Repository `list()`/`get()` return `playStats`; existing repository tests updated to the new shape pass.

---

### U4. Record a play at session end (gated)

**Goal:** Capture `gameId` + duration + occurrence at the foreground-session terminal and call `recordPlay`, gated by threshold, at the correct composition boundary.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U2

**Files:**
- Modify: `product/platform/stream/foreground-session-owner.ts` (expose terminal identity + timing if not already observable to the composer)
- Modify: the composing daemon/service that owns the writable library store (confirm during implementation — candidates under `product/services/device/` / `product/platform/library/library-services.ts`)
- Test: `product/platform/stream/foreground-session-owner.test.ts` (extend) and a recording-hook test beside the composer

**Approach:**
- On the owner's terminal transition (`ExitObserved`/`TearingDown`), the composer receives `{ gameId, occurredAt, durationSeconds }` and calls `recordPlay`. Duration from the owner's own start anchor (see Deferred to Implementation).
- The stream-layer owner must not import the library repository — keep the write on the composing side to respect the surface/boundary rule.
- A play counts regardless of local vs. streamed: hook the owner's terminal, which fires for both.

**Execution note:** Start with a failing test asserting "terminal transition with gameId+duration triggers exactly one gated recordPlay".

**Patterns to follow:**
- The owner's existing `transition(...)`/terminal handling and `identity.gameId` usage in `product/platform/stream/foreground-session-owner.ts`.
- Boundary rule in `AGENTS.md` (surfaces/stream must not import product internals).

**Test scenarios:**
- Covers AE1. Happy path: session runs 35 min then exits → one `recordPlay` with duration ~2100s and the game's id.
- Covers AE2. Edge case: with a non-zero threshold, a sub-threshold session triggers no write.
- Covers AE4. Integration: a streamed session's terminal records identically to a local one.
- Error path: a failed/never-ran launch (no `Running`) does not record a play.
- Edge case: exactly one entry per session (no double-record across `ExitObserved`→`TearingDown`).

**Verification:**
- A simulated session lifecycle produces exactly one gated `recordPlay`; boundary imports stay clean (`just lint`).

---

### U5. Importer produces the new shape

**Goal:** Translate imported `<lastplayed>`/`<gametime>` into a seeded play-log entry; sort by derived stats.

**Requirements:** R6, R10

**Dependencies:** U1, U3

**Files:**
- Modify: `product/platform/library/rocknix/rocknix-source.ts` (map imported play data to a seeded `PlayLog`; replace `compareByLastPlayedDesc` to read derived `playStats.lastPlayed`)
- Modify: `tools/importers/rocknix/rocknix-importer.ts` and `tools/importers/rocknix/gamelist.ts` if they still emit `userData.lastPlayed`/`playtime`
- Test: `product/platform/library/rocknix/rocknix-source.test.ts` (extend)

**Approach:**
- For each imported game with a last-played date, seed one `PlayEntry { occurredAt = lastPlayed, durationSeconds = gametime ?? 0 }`. No date → no log (never played).
- Sorting reads derived `playStats.lastPlayed` (undefined last), preserving today's behavior via the new source of truth.

**Patterns to follow:**
- Existing `userData` assembly and `compareByLastPlayedDesc` in `product/platform/library/rocknix/rocknix-source.ts`.

**Test scenarios:**
- Happy path: imported game with `<lastplayed>` seeds one entry; derived lastPlayed matches.
- Edge case: imported game without `<lastplayed>` seeds no log and reads as never played.
- Happy path: `list()` remains sorted by derived last-played desc, undefined last (mirrors the existing test).
- Edge case: `<gametime>` present → seeded entry duration set; absent → duration 0.

**Verification:**
- Importer/source tests pass against the new shape; no `userData.lastPlayed`/`playtime` emitted anywhere.

---

### U6. Update surfaces and regenerate stale data

**Goal:** Point all readers at derived `playStats`; regenerate seed/fixture/config data authored in the old shape.

**Requirements:** R7, R9

**Dependencies:** U3

**Files:**
- Modify: `product/surfaces/web/shift/config.tsx`, `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`, `product/surfaces/web/shift/pages/shift-library-query.ts`, `product/surfaces/web/shift/pages/shift-library-sections.ts`, `product/surfaces/web/shift/pages/shift-library-game.ts`, and the detail views (`ShiftDetailStats.tsx`, `shift-detail-copy.ts`) to read `playStats`
- Modify: seed/fixture/config data files carrying `lastPlayed`/`playtime` (e.g. `tools/theme-workshop/lab/seed/shift-proseql-seed.ts`, `tools/seed-proof/*`, shift fixtures) — regenerate into the new shape
- Test: extend the colocated surface tests (`ShiftHomeRoute.test.ts`, `shift-library-query.test.ts`, `cinematic-play-labels.test.ts`, `shift-detail-copy.test.ts`)

**Approach:**
- Map `playStats.lastPlayed` → relative "last played" label; `playStats.lastPlayed` presence → "Continue" vs "Play"; `playStats.totalPlaytimeSeconds` → playtime label; `lastPlayedAt` sort key derived from `playStats.lastPlayed`.
- Convert async/runtime data into the domain view at the surface seam (existing pattern in `config.tsx`/`ShiftHomeRoute.tsx`).

**Patterns to follow:**
- `relativeLastPlayed`/`toGame` in `product/surfaces/web/shift/config.tsx`; `dateValue` mapping in `ShiftHomeRoute.tsx`.

**Test scenarios:**
- Covers AE5. Happy path: a game with a newer derived lastPlayed sorts ahead in recency.
- Happy path: playtime label reflects `totalPlaytimeSeconds`.
- Edge case: never-played game shows "Never played" / "Play" (not "Continue").
- Edge case: invalid/absent stats degrade to never-played (mirrors existing `not-a-date` test).

**Verification:**
- Shift unit tests pass on the new shape; a repo grep shows no remaining reads/writes of authored `userData.lastPlayed`/`playtime`; `just typecheck` clean (whole-repo, path aliases).

---

## System-Wide Impact

- **Interaction graph:** foreground-session terminal → composer → `recordPlay` → play-log store; library `list()`/`get()` → derived `playStats` → shift surfaces. New subscriber on the session terminal is the only new runtime edge.
- **Error propagation:** `recordPlay` failures must not break session teardown — record best-effort and log via `@shared/logger`; a failed write drops one entry, never blocks the lifecycle.
- **State lifecycle risks:** double-record across `ExitObserved`→`TearingDown` (guard for exactly one write per session); read-modify-write append races (single-user alpha tolerates; note for multi-user future).
- **API surface parity:** `PlayableGame`/read-entry shape changes (`userData` narrows, `playStats` added) ripple to every reader — the surface unit (U6) and importer (U5) are the parity closers.
- **Unchanged invariants:** authored `favorite` semantics and the launch RPC contract (`app.library.launch`) are unchanged; recording is a passive observer of the existing terminal, not a new launch path.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| No composed process currently owns the writable store at session-end time | U4 confirms against live composition before wiring; add a minimal subscription rather than pushing the write into the stream layer |
| Read-entry shape change is wide (breaks readers/tests) | Sequence U3 before U5/U6; use `just typecheck` (whole-repo) to enumerate every reader; treat as one big-bang pass |
| Duration anchor mis-measures "time played" (spawn vs. running) | Pick the owner transition that best matches active play; deferred but bounded to a single choice on a known object |
| Play-log read-modify-write append race | Acceptable at single-user alpha; documented as a future concern, not solved now |

---

## Sources & References

- **Origin document:** `work/items/active/01KWM98ZFYY12JTNYWDJ2MD18C-play-log-recording/requirements.md`
- Recording seam: `product/platform/stream/foreground-session-owner.ts`
- Read projection: `product/platform/library/proseql/library-repository.ts` (`toPlayableLibraryEntry`)
- Current model: `product/platform/library/config/records/game.ts` (`GameUserData`)
- Lifecycle truth: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`

---

## Alternative Approaches Considered

- **Reuse `userData.lastPlayed`/`playtime` as derived read fields** (lowest surface churn): rejected — blurs authored-vs-derived on one field name and softens the "no dual model" intent. A distinct `playStats` is honest about the big-bang.
- **Store the play log as a first-class canonical collection in the readable YAML config graph:** rejected — play history is high-churn runtime state, not authored config; keeping it out of the readable graph avoids polluting the config surface and its strict validation.
- **Seed one entry per imported `playcount`:** rejected — only a single imported timestamp exists, so multiple synthetic entries would fabricate occurrence times. Seeding one entry keeps last-played honest and accepts lossy times-played at alpha.
