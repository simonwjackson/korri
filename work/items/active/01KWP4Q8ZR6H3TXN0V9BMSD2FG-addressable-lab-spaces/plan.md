---
title: "feat: Route-first addressable spaces (URL state + un-syncable lab frames)"
type: feat
status: active
date: 2026-07-03
verify_command: "just typecheck && just test-unit"
---

# feat: Route-first addressable spaces (URL state + un-syncable lab frames)

## Summary

Graduate the Library route's reviewable view-state (`lens`, `sort`) from local `useState` into typed URL search params, give each committed route a declared axis manifest, and evolve the DevLab so frames can un-sync (each frame owns its route) with a per-frame route identity — then drive a route-first axis panel that composes a valid space from a route's declared axes. This makes a space addressable in the app (deep link) and reproducible in the lab (per-frame identity) through one contract.

---

## Problem Frame

A screen in Shift is `route × state`, but today only the route is addressable. Reviewable view-state — which Library lens is active, which sort — lives in `useState`, so it is neither deep-linkable in the app nor reproducible in the lab. The completed multi-device lab (`01KVXF5CGMQXZRAE27TZ3QHXRC`) made the surface **route** URL-addressable and mirrored across frames, but deliberately left per-frame surface state un-synced-and-invisible and enforced "every frame shows the same screen." A pre-planning spike (see Open Questions) confirmed two things: typed search params round-trip cleanly in the app, and the lab's cross-frame mirror is **path-only** — it strips search and cannot represent divergent per-frame state. So the addressability the design lab is supposed to give us ("the lab represents reality", `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`) stops at the route boundary. This plan pushes it to the state boundary for committed routes and gives the lab the ability to hold, show, and compose those states per frame.

---

## Requirements

- R1. Library `lens` and `sort` are addressable via typed URL search params: a cold load of `/library?lens=favorites&sort=az` renders that exact view, and changing either control rewrites the URL.
- R2. Each committed route exposes an **axis manifest**: addressable axes (from the route's typed search schema) plus declared data/environment axes (co-located on the route). A reader returns a route's manifest without importing lab code into product routes.
- R3. The lab supports a **sync toggle**: *synced* (all frames mirror one route — today's behavior, default) or *un-synced* (each frame drives its own route independently).
- R4. In un-synced mode each frame shows its **own route identity** (path + search), read from that frame's own router — not from any shared/global coordinate.
- R5. `lens`/`sort` become part of the frame's readable route identity, closing the lab's current silent drop of those axes on capture.
- R6. A **route-first axis panel**: selecting a route presents that route's manifest axes as selectors whose options derive from the axis state machines; composing a selection navigates the active frame to that space. Param axes (detail `id`) derive their options from the data axis (cascade).
- R7. The axis-manifest reading path is surface-agnostic: `LabSurfaceAdapter` derives a screen's addressable axes from the route manifest rather than hand-authored per-surface wiring, proven on Shift so any surface with a route tree + manifests can adopt it.

---

## Scope Boundaries

- Only **committed routes** graduate their view-state (Library today; Home/Detail already route/param-addressable). Exploratory library variants stay as-is.
- Reopening the completed lab's "one screen everywhere" invariant is **behind a toggle**, default preserving today's synced behavior — not a removal.
- Input routing for un-synced frames relies on the browser's existing per-frame DOM focus; no bespoke multi-target input router is built.

### Deferred to Follow-Up Work

- **Tier 3 — full per-frame *coordinate* identity** (data/foreground/power axes per frame) and **shareable multi-frame arrangement URLs**: blocked by the module-global singleton in `product/surfaces/web/shift/shift-live-coordinate.ts` (one "live" value, last-writer-wins); making it per-frame is a separate refactor. This plan reads only per-frame **route** identity, which sidesteps the singleton.
- **Graduating exploratory library variants** (`ShiftLibraryDeck`, `ShiftLibraryReel`, `ShiftLibraryFilterBar`) — only committed routes graduate.
- **Fixing `ShiftLibraryDeck.favorites`** (persistent userData faked in local `useState`; wrong seam — belongs at the catalog/library atom + RPC): separate data-seam follow-up. Capture via `se-backlog`.
- **Non-URL surface serialization** (terminal/voice/agent) and any **NavigationIntent / RPC / CLI trigger** layer for jumping to a space from outside a surface.
- **Nodes-and-edges transition view, a saved "named spaces" gallery, and a capture-fidelity indicator panel** — DevLab presentation polish.

---

## Context & Research

### Relevant Code and Patterns

- `product/surfaces/web/shift/routes/route-tree.tsx` — the enumerable route tree; where `validateSearch` and `staticData` attach per route. `createShiftRouter({ history })`.
- `product/surfaces/web/shift/routes/ShiftLibraryRoute.tsx` — composition root for `/library`; the seam that reads search and threads controlled `lens`/`sort` into the lens. `ShiftGameDetailRoute.tsx` is the param-route (`/game/$id`, `useParams`) precedent for the dependent `id` axis.
- `product/surfaces/web/shift/pages/ShiftLibraryLens.tsx` — holds `lens`/`sort` in `useState` today (the graduation target). `pages/ShiftLensRow.tsx` exports the `ShiftLibraryLens` union; `pages/shift-library-query.ts` the `ShiftLibrarySort` union + helpers.
- `product/platform/state/state-machine.ts` — `stateMachine([...tags])` → `.tags` (enumerable options source) + `.select`. The axis-option source of truth.
- `tools/theme-workshop/lab/LabSurfaceMount.tsx` — per-frame `createMemoryHistory` mount; the **path-only** mirror (`history.subscribe(({location}) => normalizeSurfacePath(location.pathname))`, `suppressPathRef` loop guard). The gate point for the sync toggle and the source of per-frame route identity.
- `tools/theme-workshop/lab/lab-router.tsx`, `tools/theme-workshop/lab/lab-route-state.ts` — outer `/lab/$devices/$themeId/*surfacePath` router; `buildLabPath` / `normalizeSurfacePath` (path splat, no search). Where un-synced outer-URL behavior is decided.
- `tools/theme-workshop/lab/surface-registry.ts` — `LabSurfaceAdapter` (`axesForScreen`, `captureCoordinate`, `mountSurface`, `LabMountedSurface.router`). The generalization seam (R7).
- `tools/theme-workshop/lab/adapters/shift-axes.tsx` — current hand-authored axes (`shiftLibraryAxis`, `axisOptionsFromTags(...)`, `pin`/`release` via `registry.set(atom, layer)`). The atom-axis mechanism to keep; the search-axis mechanism to add.
- `tools/theme-workshop/lab/useLabAxisController.ts`, `tools/theme-workshop/lab/model/lab-state-axis.ts` — the axis `pin(stateId, context)` drive path (atom-registry, not router).
- `product/surfaces/web/shift/shift-current-coordinate.ts` / `shift-live-coordinate.ts` — the existing single-coordinate reader (module-global; the Tier-3 boundary).

### Institutional Learnings

- `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md` — "the lab is the real app"; anchors why addressable state must live at the same seam in app and lab.
- `.pi/git/github.com/simonwjackson/pi-lattice-stack/skills/react/SKILL.md` — controlled-vs-local ownership, tagged-union state, galleries read `.tags`. The graduation follows the controlled-with-local-fallback pattern.

### External References

- `@tanstack/react-router` `1.168` — `validateSearch` (route option) + `useSearch` for typed search; `staticData` route-options bag for the declared-axis manifest; enumerable route tree.

---

## Key Technical Decisions

- **Typed URL search params are the seam for addressable view-state.** Confirmed by spike to typecheck in TanStack 1.168 and round-trip in a browser-history host. `ShiftLibraryLens` becomes controllable (`lens`/`sort` props) with a local-state fallback so existing tests and lab variants are untouched.
- **The axis manifest is co-located on the route.** `validateSearch` supplies the addressable (search) axes; `staticData.axes` declares the data/environment axes. Product routes declare axis **names/options** (via state-machine `.tags`); the lab keeps the "how to drive each axis" registry. Axis options are **declared alongside** (state-machine tags), not introspected from the search schema — the spike showed the schema is not reliably enumerable.
- **Un-sync = gate the existing mirror, not build independence.** Frames are already independent memory-history routers; sync is the added propagation layer. A `synced` flag gates propagation in the lab router / `LabSurfaceMount`. Cheapest lever, mostly turning off existing code.
- **Per-frame identity reads the frame's own router location (path + search).** This is per-frame by construction and avoids the `shift-live-coordinate` module-global singleton — which is exactly why full-coordinate identity is Tier 3, deferred.
- **Default preserves the completed lab's invariant.** Synced is the default; un-synced is opt-in. The completed multi-device lab is consumed as the host, its "same screen everywhere" behavior intact unless the toggle is flipped.

---

## Open Questions

### Resolved During Planning (via pre-planning spike)

- Do typed search params round-trip in the app? **Yes** — `validateSearch`/`useSearch` typecheck and a cold `/library?lens=favorites` renders the filtered view; changing lens rewrites the URL.
- Can the lab mirror carry search today? **No** — `LabSurfaceMount` reads only `location.pathname`, pushes path-only, and early-returns on unchanged path; search is dropped and never mirrored. Confirmed live in dev-lab (routes change in the URL; no query param ever appears).
- Is per-frame divergence expensive? **No** — per-frame surface state is already independent; the cost was the sync layer, so un-sync is cheap.

### Deferred to Implementation

- Exact `validateSearch` shape (plain normalizer fn vs. an `effect` `Schema`) and where the manifest's option lists are sourced (expected: the existing `stateMachine` `.tags`).
- Un-synced **outer-URL** behavior — freeze the surface-path splat vs. reduce to device+theme only. Decide when U3 touches `buildLabPath`.
- How the route-first panel picks the **active frame** it targets in un-synced mode (minimal active-frame concept vs. broadcast-to-all). Decide when U5 lands.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

    Route (product)                         One contract, two consumers
    ┌───────────────────────────┐
    │ /library                  │
    │   validateSearch → lens,  │──── addressable axes ─┐
    │                    sort   │                       │
    │   staticData.axes → data  │──── declared axes ────┤
    └───────────────────────────┘                       │
                                                        ▼
        App consumer                              Lab consumer
    ┌───────────────────────┐            ┌──────────────────────────────┐
    │ useSearch()/navigate  │            │ manifest reader → axesForScreen│
    │  → /library?lens=…    │            │ route-first panel: pick route  │
    │  (deep link, reload   │            │  → axis selectors (from .tags) │
    │   safe)               │            │  → navigate ACTIVE frame       │
    └───────────────────────┘            │ id axis options ← data axis    │
                                         └──────────────────────────────┘
                                                        │
                              sync toggle gates the path mirror
                    synced: one route mirrored to all frames (today)
                    un-synced: each frame owns its route + shows its
                               own path+search identity label

---

## Implementation Units

### U1. Graduate Library `lens` + `sort` to typed URL search

**Goal:** `lens` and `sort` on `/library` live in typed URL search params; the lens component is controlled by them with a local-state fallback.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- Modify: `product/surfaces/web/shift/routes/route-tree.tsx` (add `validateSearch` for `{ lens, sort }` on the library route)
- Modify: `product/surfaces/web/shift/routes/ShiftLibraryRoute.tsx` (read via `useSearch`; `onLensChange`/`onSortChange` → `navigate({ search })`; thread through `ShiftLibraryStateView`)
- Modify: `product/surfaces/web/shift/pages/ShiftLibraryLens.tsx` (optional controlled `lens`/`sort` props, fallback to local state)
- Test: `product/surfaces/web/shift/routes/ShiftLibraryRoute.test.tsx`, `product/surfaces/web/shift/pages/ShiftLibraryLens.test.tsx`

**Approach:**
- `validateSearch` normalizes unknown/missing params to the tagged-union defaults (`lens="all"`, `sort="recent"`); options come from the existing `ShiftLibraryLens` / `ShiftLibrarySort` unions.
- Follow the spike's controlled-with-fallback shape so lab variants and tests that render `ShiftLibraryLens` without props keep local behavior.

**Execution note:** The spike proved the shape and was reverted; re-land it properly, test-first on the search round-trip.

**Patterns to follow:**
- `product/surfaces/web/shift/routes/ShiftGameDetailRoute.tsx` (route-owned navigation), react skill controlled/local-fallback.

**Test scenarios:**
- Happy path: `Covers R1.` cold render with `search={{ lens: "favorites" }}` selects Favorites and filters the grid; with `sort: "az"` the grid orders A–Z.
- Happy path: activating a lens tab / cycling sort calls the change handler with the next value (navigates search).
- Edge case: missing/invalid search values default to `all` / `recent`.
- Edge case: rendered without `lens`/`sort` props → local `useState` drives it (existing tests unaffected).

**Verification:**
- In a browser-history host, `/library?lens=favorites&sort=az` renders that view on cold load and survives reload; changing a control updates the URL.

---

### U2. Route axis-manifest contract + reader

**Goal:** Each committed route can declare data/environment axes via `staticData`, and a reader returns a route's full axis manifest (search axes + declared axes) without product routes importing lab code.

**Requirements:** R2

**Dependencies:** U1

**Files:**
- Create: `product/surfaces/web/shift/routes/route-axis-manifest.ts` (manifest type + reader over the route tree)
- Modify: `product/surfaces/web/shift/routes/route-tree.tsx` (attach `staticData.axes` to `/`, `/library`, `/game/$id`)
- Test: `product/surfaces/web/shift/routes/route-axis-manifest.test.ts`

**Approach:**
- Manifest = `{ searchAxes: readonly AxisName[]; dataAxes: readonly AxisName[]; paramAxes: readonly AxisName[] }` derived from the route: search axis names from the route's search keys, data axis names from `staticData.axes`, param axis names from the path template.
- Axis **options** are not embedded here — they come from the state machines the harness already knows (`.tags`); the manifest carries axis **names/kinds** only. This keeps product routes free of lab/harness concerns (R2).

**Patterns to follow:**
- `product/platform/state/state-machine.ts` `.tags`; the existing `axisOptionsFromTags` consumer in `tools/theme-workshop/lab/adapters/shift-axes.tsx`.

**Test scenarios:**
- Happy path: reader for `/library` returns `lens`,`sort` as search axes and `data` as a declared axis.
- Happy path: reader for `/game/$id` returns `id` as a param axis and `data` as declared.
- Edge case: a route with no `staticData.axes` returns empty declared axes (home = data only, or empty as configured).

**Verification:**
- Manifest reader output matches each route's declared search/param/data axes; product route files import nothing from `tools/theme-workshop`.

---

### U3. Lab sync toggle (Tier 1)

**Goal:** A `synced` flag gates the lab's route mirror; un-synced frames navigate independently.

**Requirements:** R3

**Dependencies:** None (independent of U1/U2)

**Files:**
- Modify: `tools/theme-workshop/lab/LabSurfaceMount.tsx` (gate `onNavigate` propagation / the sync-down effect on `synced`)
- Modify: `tools/theme-workshop/lab/lab-router.tsx`, `tools/theme-workshop/lab/lab-route-state.ts` (outer-URL behavior when un-synced), `tools/theme-workshop/lab/Lab.context.tsx` / `LabRoot.tsx` (expose `synced` + toggle)
- Test: `tools/theme-workshop/lab/LabRoot.test.tsx` (or a focused sync test), `tools/theme-workshop/lab/LabSurfaceMount` behavior test

**Approach:**
- Synced (default): today's mirror — one frame's path bubbles up and re-projects to all, `suppressPathRef` prevents the loop.
- Un-synced: the frame's `onNavigate` does not propagate to siblings; each inner memory router stands alone. Decide outer-URL handling (freeze splat vs device+theme only) here.
- No remount on toggle — flip a flag consumed by the existing effects.

**Execution note:** Characterize the current synced mirror behavior before gating it, so the toggle provably preserves today's path.

**Patterns to follow:**
- The existing `suppressPathRef` / `onNavigate` mirror in `LabSurfaceMount.tsx`; the completed `01KVXF5CGMQXZRAE27TZ3QHXRC` plan's two-router design.

**Test scenarios:**
- Happy path (synced): navigating one frame updates the canonical route and re-projects to siblings (existing invariant preserved).
- Happy path (un-synced): navigating one frame leaves sibling frames on their own routes.
- Integration: toggling sync does not remount surviving frames.
- Edge case: un-synced → outer URL reflects the chosen behavior (no stale/looping surface path).

**Verification:**
- With two frames, un-synced navigation diverges and synced navigation converges, with no navigation loop or remount.

---

### U4. Per-frame route identity label (Tier 2)

**Goal:** Each frame displays its own route identity (path + search), read from that frame's router.

**Requirements:** R4, R5

**Dependencies:** U1 (search must exist to be shown), U3 (divergence to make it meaningful)

**Files:**
- Create: `tools/theme-workshop/lab/LabFrameIdentity.tsx` (reads a frame's location, renders a label)
- Modify: `tools/theme-workshop/lab/LabSurfaceMount.tsx` (surface the frame's current location to chrome)
- Test: `tools/theme-workshop/lab/LabFrameIdentity.test.tsx`

**Approach:**
- Read `path + search` from the frame's own memory history/router (already per-frame); render as a compact identifier (e.g. `/library?lens=favorites`).
- Deliberately route-only identity; do not read `shift-live-coordinate` globals (Tier-3 boundary).

**Patterns to follow:**
- `LabSurfaceMount`'s `history.subscribe` for location; lab chrome components under `tools/theme-workshop/lab/chrome/`.

**Test scenarios:**
- Happy path: label shows the frame's current path and search; updates when the frame navigates.
- Integration: two un-synced frames render two different identities.
- Edge case: no search → label shows the path alone.

**Verification:**
- Un-synced frames each display an accurate, live path+search identity distinct from their siblings.

---

### U5. Route-first axis panel

**Goal:** A DevLab panel where selecting a route presents its manifest axes as selectors; composing a selection navigates the active frame, with the detail `id` axis deriving options from the data axis.

**Requirements:** R6

**Dependencies:** U2 (manifest), U3/U4 (frames own routes + identity)

**Files:**
- Create: `tools/theme-workshop/lab/panels/LabRoutePanel.tsx` (route picker → axis selectors → compose/navigate)
- Modify: `tools/theme-workshop/lab/surface-registry.ts` (adapter exposes enumerable routes + manifest access), `tools/theme-workshop/lab/adapters/shift.ts`
- Test: `tools/theme-workshop/lab/panels/LabRoutePanel.test.tsx`

**Approach:**
- Enumerate routes from the surface route tree (via the adapter). On route select, read the manifest (U2): render one selector per axis, options from the axis state-machine `.tags`; search axes compose into the navigation `search`, param axes into `params`.
- The `id` param axis is a **dependent axis**: its option list comes from the currently seeded data axis (the catalog scenario). Pick data scenario → `id` options populate → compose.
- "Compose" navigates the active frame's router (search-backed axes drive the router, distinct from the atom-registry `pin` used by data axes).

**Technical design:** *(directional)* selector values → `{ to: routePath, params, search }` → active frame `router.navigate`. Data/foreground axes continue to drive via `registry.set` (existing `pin`); only search/param axes drive the router.

**Patterns to follow:**
- `tools/theme-workshop/lab/adapters/shift-axes.tsx` (`axisOptionsFromTags`, axis shape); existing lab panels under `tools/theme-workshop/lab/panels/`.

**Test scenarios:**
- Happy path: `Covers R6.` selecting `/library` lists `lens`,`sort`,`data`; choosing values composes and navigates the active frame to `/library?lens=…&sort=…`.
- Happy path: selecting `/game/$id` lists `id` (dependent) + `data`; the `id` options equal the current data scenario's game ids.
- Integration: changing the data axis re-populates the `id` options (cascade).
- Edge case: a route with only a data axis (home) composes with no search.

**Verification:**
- Picking a route + axis values lands the active frame on exactly that space; the detail `id` selector reflects the seeded catalog.

---

### U6. Derive `axesForScreen` from route manifests (generalization)

**Goal:** `LabSurfaceAdapter.axesForScreen` derives a screen's addressable axes from the route manifest instead of hand-authored per-surface wiring, proven on Shift.

**Requirements:** R7

**Dependencies:** U2, U5

**Files:**
- Modify: `tools/theme-workshop/lab/surface-registry.ts` (manifest-driven `axesForScreen` contract), `tools/theme-workshop/lab/adapters/shift-axes.tsx` / `adapters/shift.ts` (read manifest; keep atom-axis `pin`/`release`)
- Test: `tools/theme-workshop/lab/adapters/shift.test.ts` (or a focused axes test)

**Approach:**
- `axesForScreen(path)` composes: search/param axes from the route manifest (U2) + data/env axes from `staticData` bound to their harness drive mechanism (the existing `pin`/`release` registry swaps). Remove hand-authored search-axis wiring for committed routes.
- The atom-axis mechanism is unchanged; only the **source of the axis list** moves from hand-authoring to the manifest — so any surface exposing a manifest participates without new lab code.

**Patterns to follow:**
- Existing `shiftLibraryAxis` `pin`/`release`; `captureCoordinate` axis list derivation.

**Test scenarios:**
- Happy path: `axesForScreen("/library")` derives `lens`,`sort` (search) + `data` (declared) from the manifest.
- Happy path: `axesForScreen("/game/$id")` derives the `id` param axis + `data`.
- Edge case: no committed-route search axis remains hand-authored in the shift adapter.

**Verification:**
- The shift adapter's per-route axis list comes from manifests; adding a search axis to a route surfaces it in the lab with no adapter edit.

---

## System-Wide Impact

- **Interaction graph:** the sync toggle touches the lab's navigation mirror (`LabSurfaceMount` ↔ `lab-router`); the route-first panel drives the *active frame's* router while data axes still drive the atom registry — two distinct drive paths that must not cross-fire.
- **State lifecycle risks:** un-synced outer-URL handling must avoid a stale surface-path splat or a navigation loop when frames diverge; the sync toggle must not remount surviving frames.
- **API surface parity:** `ShiftLibraryLens` gains controlled props — its lab variants and tests must keep working via the local-state fallback (U1).
- **Unchanged invariants:** the completed multi-device lab's synced behavior is the default and is preserved; production surface mounting (`mountShift`), the shared route tree contract, and the atom-axis `pin`/`release` mechanism are not changed in shape — only extended (search axes added, axis list sourced from manifests).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Un-syncing reopens the completed lab's "one screen everywhere" invariant | Toggle-gated with synced as default; characterize synced behavior before gating (U3) |
| `validateSearch` schema options may not be introspectable | Axis options sourced from state-machine `.tags`, not the schema (Key Decisions) |
| Full per-frame coordinate identity blocked by `shift-live-coordinate` module-global | Scope per-frame identity to **route** (router-owned, per-frame); defer full coordinate to Tier 3 |
| Two drive paths (router-backed search axes vs atom-backed data axes) could cross-fire | Keep mechanisms separate; search/param axes navigate the router, data axes `registry.set` only (U5/U6) |
| Depends on the completed `01KVXF5CGMQXZRAE27TZ3QHXRC` lab | That work is `completed`; consumed as host, not modified in its synced path |

---

## Phased Delivery

### Phase 1 — Surface addressability foundation
- U1 (graduate lens/sort to URL), U2 (route axis-manifest contract). Ships app-side deep-linking and the contract other phases read.

### Phase 2 — Lab divergence foundation
- U3 (sync toggle, Tier 1), U4 (per-frame route identity, Tier 2). Ships side-by-side divergent frames with visible identities.

### Phase 3 — Route-first panel + generalization
- U5 (route-first axis panel), U6 (manifest-driven `axesForScreen`). Ships the compose-a-space panel and the surface-agnostic seam.

---

## Sources & References

- Adjacent completed work (host): `work/items/active/01KVXF5CGMQXZRAE27TZ3QHXRC-lab-multi-device-surface-routing/plan.md`
- Institutional learning: `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`
- Pre-planning spike (reverted): typed search round-trip in-app confirmed; lab mirror confirmed path-only in `tools/theme-workshop/lab/LabSurfaceMount.tsx`
- Lab surface contract: `tools/theme-workshop/lab/surface-registry.ts`
