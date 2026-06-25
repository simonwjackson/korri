---
title: "feat: source Shift cinematic home metadata + play-state from the service"
type: feat
status: completed
date: 2026-06-24
verify_command: "just typecheck && just test-unit"
---

# feat: source Shift cinematic home metadata + play-state from the service

## Summary

Make the cinematic Shift home render `genre`/`developer` and play-state
(`last-played`, `playtime`, `favorite`) sourced from the catalog/library
**service**, not from fixtures. The data model and the RPC transport already
support it — the gap is that the library repository drops `metadata` and never
forwards `userData` onto playable entries, and the home route only maps
`title` + art. Thread the existing fields through the repository → catalog
snapshot → home, and format presentation labels on the surface side.

---

## Problem Frame

`ShiftHomeRoute` now renders `ShiftCinematicHome` from `catalogSnapshotAtom`, so
the **list/title/art are service-driven**. But the hero chips are empty: the
catalog snapshot carries no genre/developer or play-state. The old fixture
(`SHIFT_CINEMATIC_GAMES`) faked these with synthetic `userData`. The real and
seed library repositories both map only `metadata: { name }` + media
(`library-repository.ts:884/982`) and never emit `userData`, even though every
upstream piece already exists.

---

## Requirements

- R1. The cinematic home renders `genre`/`developer` + `last-played`/`playtime`/`favorite` chips sourced from the catalog/library service for any game that carries them.
- R2. The library repository forwards `metadata` (genre/developer) and `userData` (lastPlayed/playtime/favorite) onto `PlayableLibraryEntry` — both the real ProseQL readable path and the in-memory seed.
- R3. The catalog snapshot carries these end-to-end with **no schema or RPC change** (`CatalogEntrySchema` already spreads `PlayableLibraryEntry.fields`).
- R4. The home route maps service fields → `ShiftCinematicGame`; relative/duration **label formatting is owned by the surface** (the service stays data-pure: raw `Date` + numeric playtime).
- R5. The in-memory lab seed populates `metadata` + `userData` so the chips render from the seeded **service shape** — not faked inside the component.
- R6. Games whose source provides no play-state degrade gracefully (no chip), not error.

---

## Scope Boundaries

- **No schema or RPC changes.** `PlayableLibraryEntry` already has optional `metadata` + `userData`; `CatalogEntrySchema` already spreads its fields; `userData.lastPlayed` already encodes via `Date`/`DateFromString`.
- **No new play-state store.** Consume what sources already provide (the rocknix gamelist parser already extracts `lastplayed`/`gametime`/`playcount`/`favorite`). Other sources (steam, local) may omit play-state — that's fine.
- **Favorites source = game `userData.favorite`** for now. Folding the per-user `UserRecord.favorites` layer into the snapshot is deferred.
- Not touching the rail home / dual-screen / Labs.

### Deferred to Follow-Up Work

- Per-user favorites: fold `UserRecord.favorites` into the resolved entry when a user is selected at the RPC boundary.
- `playcount` surfacing (available from rocknix) — only if a screen wants it.
- Real cross-source play-state for non-rocknix sources (steam playtime via the steam plugin, etc.).

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/records/game.ts` — `GameMetadata` (`genre[]`, `developer`, …) and `GameUserData` (`lastPlayed: Date`, `playtime: number`, `favorite: boolean`) on `GamePayload`.
- `product/platform/library/playable-library.ts` — `PlayableLibraryEntry` schema with **optional `metadata` + `userData`** already present; `asPlayableLibraryEntry` currently sets `metadata: { name }` only.
- `product/platform/library/proseql/library-repository.ts:884,982` — the readable playable-entry mapping that drops `metadata`/`userData`; `mediaForPlayable` (924) shows the join pattern to mirror.
- `tools/theme-workshop/lab/seed/shift-proseql-seed.ts` — `readSeededEntries` sets `metadata: { name }`; `gameRecordForSeedGame` already has `genre`/`developer` from `DEV_GAME_MEDIA` but they're dropped.
- `product/platform/catalog/catalog-facts-from-library.ts:48` — tags entries with `source` via spread, so forwarded `metadata`/`userData` pass straight through.
- `product/apps/portal/api/catalog/snapshot.rpc.ts:14` — `CatalogEntrySchema = { ...PlayableLibraryEntry.fields, source }`; the wire already carries `metadata`/`userData`.
- `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` — `toCinematicGame` maps only title + art today.
- `product/surfaces/web/shift/config.tsx` — the old `syntheticUserData` / `relativeLastPlayed` / `playtimeLabel` helpers show the label formatting to port to the surface.
- `product/platform/library/rocknix/gamelist.ts` — already parses `lastPlayed`/`playtimeSeconds`/`playcount`/`favorite`.

### Institutional Learnings

- `.pi/git/.../skills/react/SKILL.md` — surface owns presentation; the service provides data, the surface formats labels.
- Prior: the cinematic home was made the real route (commit `35636a5a`); this completes its data sourcing.

---

## Key Technical Decisions

- **Service stays data-pure; surface formats.** The catalog provides raw `lastPlayed: Date` + `playtime: number`; the cinematic surface renders `"3h ago"` / `"4.5h"` via a surface-side formatter. No formatted strings cross the service boundary.
- **No schema/transport change.** Populate existing optional fields only; the RPC already round-trips them.
- **`playtime` is minutes.** `GameUserData.playtime` is treated as **minutes** (matches the legacy fixture's synthetic playtime); the rocknix importer parses `gametime` seconds, so its mapping converts seconds→minutes (verify; fix if it stores seconds).
- **Favorites = game `userData.favorite`** for v1; user-layer fold deferred.
- **Graceful absence.** Every chip is conditional on its field; sources without play-state simply render fewer chips.

---

## Open Questions

### Resolved During Planning

- Schema/RPC change needed? → **No** — fields + wire already exist.
- Where do labels get formatted? → **Surface side** (data-pure service).
- Favorites source? → **Game `userData.favorite`** now.

### Deferred to Implementation

- Confirm `GameUserData.playtime` unit end-to-end (assumed minutes) and the rocknix `gametime` seconds→minutes conversion.
- Whether the real ProseQL readable path already decodes `userData` from `library.yaml` (it should, via `GamePayload`) — verify the repository simply forwards it.

---

## Implementation Units

### U1. Forward `metadata` + `userData` in the library repository

**Goal:** The readable ProseQL playable-entry mapping forwards `GamePayload.metadata` (genre/developer/…) and `userData` (lastPlayed/playtime/favorite) onto `PlayableLibraryEntry`, instead of `metadata: { name }` only.

**Requirements:** R2, R3, R6

**Files:**
- Modify: `product/platform/library/proseql/library-repository.ts` (the entry builders at ~`884`/`982`)
- Modify (if needed): `product/platform/library/playable-library.ts` (`asPlayableLibraryEntry` to carry full metadata/userData)
- Test: `product/platform/library/proseql/library-repository.test.ts` (extend the readable-entries test)

**Approach:** Spread `game.metadata` (not just `name`) and `game.userData` onto the playable entry when present; keep them optional. Mirror the existing `mediaForPlayable` join shape. Do not invent values.

**Test scenarios:**
- Happy: a game with `metadata.genre/developer` + `userData.lastPlayed/playtime/favorite` yields a playable entry carrying all of them.
- Edge: a game with no `userData`/`metadata` yields an entry with those omitted (no error, no empty objects forced).
- Edge: `metadata.name` still maps to `title` as before.

**Verification:** Repository test green; entries carry the fields; no regression to existing title/media behavior.

---

### U2. Populate `metadata` + `userData` in the in-memory seed

**Goal:** The lab seed emits genre/developer (already in `DEV_GAME_MEDIA`) + synthetic-but-service-shaped `userData`, so the lab demonstrates the chips from the seeded service path (R5) — not faked in the component.

**Requirements:** R2, R5

**Files:**
- Modify: `tools/theme-workshop/lab/seed/shift-proseql-seed.ts` (`readSeededEntries` forward metadata/userData; `gameRecordForSeedGame` already carries genre/developer)
- Modify: `product/surfaces/web/shift/dev-game-media.ts` (only if a play-state field needs adding to the dev media source)
- Test: `tools/theme-workshop/lab/seed/...` or extend `tools/seed-proof/seed-proseql.test.ts`

**Approach:** Carry `metadata.genre/developer` through `readSeededEntries`; attach a deterministic synthetic `userData` (lastPlayed/playtime/favorite) per seeded game (port `syntheticUserData` from `config.tsx`). Keep it in the seed (service shape), never in the component.

**Test scenarios:**
- Happy: seeded entries expose `metadata.genre` + `userData.favorite`/`lastPlayed`/`playtime`.
- Integration: `catalogSnapshotAtom`-shaped entries (via the seed → catalog layer) carry the fields.

**Verification:** Seed test green; seeded snapshot entries carry metadata + userData.

---

### U3. Map + format service fields in the cinematic home

**Goal:** `ShiftHomeRoute.toCinematicGame` reads `metadata.genre/developer` + `userData` from the catalog entry and produces `ShiftCinematicGame`, with relative/duration labels formatted on the surface.

**Requirements:** R1, R4, R6

**Files:**
- Modify: `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx` (`toCinematicGame`)
- Create: `product/surfaces/web/shift/routes/cinematic-play-labels.ts` (`relativeLastPlayed(date)`, `playtimeLabel(minutes)`) — ported from `config.tsx`
- Test: `product/surfaces/web/shift/routes/cinematic-play-labels.test.ts`

**Approach:** Read `entry.metadata?.genre?.[0]`, `entry.metadata?.developer`, `entry.userData?.favorite`, and format `userData.lastPlayed` → `lastPlayedLabel`, `userData.playtime` → `playtimeLabel`. All optional → omit when absent (R6). `ShiftCinematicGame` already has these optional fields.

**Test scenarios:**
- Happy: a date 3h ago → `"3h ago"`; 270 min → `"4.5h"`; favorite true → set.
- Edge: missing lastPlayed/playtime → labels undefined (no chip).
- Edge: <60 min → `"45m"`; >24h → `"3d ago"`.

**Verification:** Label test green; route maps all fields; pure formatting (no service strings).

---

### U4. End-to-end verification in the lab

**Goal:** Prove the chips render from the seeded service data across devices.

**Requirements:** R1, R5, R6

**Files:**
- Verify only: `tools/theme-workshop/lab` (browser smoke); no new app code.

**Approach:** Run the lab, load `/lab/.../shift/`, assert the cinematic hero shows genre + last-played/playtime/favorite chips for a seeded game, mirrored across frames, no page errors. Confirm a game without seeded play-state shows fewer chips (graceful).

**Test scenarios:** Browser smoke (chips visible + sourced from the seed path); `just test-unit` green; `just typecheck` introduces no new errors.

**Verification:** Lab shows service-sourced chips; suites green.

---

## System-Wide Impact

- **Interaction graph:** `library-repository` → `PlayableLibraryEntry` → `catalog-facts-from-library` (passthrough) → `snapshot.rpc` (already spreads fields) → `catalogSnapshotAtom` → `ShiftHomeRoute` → `ShiftCinematicHome`. Only the two endpoints (repository emit, route read) change behavior.
- **Error propagation:** All new fields optional; absence renders fewer chips, never throws.
- **API surface parity:** No RPC/schema change; the wire already carries `metadata`/`userData`. Other surfaces (pico detail, rail home) can opt into the same fields later.
- **Unchanged invariants:** No new store, no transport change, no fixture data in components; the lab stays seed-backed, the real app reads korrid.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `userData.lastPlayed` Date fails to round-trip over RPC | `CatalogEntrySchema` uses `PlayableLibraryEntry.fields` with `Date`/`DateFromString`; add a decode/encode assertion in U1/U2 tests |
| `playtime` unit mismatch (seconds vs minutes) | Decide minutes; verify + convert rocknix `gametime` seconds at import; assert in U3 label test |
| Repository forwarding leaks excess/strict-mode fields | Forward only `metadata`/`userData` shapes the playable schema allows; keep optionals omitted when absent |
| Favorites ambiguity (game vs user layer) | Use game `userData.favorite` now; user-layer fold is explicitly deferred |

---

## Sources & References

- Related code: `product/platform/library/proseql/library-repository.ts`, `product/platform/library/playable-library.ts`, `product/platform/library/config/records/game.ts`, `product/platform/catalog/catalog-facts-from-library.ts`, `product/apps/portal/api/catalog/snapshot.rpc.ts`, `product/surfaces/web/shift/routes/ShiftHomeRoute.tsx`, `product/surfaces/web/shift/config.tsx`, `tools/theme-workshop/lab/seed/shift-proseql-seed.ts`, `product/platform/library/rocknix/gamelist.ts`
- Related prior work: cinematic home made the real route (`35636a5a`); image-processing backlog `01KVXX7GGBQT0QXM1Z4KMEPA80`
