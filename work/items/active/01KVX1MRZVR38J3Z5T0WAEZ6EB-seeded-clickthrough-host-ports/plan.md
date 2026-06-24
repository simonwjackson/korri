---
title: "feat: Host-agnostic Shift surface with a real seeded click-through"
type: feat
status: completed
date: 2026-06-23
verify_command: "just typecheck && just test-unit"
---

# feat: Host-agnostic Shift surface with a real seeded click-through

## Summary

Make the Shift surface render and navigate identically across three hosts — the design tool, a browser, and Electrobun — by depending only on three host-supplied adapter ports (data, navigation, input) and never on the environment. Introduce one `mountShift(host, { data, navigation, input })` composition root over a single shared surface route tree, stand up a real in-memory ProseQL seed so the design tool runs the actual engine + repository with no server/disk, and deliver a `home → game detail → Play` click-through whose launch lifecycle is *represented*, not executed. Land it design-tool-first (fully verifiable locally), then re-point the browser portal and Electrobun.

---

## Problem Frame

The Shift surface today is one wired screen (Home) with no in-app navigation and no shared mount contract: the portal imperatively mounts it via `SurfaceHost`, the design tool reimplements screens with hand-built view models, and there is no `game detail` to click into. Data already flows cleanly through an injectable Effect layer-as-atom seam (`catalogFactsSourceLayerAtom` → `catalogSnapshotAtom` → `ShiftCatalogStateModel` → Home), but navigation is not yet a port, so each host diverges. The goal is to "click through the entire app from a seed" with as little mocking as possible — which requires (a) navigation as a port, (b) a single route tree all hosts reuse, and (c) a seed real enough to run the actual ProseQL engine in the design tool.

---

## Requirements

- R1. The Shift surface depends only on three host ports — **data** (catalog/library/launcher atoms), **navigation** (router + history), **input** (`useInputAction`) — with no environment branching, no `window`/Electrobun globals, and no `@product/apps/*` imports.
- R2. One shared surface route tree (`/`, `/game/$id`, room to grow) is defined once and reused by every host; the design tool deep-links into it rather than reimplementing screens.
- R3. A real in-memory ProseQL seed powers the design tool: the actual engine + repository + `proseql-library-source`, backed by a `Map` storage adapter, with no server and no file system.
- R4. Selecting a game navigates to its detail screen; **Play** on the detail triggers the real launch lifecycle (launching → running → exited), represented via the in-memory launcher adapter — no process is executed.
- R5. The shipped browser/Electrobun bundles contain **no ProseQL** — those hosts read through the existing RPC/bridge adapters against the server's ProseQL.
- R6. The design-tool click-through (`home → detail → back`, and `Play` lifecycle) is verifiable locally with no backend.
- R7. The detail screen shows title + cover art + Play for now; richer metadata (genre/developer/playtime) is deferred.
- R8. The real app's evier/vigie surfaces remain intact (their hack routes were already pulled in `825d6f1c`).

---

## Scope Boundaries

- Not changing the catalog snapshot RPC contract or the server's ProseQL (`LibrarySourceLayerLive`).
- Not building loading/return (post-exit) screens now — the launch lifecycle is wired through the launcher/sessiond seam, but the new screens are out of scope.
- Not implementing federation/peers in the seeded catalog facts (single local host only).
- Not enriching detail metadata beyond title + art + Play (R7).
- Not adding Settings/Search/In-Game screens in this plan — the route tree leaves room, but only Home + Game Detail are delivered.

### Deferred to Follow-Up Work

- Richer Game Detail metadata (genre/developer/playtime): needs an `acquisition/details` fetch or a catalog-entry schema extension — separate item.
- Catalog snapshot pagination/streaming if the full-entry-list-to-client cost ever matters at scale — separate item, true today regardless of this plan.
- Additional surface routes (Settings ← `stream-control`, Search ← `acquisition`, In-Game ← `session`) — future iterations on the same `mountShift` spine.
- Promoting the Cinematic home composition to be *the* production home (currently lab-only; the rail home still ships).

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/proseql/library-db.ts` — `openKorriLibraryDb` (fs) and the now-landed `openInMemoryKorriLibraryDb` (Map storage); `makeKorriLibraryDbConfig`, `withCanonicalCollectionGuards`, the singleton-`local`-host guard, and the storage-mode sidecars are the shared library definition.
- `product/platform/library/proseql/library-repository.ts` — `createLibraryRepository` (real write path: `upsertGame`, `listPlayableEntries`).
- `product/platform/library/proseql/proseql-library-source.ts` — `createProseqlLibrarySource(repository)` → `LibrarySource`.
- `product/platform/catalog/catalog-facts-source.ts` — `CatalogFactsSource` service, `makeInMemoryCatalogFactsSourceLayer`, `CatalogSnapshotFacts`/`CatalogEntry` shapes.
- `product/platform/react/catalog/catalog-atoms.ts` + `product/platform/react/library/library-atoms.ts` — the layer-as-atom seam (`catalogFactsSourceLayerAtom`, `librarySourceLayerAtom`, `launcherLayerAtom`, `libraryRuntime`).
- `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` — production injection point (`RegistryProvider` + `useAtomInitialValues` with RPC layers); the template for `mountShift`'s data adapter wiring.
- `product/surfaces/web/shift/entry.tsx` — current imperative `mount(host, { bridge })` + bridge adapter layers (the Electrobun data adapter).
- `product/surfaces/web/shift/pages/ShiftHomePage.tsx` / `ShiftHomeReadyBody.tsx` — Home reads `catalogSnapshotAtom`; `ShiftHomeRail` exposes the injectable `onItemClick` seam (today wired to `launch.start`).
- `product/surfaces/web/shift/pages/ShiftGameDetailScreen.tsx` — the detail screen (already exists; takes a flat view model).
- `tools/seed-proof/` — the existing harness (code-based TanStack router, `home → /game/$id` click-through over an in-memory seed) that this plan generalizes into `mountShift`.
- `product/apps/portal/routes/__virtual.ts` + `tsr.config.ts` — TanStack virtual file-routes (`+` prefix, codegen wired in `vite.config.mjs`); evier/vigie hack routes already removed.

### Institutional Learnings

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — anchors the "mock as little as possible" / real-ProseQL-in-memory choice.
- `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md` — the canonical library/config-graph model the seed must respect.
- `work/items/active/01KV10SX4W8N8S25SPJK0M31E5-theme-owned-catalog-facts` and `01KV0RYJWKZHVBZ8ZVBHXHP63A-unified-catalog-fabric` — prior art for the catalog-facts seam this plan seeds.

### External References

- `@proseql/core` README/package — runtime-agnostic core; `makeInMemoryStorageLayer` (Map adapter), `makeSerializerLayer`, `inferCodecsFromConfig`; `@proseql/browser` exists (localStorage/IndexedDB) but is unneeded — the Map adapter suffices.
- `@tanstack/react-router` — `createBrowserHistory` / `createHashHistory` / `createMemoryHistory` are the navigation-port adapters (one router, swapped history).

---

## Key Technical Decisions

- **Ports-and-adapters, three ports only (R1):** the surface reads data atoms, navigates via the router, and subscribes to `useInputAction`. Hosts differ only in the adapter triple. This dissolves the earlier "routes in portal vs surface" fork — navigation becomes a port like data already is.
- **Navigation = one router, swapped history:** browser → `createBrowserHistory`, Electrobun → `createHashHistory`/memory (custom protocol makes `pushState` unreliable), design tool → `createMemoryHistory` (also enables deep-link-on-mount for the gallery).
- **Option A for ProseQL (one shared definition, storage swapped):** `openInMemoryKorriLibraryDb` reuses the same config/guards/host-check as the fs opener; only the storage layer differs. Avoids a second source of truth. (Landed in U1.)
- **Browser-safety via module split, not rewrite:** `library-db.ts` statically imports `node:fs`, so the in-memory opener must live in a runtime-agnostic `library-db-core.ts` that the browser imports; the node-only fs opener/sidecars stay in `library-db.ts` importing the core.
- **ProseQL stays out of shipped bundles (R5):** the in-memory engine is a design-tool/e2e adapter under `tools/`; the portal/Electrobun use RPC/bridge adapters unchanged.
- **`catalogFactsFromLibrarySource` is a real adapter, not a mock:** it derives `CatalogSnapshotFacts` from a real `LibrarySource` (entries = real `listPlayableEntries`, no peers). The library is genuinely ProseQL; only the no-federation assembly is new.
- **Select → detail → Play (R4):** flip `ShiftHomeRail`'s `onItemClick` to navigate; Play on detail drives the launcher. Honest device-behavior change, localized to the injected handler.

---

## Open Questions

### Resolved During Planning

- Real ProseQL in the design tool vs lightweight in-memory data? → Real, everywhere (cheap once Option A's split is done).
- One shared route tree vs portal-owned routes? → One shared tree, mounted by all hosts (single source of truth).
- Detail richness now? → Title + art + Play; defer metadata.
- Rollout? → Design-tool-first, then portal, then Electrobun.

### Deferred to Implementation

- Whether `makeSerializerLayer` needs an in-memory persistence helper wrapper — resolved already in U1 (it's exported from `@proseql/core`); flagged here only as the kind of thing that surfaces at code time.
- Exact `mountShift` signature ergonomics (object vs positional adapters) — settle when writing U5 against the real call sites.
- Whether the design tool's gallery deep-links by pushing memory history at mount or via an initial-entries prop — settle in U5/U6 against TanStack's API.
- How the Electrobun custom protocol resolves with `createHashHistory` vs memory — confirm at U8 against the real desktop shell.

---

## Output Structure

    product/platform/library/proseql/
      library-db-core.ts        # NEW: runtime-agnostic config/builder/guards/in-memory opener
      library-db.ts             # node-only fs opener + sidecars, imports core
    product/platform/catalog/
      catalog-facts-from-library.ts        # NEW: derive CatalogSnapshotFacts from a LibrarySource
      catalog-facts-from-library.test.ts   # NEW
    product/surfaces/web/shift/
      mount-shift.tsx           # NEW: the one composition root (data/navigation/input adapters)
      routes/                   # NEW: shared surface route tree (home, game/$id)
    tools/seed-proof/
      seed-proseql.ts           # NEW: in-memory ProseQL seed adapter (real engine)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                 surface (Shift) — knows only 3 ports
        ┌───────────────┬──────────────────┬───────────────┐
        │ data port     │ navigation port  │ input port    │
        │ catalog/lib/  │ router + history │ useInputAction│
        │ launcher atoms│                  │               │
        └──────┬────────┴────────┬─────────┴──────┬────────┘
   design tool │           browser │       electrobun│
   seed: real  │           RPC     │       bridge    │   ← data adapter
   in-mem      │           layer   │       layer     │
   ProseQL     │                   │                 │
   memory hist │           browser │       hash/mem  │   ← nav adapter
   no input bus│           spatial │       native    │   ← input adapter

mountShift(host, { data, navigation, input }):
  <RegistryProvider> seed data layers
    <RouterProvider router=createRouter({ sharedRouteTree, history })>
      <InputProvider bus=input?>  <Outlet/>  // shared routes/screens
```

Two route trees, two levels (do not merge): the **surface** route tree (`/`, `/game/$id`) is shared and singular; the **tool** route tree is a superset that embeds a surface instance and deep-links it (`/lab/$device/$identity/*surfaceRoute`). The surface never learns it is embedded, deep-linked, or shown at multiple sizes — intrinsic-design handles sizing; the tool supplies only the adapter triple + a sized container.

---

## Implementation Units

### U1. In-memory ProseQL engine opener (LANDED — `92f88c98`)

**Goal:** Prove the real ProseQL engine + korri repository run fully in memory (no fs), as the seam the seed adapter builds on.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `product/platform/library/proseql/library-db.ts` (storage-mode sidecars + `openInMemoryKorriLibraryDb`)
- Test: `product/platform/library/proseql/in-memory-library-db.test.ts`

**Approach:** Same `makeKorriLibraryDbConfig`/guards/host-check as the fs opener; swap `NodeStorageLayer` for `makeInMemoryStorageLayer` + `makeSerializerLayer([korriReadableYamlCodec])`; prime the Map with an empty outbox so the document-source root exists. Status: landed and verified (seed every fixture via `repository.upsertGame`, read back via `listPlayableEntries`; 66 proseql tests pass).

**Test scenarios:** Happy path — seed all game fixtures, list returns them all (done).

**Verification:** `bun test product/platform/library/proseql/` green (achieved).

---

### U2. Split the library DB into a browser-safe core

**Goal:** Move the runtime-agnostic library definition out of the `node:fs`-importing module so the in-memory opener can bundle in the browser.

**Requirements:** R3, R5

**Dependencies:** U1

**Files:**
- Create: `product/platform/library/proseql/library-db-core.ts`
- Modify: `product/platform/library/proseql/library-db.ts` (import core; keep fs opener + fs sidecars + node imports here)
- Test: `product/platform/library/proseql/in-memory-library-db.test.ts` (re-point import; must still pass)

**Approach:** Move `makeKorriLibraryDbConfig`, `collectionsSchema`, the `KorriLibraryDb` types, `withCanonicalCollectionGuards`, the singleton-host check, the in-memory sidecar path, and `openInMemoryKorriLibraryDb` into `library-db-core.ts` (no `node:*` imports; use web-standard `crypto.randomUUID()`). `library-db.ts` re-exports from core and keeps `openKorriLibraryDb`, fs sidecars, and the `node:fs`/`node:path` usage. Verify the core has zero `node:` imports so a browser bundle never pulls fs.

**Patterns to follow:** The existing module's exports; keep public import paths stable via re-export from `library-db.ts`.

**Test scenarios:**
- Happy path — the U1 in-memory test still passes against the core opener.
- Integration — `openKorriLibraryDb` (fs) still works (all `product/platform/library/proseql/` tests green).
- Edge — grep asserts `library-db-core.ts` contains no `node:` import (guard against fs creeping back in).

**Verification:** All proseql tests green; `library-db-core.ts` imports nothing from `node:*`; typecheck adds zero errors.

---

### U3. CatalogFacts-from-LibrarySource adapter

**Goal:** Derive `CatalogSnapshotFacts` from a real `LibrarySource` (single local host, no peers) so a seeded library drives the Home's catalog atom.

**Requirements:** R3, R6

**Dependencies:** None (parallel with U2)

**Files:**
- Create: `product/platform/catalog/catalog-facts-from-library.ts`
- Test: `product/platform/catalog/catalog-facts-from-library.test.ts`

**Approach:** Export `catalogFactsFromLibrarySource(source): Layer<CatalogFactsSource>` whose `snapshot` maps `source.listPlayableEntries()` into `CatalogEntry[]` (each tagged with a local `EntrySource`), with `peers: []` and a `ready`/single-host health summary. Reuse the `CatalogSnapshotFacts` shape from `catalog-facts-source.ts`.

**Patterns to follow:** `makeInMemoryCatalogFactsSourceLayer` (shape of the returned layer); the server-side snapshot handler for the facts assembly fields.

**Test scenarios:**
- Happy path — a source with N entries yields facts with N catalog entries, `readyPeers: 1`, `peers: []`.
- Edge — empty source yields zero entries and a valid (non-failing) health summary.
- Error path — a failing `listPlayableEntries` surfaces as a `CatalogFactsError`, not an unhandled throw.

**Verification:** Tests green; the layer satisfies the `CatalogFactsSource` contract used by `catalogSnapshotAtom`.

---

### U4. Seeded in-memory ProseQL adapter (design-tool/e2e)

**Goal:** A `tools/`-only adapter that opens the in-memory ProseQL DB, seeds real games through the repository, and exposes a `LibrarySource` for the design tool — never imported by shipped bundles.

**Requirements:** R3, R5, R6

**Dependencies:** U2, U3

**Files:**
- Create: `tools/seed-proof/seed-proseql.ts`
- Modify: `tools/seed-proof/seed.ts` (build the seeded source + adapter initial values)

**Approach:** `makeSeededLibrarySource(games)` → `openInMemoryKorriLibraryDb()` → `createLibraryRepository` → `upsertGame` per seed → `createProseqlLibrarySource(repo)`. Compose initial atom values: `[catalogFactsSourceLayerAtom, catalogFactsFromLibrarySource(source)]`, `[librarySourceLayerAtom, Layer.succeed(LibrarySource)(source)]`, `[launcherLayerAtom, makeInMemoryLauncherLayer(...)]`. Reuse the curated SteamGridDB seed set (`product/surfaces/web/shift/dev-game-media.ts`) mapped to `GameRecord`s.

**Patterns to follow:** `tools/testing/library/with-temp-proseql-library.ts` seed loop; the current `tools/seed-proof/seed.ts` adapter-values shape.

**Test scenarios:** Test expectation: none — exercised end-to-end by U6's design-tool verification (it's a thin composition of U1–U3 which are unit-tested). A node smoke (`makeSeededLibrarySource` → `listPlayableEntries` non-empty) may be added if it earns its keep.

**Verification:** The seeded source returns the curated games via `listPlayableEntries`; importing it does not pull `node:fs` (bundles for the browser).

---

### U5. `mountShift` composition root + shared surface route tree

**Goal:** One mount entry point and one shared route tree (`/`, `/game/$id`) that every host uses, differing only in the adapter triple.

**Requirements:** R1, R2

**Dependencies:** U4 (design tool is the first consumer)

**Files:**
- Create: `product/surfaces/web/shift/mount-shift.tsx`
- Create: `product/surfaces/web/shift/routes/` (shared route tree: home + game/$id)
- Modify: `tools/seed-proof/main.tsx` (call `mountShift` with memory history + seeded data + no input bus)
- Test: `product/surfaces/web/shift/mount-shift.test.tsx`

**Approach:** `mountShift(host, { data, navigation, input })` wraps `<RegistryProvider>` (seed `data` layers via `useAtomInitialValues`) → `<RouterProvider router={createRouter({ routeTree, history: navigation.history })}>` → optional input provider → `<Outlet/>`. The route tree references the existing `ShiftHomePage` and `ShiftGameDetailScreen`. The surface must contain no environment branching and no `@product/apps/*` import (boundary test enforces the latter). The design tool's harness becomes `mountShift` with the seed/memory/no-input triple — proving the harness runs the real surface, not a copy.

**Execution note:** Keep navigation behind the port — surface code calls `useNavigate`/`Link`/`useParams`, never a host router directly.

**Technical design:** See High-Level Technical Design — the `mountShift` sketch is the contract; treat as directional.

**Patterns to follow:** `HomeRuntimeLayersRoot.tsx` (registry + initial values); the current `tools/seed-proof/main.tsx` code-based router.

**Test scenarios:**
- Happy path — `mountShift` with a seeded data adapter + memory history renders Home with the seeded games.
- Integration — the surface tree imports nothing from `@product/apps/*` (extend `tools/testing/standards/product-reorg-boundaries.test.ts` coverage or add a focused assertion).
- Edge — mounting with no input bus does not throw (`useInputAction` no-ops).

**Verification:** Design tool runs Home through `mountShift`; boundary test green; typecheck zero new errors.

---

### U6. Home→detail click-through + represented launch lifecycle

**Goal:** Selecting a game navigates to its detail; Play drives the real launch lifecycle (represented); `back`/`confirm` work via semantic input.

**Requirements:** R2, R4, R6, R7

**Dependencies:** U5

**Files:**
- Modify: `product/surfaces/web/shift/routes/` (home route wires `ShiftHomeRail` `onItemClick` → `navigate("/game/$id")`; detail route reads `$id` from the seeded catalog atom)
- Modify: `product/surfaces/web/shift/pages/ShiftGameDetailScreen.tsx` (Play → launcher; only if a seam change is needed)
- Test: `product/surfaces/web/shift/routes/home-route.test.tsx`, `product/surfaces/web/shift/routes/detail-route.test.tsx`

**Approach:** Home's `onItemClick` navigates instead of launching. Detail resolves the focused entry from the same `catalogSnapshotAtom` by route param and renders title + cover + Play. Play calls the launch path (`launchAtom`/`launch.start`) so the in-memory launcher drives launching → running → exited — a genuine state, no process. Wire `useInputAction("back")` → router back and tile `confirm` → navigate so the flow works gamepad-only, not just mouse.

**Execution note:** Start with a failing test for `select → detail route` and `Play → launching state`, then wire.

**Test scenarios:**
- Happy path — clicking/confirming a Home tile routes `/` → `/game/$id` for that game (Covers R2).
- Happy path — `back`/Escape from detail returns to `/`.
- Happy path — Play on detail transitions the launch state to launching→running via the in-memory launcher (Covers R4).
- Edge — a `/game/$id` for an unknown id renders a not-found/empty state rather than throwing.
- Integration — focus moves and navigation both fire from a single semantic `confirm` (input port), not only pointer clicks.

**Verification:** In the design tool (no backend): `home → select → detail → Play (lifecycle) → back` works end to end via keyboard/gamepad semantics; route tests green.

---

### U7. Re-point the browser portal at `mountShift`

**Goal:** The website runs the same surface + route tree via `mountShift` with the RPC data adapter and browser history — no ProseQL in the bundle.

**Requirements:** R1, R2, R5, R8

**Dependencies:** U6

**Files:**
- Modify: `product/apps/portal/routes/+index.tsx` (and/or `SurfaceHost`/`entry.tsx`) to mount Shift via `mountShift` with `{ data: RPC layers, navigation: browser history, input: spatial-nav bus }`
- Modify: `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` (fold its layer seeding into the `mountShift` data adapter, or have `mountShift` consume it)
- Test: existing portal route tests; add/adjust a mount smoke if warranted

**Approach:** Replace the bespoke imperative mount with `mountShift`, feeding the existing `LibrarySourceLayerRpc`/`CatalogFactsSourceLayerRpc`/`LauncherLayerRpc` as the data adapter and `createBrowserHistory` as the navigation adapter. Confirm the shipped bundle imports no ProseQL (the seed adapter lives only in `tools/`). Keep evier/vigie surfaces mounting as before (R8).

**Approach risk:** This reworks the `SurfaceHost`/`entry` contract; verify evier/vigie still mount. I cannot fully run the real portal+API here — verify by build + typecheck + the design-tool mirror; user confirms the live click-through on `just dev`.

**Test scenarios:**
- Integration — portal route tests pass; `/` renders Shift Home via `mountShift`.
- Edge — bundle/import check: no `@proseql/*` or `library-db-core` in the portal client graph.
- Happy path — evier/vigie routes/surfaces still resolve (regression guard for `825d6f1c`).

**Verification:** `just build-web` green; portal tests green; no ProseQL in the client bundle; user-confirmed click-through on `just dev`.

---

### U8. Re-point Electrobun at `mountShift`

**Goal:** The desktop app runs the same surface + route tree via `mountShift` with the bridge data adapter and hash/memory history.

**Requirements:** R1, R2, R5

**Dependencies:** U7

**Files:**
- Modify: `product/surfaces/web/shift/entry.tsx` (desktop mount path → `mountShift` with bridge layers + hash/memory history)
- Modify: desktop entry wiring under `product/apps/desktop/` as needed

**Approach:** Feed the existing bridge layers (`createBridgeCatalogFactsSourceLayer`, `createBridgeLibrarySourceLayer`, `createBridgeLauncherLayer`, `createBridgeForegroundSessionLayer`) as the data adapter; use `createHashHistory` (or memory) since the custom/file protocol makes `pushState` unreliable; wire the native input bridge as the input adapter. No ProseQL in the bundle.

**Approach risk:** Cannot run Electrobun here — verify by build + typecheck; user confirms on-device/desktop. Confirm the history choice against the real protocol at code time.

**Test scenarios:** Test expectation: none beyond build/typecheck — runtime behavior is host-specific and user-verified. Add a desktop mount smoke only if a cheap one exists.

**Verification:** Desktop build/typecheck green; user-confirmed click-through in Electrobun; no ProseQL in the bundle.

---

## System-Wide Impact

- **Interaction graph:** `mountShift` becomes the single mount path for Shift across portal, Electrobun, and the design tool; `SurfaceHost`/`entry.tsx` contract changes (U7/U8). The `ShiftHomeRail.onItemClick` seam changes meaning (launch → navigate).
- **Error propagation:** the catalog-facts adapter (U3) must surface `listPlayableEntries` failures as `CatalogFactsError` so the Home's existing load-error state renders rather than throwing.
- **State lifecycle risks:** in-memory ProseQL writes are debounced; seed must complete (`flush`) before reads in the seed adapter (U4). Each design-tool device frame mounts an independent surface/router instance — no shared global router.
- **API surface parity:** all three hosts must end up on `mountShift`; leaving one on the old imperative mount reintroduces divergence (the exact problem this plan removes).
- **Integration coverage:** the design-tool click-through (U6) is the integration proof unit tests can't give — real engine, real atoms, real router.
- **Unchanged invariants:** the catalog snapshot RPC contract, `LibrarySourceLayerLive` (server ProseQL), and the evier/vigie surfaces are explicitly unchanged. Shipped bundles must remain ProseQL-free (R5).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Splitting `library-db.ts` (U2) regresses the fs opener | Re-export to keep import paths stable; run all proseql tests; grep-assert core has no `node:` imports |
| Re-pointing the portal (U7) breaks evier/vigie or the surface-host contract | Land design-tool-first; explicit regression test that evier/vigie still mount; build + user-confirmed `just dev` |
| Can't run real portal/Electrobun in this environment | Verify via build + typecheck + design-tool mirror; user does final click-through; risks called out per-unit |
| `select → detail` is a real device-behavior change | Localized to the injected `onItemClick`; launch still reachable via detail Play; surfaced and confirmed with the user |
| ProseQL leaks into a shipped bundle | Seed adapter is `tools/`-only; U7/U8 add an import/bundle check for `@proseql/*` |
| Electrobun history choice (hash vs memory) wrong for the protocol | Confirm against the real desktop shell at U8; both are swappable behind the nav port |

---

## Sources & References

- Related code: `product/platform/library/proseql/library-db.ts`, `product/platform/catalog/catalog-facts-source.ts`, `product/platform/react/{catalog,library}/*-atoms.ts`, `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx`, `product/surfaces/web/shift/{entry.tsx,pages/ShiftHomePage.tsx,organisms/ShiftHomeRail.tsx}`, `tools/seed-proof/*`
- Related commits: `92f88c98` (in-memory ProseQL opener, U1), `825d6f1c` (evier/vigie hack routes pulled), `de4b336c` (seed-proof home→detail prototype)
- Prior art: `work/items/active/01KV10SX4W8N8S25SPJK0M31E5-theme-owned-catalog-facts`, `work/items/active/01KV0RYJWKZHVBZ8ZVBHXHP63A-unified-catalog-fabric`
- External: `@proseql/core` (runtime-agnostic core, in-memory adapter), `@tanstack/react-router` (history adapters)
