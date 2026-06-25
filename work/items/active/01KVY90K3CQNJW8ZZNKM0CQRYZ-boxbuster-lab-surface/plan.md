---
title: "feat: bring Boxbuster into the lab as a catalog-driven, route-addressable surface"
type: feat
status: completed
date: 2026-06-24
verify_command: "just typecheck && just test-unit"
---

# feat: bring Boxbuster into the lab as a catalog-driven, route-addressable surface

## Summary

Promote the Boxbuster PS1 3D video-store surface from a standalone fixture into
a real lab peer alongside Shift and Pico. Three moves: (1) rewire its data from
the hardcoded `GAMES` list + live SteamGridDB cover fetch to the **shared seeded
catalog**; (2) **invert its state ownership** so the lab's canonical route
(`/`, `/game/$id`) drives which game is focused/playing and in-world actions
become navigations; (3) wrap it in a `mountSurface` adapter and register it in
the lab. The result: the lab mirrors a single path across three radically
different expressions of the same game — Shift's detail page, Pico's cartridge,
and Boxbuster's 3D TV — simultaneously.

---

## Problem Frame

Boxbuster currently mounts via a bridge entrypoint (`mount(host) -> unmount`)
with no router and its own data (hardcoded `GAMES` in `steamgriddb.ts`, cover
art fetched live from SteamGridDB by title). That made it fit the old
`dev-theme-workshop` (mount-any-entrypoint) but **not** the new lab, whose whole
premise is: every surface reads the *same* seeded catalog and mirrors *one*
canonical route across device frames. The user's reframe resolves the apparent
mismatch: Boxbuster is React with explicit scene state (`heldGame`, `playing`,
`focus`), so the route can *own* that state and the 3D scene becomes its
projection — which is exactly the lab's model, and turns Boxbuster into the most
vivid demonstration of "one path, many surfaces."

---

## Requirements

- R1. Boxbuster mounts through the lab's `LabSurfaceAdapter` contract (`mountSurface(host, { initialValues, history }) -> { router, dispose }`) and appears in the lab surface switcher as a peer to Shift/Pico.
- R2. Boxbuster's game data is sourced from the shared seeded catalog (`catalogSnapshotAtom`), not from its hardcoded `GAMES` array, when mounted in the lab/real host.
- R3. Cover textures are taken from catalog media (interim catalog art now; on-brand later via the media-pipeline backlog), not fetched live from SteamGridDB, on the catalog-driven path.
- R4. Boxbuster speaks the lab's existing route vocabulary: `/` = browsing the store; `/game/$id` = that game focused/playing on the in-store TV. No new route shape.
- R5. The route is the source of truth for focus/playing state; in-world actions (insert cart / play) emit navigations rather than owning state directly.
- R6. The lab mirrors a single canonical path across all device frames with Boxbuster mounted, with no page reload and no survivor remount — same guarantees Shift/Pico already meet.
- R7. The standalone old-workshop Boxbuster entry keeps working (data-injectable `App`), so this change does not break the existing fixture.

---

## Scope Boundaries

- Not making Shift/Pico/Boxbuster share a literal component — only the route vocabulary and the seeded catalog.
- Not changing the lab router, device calibration, or `LabSurfaceMount` projection machinery — Boxbuster conforms to them.
- Not building the media/asset derivation pipeline; interim catalog art is acceptable (same posture as Pico).
- Not mirroring per-frame *camera* position — only the routed game-focus/playing state is canonical; free-look stays local to each frame.
- Not wiring Boxbuster into the portal/Electrobun hosts in this plan (lab-first; the adapter shape makes hosted mounting a later, separate step).

### Deferred to Follow-Up Work

- On-brand PS1 cover treatment via the media-pipeline derivation request (backlog `01KVXX7GGBQT0QXM1Z4KMEPA80`).
- Hosting Boxbuster in the real portal/Electrobun surface registry.
- Surfacing Boxbuster-owned lab controls (VHS intensity, embedded/free-look toggle) via the adapter `useControls` seam — optional polish, not required for parity.

---

## Context & Research

### Relevant Code and Patterns

- `product/surfaces/web/pico/mount-pico.tsx` — the exact `mountSurface` template: `mount(host, { data: { initialValues }, navigation: { history }, beforeRouter }) -> { router, dispose }`, atom-seeded via `useAtomInitialValues`, tanstack `RouterProvider` with injected history, wrapped in `RegistryProvider`.
- `tools/theme-workshop/lab/adapters/pico.ts` — the lab adapter shape to mirror: inlined `devices`/`knobs`, `screens`, `scaleVarPrefix`, shared `makeSeedInitialValues` from `tools/theme-workshop/lab/seed/shift-seed.ts`, `mountSurface` delegating to the surface's mount fn.
- `tools/theme-workshop/lab/surface-registry.ts` — `LabSurfaceAdapter` interface + `LAB_SURFACE_ADAPTERS` registration point.
- `product/surfaces/web/pico/routes/pico-catalog-view.ts` — pattern for mapping `catalogSnapshotAtom` entries to a surface's own view model (the analogue for Boxbuster's `Game`).
- `product/surfaces/web/pico/routes/pico-route-tree.tsx` — `createPicoRouter({ history })` with `/` + `/game/$id`; the router factory pattern for `createBoxbusterRouter`.
- `product/surfaces/web/boxbuster/app.tsx` — owns `heldGame`/`playing`/`focus` state and `handlePlay`; the state to make route-derived. Has an `embedded` mode already (drag-to-look instead of pointer-lock) for hosting inside the lab.
- `product/surfaces/web/boxbuster/scene.tsx` — `Scene` exposes `onPlay(game)` (the navigation seam) and consumes a `playing` prop; `scene.tsx:575` loads the TV cover via `fetchCoverImage(playing.title)` (the catalog-coverUrl swap point).
- `product/surfaces/web/boxbuster/steamgriddb.ts` — `Game` type (`{ title, year, platform, genre, players, blurb }`, no id), hardcoded `GAMES`, `fetchCoverImage(title)` SGDB fetch.
- `product/surfaces/web/boxbuster/entry.tsx` — `boxbusterEntry` bridge entrypoint used by the old workshop (`tools/theme-workshop/themes.ts`); must keep working via a data-injectable `App`.
- `product/platform/library/playable-library-ui.ts` — `getPlayableDisplayName`/`getPlayableImageUrl`/`getPlayableWideImageUrl` accept a `CatalogEntry` directly.
- `product/platform/react/catalog/catalog-atoms.ts` — `catalogSnapshotAtom` (`AsyncResult`); read via `AsyncResult.matchWithError`.

### Institutional Learnings

- The lab's "two cooperating routers" model (outer browser-history lab router + inner per-frame memory histories driven by one canonical path) — Boxbuster's inner router is just another memory-history consumer.
- Pico precedent: keep the throwaway gallery/standalone entry self-contained while the *real* mount is atom-driven — avoids breaking the fixture while making the surface catalog-driven.
- `LabSurfaceMount` already diff-guards path projection and disposes/clears on unmount; conforming surfaces need no special-casing.

### External References

- None required; this is an internal integration following two existing in-repo adapter precedents (Shift, Pico).

---

## Key Technical Decisions

- **Route owns focus/playing; scene projects it.** `/game/$id` resolves to a `Game`, which flows into `Scene` as `playing`; `Scene.onPlay` is rewired to `navigate('/game/$id')`. Browsing/camera stays local (not routed). This is the minimal inversion that satisfies R4/R5 without rewriting the 3D interaction model.
- **Reuse the existing route vocabulary** (`/`, `/game/$id`) rather than inventing Boxbuster-specific routes — so the lab mirrors the same path across all three surfaces with zero routing special-cases.
- **Data-injectable `App`.** `App` gains a `games` prop (and router/navigation); the standalone `boxbusterEntry` passes the hardcoded `GAMES` (unchanged behavior), while `mountBoxbuster` passes catalog-derived games. Mirrors Pico's split (R7).
- **Extend `Game` with `id` + `coverUrl`.** Routing needs a stable id (playable id); textures need a catalog media URL. The scene keys games by `id` and prefers `coverUrl` for textures, falling back to `fetchCoverImage(title)` only when `coverUrl` is absent (standalone path). Keeps both paths alive.
- **Shared seed, surface-agnostic.** Boxbuster's adapter uses the same `makeSeedInitialValues` as Shift/Pico — the catalog is the single source of truth; Boxbuster only supplies a catalog->`Game` view.
- **Textures over canvas readback.** Boxbuster draws covers to WebGL textures (not `getImageData`), so catalog cross-origin art is loadable with `crossOrigin="anonymous"` without the taint problem Pico hit — provided the catalog media serves permissive CORS (flagged as a risk).

---

## Open Questions

### Resolved During Planning

- Does Boxbuster fit the lab at all? -> Yes, once state is route-derived and data is catalog-sourced; it's a peer, not special.
- New route shape needed? -> No; `/` + `/game/$id` already express "browsing" and "this game playing."
- Break the old workshop? -> No; `App` becomes data-injectable, standalone passes `GAMES`.

### Deferred to Implementation

- Exact `Game` id derivation for the standalone `GAMES` fallback (slug of title vs synthetic id) — only matters for the non-catalog path.
- Whether the in-store TV "off" state (`/`) should also clear the held cart, or leave the last-browsed cart in hand — a scene-feel detail to settle while wiring.
- Whether catalog media URLs in the lab seed load as same-origin/CORS-clean textures, or need the lab's existing proxy — verify at U1.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Route -> scene-state projection (the inversion):

| Canonical path        | Resolved state fed to `Scene`              | In-world action effect            |
|-----------------------|--------------------------------------------|-----------------------------------|
| `/`                   | `playing = null` (TV off, store browsing)  | grab/insert cart -> `navigate('/game/$id')` |
| `/game/$id`           | `playing = gameById(id)` (TV on, focused)  | eject / back -> `navigate('/')`   |

Data flow (catalog-driven mount):

    catalogSnapshotAtom (shared seed)
      -> boxbuster-catalog-view (entries -> Game[] with id + coverUrl)
      -> App(games, router)
      -> Scene(playing = gameById(routeParam.id))
      -> TV texture from game.coverUrl (fallback: fetchCoverImage(title))

Mount + lab wiring mirrors Pico:

    boxbusterLabSurfaceAdapter.mountSurface(host, { initialValues, history })
      -> mountBoxbuster(host, { data: { initialValues }, navigation: { history } })
      -> createBoxbusterRouter({ history }) + RegistryProvider + useAtomInitialValues

---

## Implementation Units

### U1. Catalog-driven Boxbuster data (`Game` from the seeded catalog)

**Goal:** Boxbuster sources its games from `catalogSnapshotAtom` with stable ids and catalog cover URLs, while the standalone entry keeps its hardcoded list.

**Requirements:** R2, R3, R7

**Dependencies:** None

**Files:**
- Modify: `product/surfaces/web/boxbuster/steamgriddb.ts` (extend `Game` with `id` + optional `coverUrl`)
- Create: `product/surfaces/web/boxbuster/boxbuster-catalog-view.ts` (`boxbusterGamesFromCatalog`, `boxbusterGameFromCatalog`)
- Create: `product/surfaces/web/boxbuster/boxbuster-catalog-view.test.ts`
- Modify: `product/surfaces/web/boxbuster/app.tsx` (accept `games` prop; default to `GAMES`)
- Modify: `product/surfaces/web/boxbuster/scene.tsx` (key games by `id`; prefer `game.coverUrl` for textures, fall back to `fetchCoverImage(title)`)
- Modify: `product/surfaces/web/boxbuster/entry.tsx` (standalone passes `GAMES` with derived ids)

**Approach:** Mirror `pico-catalog-view`: map each `CatalogEntry` to a `Game` via `getPlayableDisplayName`/`getPlayableImageUrl`, carrying the playable id and cover URL. Add a `crossOrigin="anonymous"` texture path for `coverUrl`. Keep `fetchCoverImage` as the standalone fallback only.

**Patterns to follow:** `product/surfaces/web/pico/routes/pico-catalog-view.ts` and its test.

**Test scenarios:**
- Happy: a catalog snapshot with entries -> `Game[]` carrying id, title, and `coverUrl` from catalog media.
- Edge: an entry with no cover media -> `Game` with `coverUrl` undefined (scene will fall back).
- Edge: empty/initial/error snapshot -> empty `Game[]`, no throw (graceful, like Pico).
- Happy: `App` with no `games` prop renders the hardcoded `GAMES` (standalone parity).

**Verification:** View test green; `App` renders catalog games when injected and `GAMES` when not; scene loads textures from `coverUrl` when present.

---

### U2. Route-derived scene state (`/`, `/game/$id`) + actions as navigations

**Goal:** A Boxbuster router whose path owns focus/playing; the scene projects the route, and in-world play/eject emit navigations.

**Requirements:** R4, R5, R6

**Dependencies:** U1

**Files:**
- Create: `product/surfaces/web/boxbuster/routes/boxbuster-route-tree.tsx` (`createBoxbusterRouter({ history })`, `/` + `/game/$id`)
- Create: `product/surfaces/web/boxbuster/routes/BoxbusterStoreRoute.tsx` (reads route param -> resolves `playing` -> renders `App`/`Scene`)
- Modify: `product/surfaces/web/boxbuster/app.tsx` (accept resolved `playing` + an `onPlay`/`onEject` navigation callback instead of owning that state)
- Modify: `product/surfaces/web/boxbuster/scene.tsx` (`onPlay(game)` -> navigate; consume route-resolved `playing`)
- Create: `product/surfaces/web/boxbuster/routes/boxbuster-route-state.test.tsx`

**Approach:** Keep camera/browsing local; route only the "which game is on the TV" state. `/game/$id` resolves the `Game` by id from the injected catalog games and passes it as `playing`; `Scene.onPlay` calls `navigate('/game/$id')`; an eject/back affordance calls `navigate('/')`. Use a memory history when provided (lab) so the lab's projection drives all frames.

**Execution note:** Start with a failing test that asserts navigating to `/game/$id` yields `playing.id === $id` and that `onPlay` triggers the navigation — lock the inversion contract before refactoring the scene.

**Patterns to follow:** `product/surfaces/web/pico/routes/pico-route-tree.tsx`, `PicoGameDetailRoute.tsx` (route-param -> view-model resolution).

**Test scenarios:**
- Covers R5. Happy: `Scene.onPlay(game)` -> router navigates to `/game/<game.id>`.
- Happy: route `/game/hollow-knight` -> `playing` resolves to that game (TV on).
- Happy: route `/` -> `playing` is null (TV off / browsing).
- Edge: `/game/$unknownId` -> `playing` null (no crash; treated as browsing).
- Edge: eject/back from `/game/$id` -> navigates to `/`.

**Verification:** Route-state test green; scene focus/playing is a pure function of the path; no in-component ownership of `playing` remains.

---

### U3. `mountBoxbuster` + lab adapter + registration

**Goal:** A `mountSurface`-shaped Boxbuster mount and a lab adapter registered next to Shift/Pico.

**Requirements:** R1, R6

**Dependencies:** U1, U2

**Files:**
- Create: `product/surfaces/web/boxbuster/mount-boxbuster.tsx` (`mountBoxbuster(host, { data: { initialValues }, navigation?: { history }, beforeRouter? }) -> { router, dispose }`)
- Create: `tools/theme-workshop/lab/adapters/boxbuster.ts` (`boxbusterLabSurfaceAdapter`)
- Modify: `tools/theme-workshop/lab/surface-registry.ts` (add to `LAB_SURFACE_ADAPTERS`)
- Create: `tools/theme-workshop/lab/adapters/boxbuster.test.ts`

**Approach:** Copy `mount-pico.tsx` structure: `createBoxbusterRouter({ history })`, `RegistryProvider`, `useAtomInitialValues`, dispose via `root.unmount()`. Wrap the surface in a fill frame and enable `embedded` mode (drag-to-look) so it cooperates with surrounding lab chrome. Adapter inlines `devices`/`knobs`/`scaleVarPrefix`, sets `screens: [{ label: "Store", path: "/" }, { label: "Now Playing", path: "/game/hollow-knight" }]`, and reuses `makeSeedInitialValues` from the shared shift seed.

**Patterns to follow:** `product/surfaces/web/pico/mount-pico.tsx`, `tools/theme-workshop/lab/adapters/pico.ts`.

**Test scenarios:**
- Happy: adapter exposes `id`, `devices`, `screens`, `makeSeedInitialValues`, `mountSurface`.
- Happy: `mountBoxbuster` returns `{ router, dispose }`; `dispose` unmounts cleanly.
- Edge: mounting with an injected memory `history` routes the inner router to the provided path.
- Integration: adapter resolvable via `resolveLabSurfaceAdapter("boxbuster")` and present in `labSurfaceAdapters()`.

**Verification:** Adapter test green; lab surface switcher lists Shift/Pico/Boxbuster; `bunx vite build --config tools/theme-workshop/lab/vite.config.mjs` succeeds.

---

### U4. Lab mirror verification across Shift/Pico/Boxbuster

**Goal:** Prove one canonical path renders three surface expressions simultaneously, mirrored across devices, no reload, no remount.

**Requirements:** R1, R6

**Dependencies:** U3

**Files:**
- Verify only: `tools/theme-workshop/lab` (browser smoke); no new app code.

**Approach:** Run the lab; on `/lab/<devices>/boxbuster/`, confirm the 3D store mounts in every frame and mirrors the same focused/playing game; switch surface to Shift and Pico on the *same* `/game/$id` and confirm all three express the same path; confirm selecting a game in one Boxbuster frame navigates all frames (path mirror) with no page reload and no survivor remount.

**Test scenarios:**
- Integration: `/game/hollow-knight` on Boxbuster -> TV shows Hollow Knight in all frames.
- Integration: surface swap Boxbuster->Shift->Pico keeps the path; each renders its own expression of the same game.
- Integration: in-world play in one frame -> canonical path updates -> all frames mirror; `noReload` holds.
- Edge: deselect-all device segment snaps to `all` with Boxbuster still mounted (no crash).

**Verification:** Lab smoke shows three-surface parity on one path; `just typecheck` introduces no new errors; `just test-unit` green.

---

## System-Wide Impact

- **Interaction graph:** `catalogSnapshotAtom` -> `boxbuster-catalog-view` -> `App`/`Scene`; `Scene.onPlay` -> Boxbuster router -> (lab) canonical path -> all frames. Only Boxbuster's internals and the lab registry change; Shift/Pico/lab-core are untouched.
- **Error propagation:** Unknown/empty catalog or unknown `/game/$id` degrade to browsing (TV off), never throw — matching the lab's graceful-absence posture.
- **State lifecycle risks:** Boxbuster must dispose its router/root and release WebGL/texture resources on unmount so survivor frames never leak; mirror `mount-pico`'s `dispose`.
- **API surface parity:** Boxbuster now conforms to the same `LabSurfaceAdapter` contract as Shift/Pico; future surfaces follow the same three-step (data-view, route-derive, mount-adapter) recipe.
- **Unchanged invariants:** The lab router, device calibration, `LabSurfaceMount` projection, the shared seed, and the old-workshop standalone Boxbuster entry all keep their current behavior.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Catalog media URLs taint/deny CORS for WebGL textures | Load with `crossOrigin="anonymous"`; if denied, route through the lab's existing SGDB/asset proxy or keep `fetchCoverImage` fallback; verify at U1 before depending on it |
| Inverting `playing` ownership destabilizes the 3D interaction feel | U2 is test-first on the route<->state contract; camera/browsing stays local so only one state axis moves |
| Making `App` atom-dependent breaks the standalone entry | `App` stays data-injectable; only `mountBoxbuster` reads atoms; standalone passes `GAMES` (R7, tested in U1) |
| Three.js/R3F resource leaks across mirrored frames | `dispose` unmounts the root; verify no WebGL context accumulation across surface swaps in U4 |
| `Game` lacks ids; routing needs stable keys | U1 adds `id` (playable id from catalog; slug fallback for standalone) |

---

## Sources & References

- Supersedes parking-lot: `01KVXY69MEVMBERMH8RAKV07KJ` (boxbuster-as-lab-surface, old framing)
- Related backlog: `01KVXX7GGBQT0QXM1Z4KMEPA80` (surface-owned / korrid-derivable image processing — on-brand PS1 covers)
- Related code: `product/surfaces/web/pico/mount-pico.tsx`, `product/surfaces/web/pico/routes/pico-catalog-view.ts`, `tools/theme-workshop/lab/adapters/pico.ts`, `tools/theme-workshop/lab/surface-registry.ts`, `product/surfaces/web/boxbuster/{app,scene,steamgriddb,entry}.tsx`
- Related prior work: cinematic home made the real Shift route (`35636a5a`); Pico made a real lab surface (`aee37de8`)
