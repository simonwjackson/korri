---
title: refactor: Move catalog reads to theme-owned facts
type: refactor
status: active
date: 2026-06-13
verify_command: "bun test product/apps/portal/api/catalog/snapshot.rpc.test.ts product/apps/portal/api/catalog/snapshot.rpc-handler.test.ts product/apps/portal/api/hono-app.test.ts product/apps/portal/api/server/rpc-server.test.ts product/apps/portal/peers/catalog-peer-state.test.ts product/apps/portal/peers/peer-source-fetcher.test.ts product/apps/portal/features/home/catalog-rpc-layers.test.ts product/apps/portal/features/home/HomeRuntimeLayersRoot.test.tsx product/platform/catalog/catalog-facts-source.test.ts product/platform/react/catalog/catalog-atoms.test.ts product/themes/shift/catalog/shift-catalog-state.test.ts product/themes/shift/pages/ShiftHomePage.test.tsx product/themes/shift/pages/ShiftHomeReadyBody.test.tsx product/themes/shift/templates/ShiftHomeRoot.test.tsx product/apps/portal/features/dual-screen/DualScreenRouteRoot.test.tsx product/apps/portal/platform-bridge.test.ts product/apps/portal/control/korri-control-rpc.test.ts product/apps/portal/stream/remote-stream-client.test.ts packages/pi-korrid-tools/tests/korrid-tools.test.ts tools/testing/standards/catalog-api-boundaries.test.ts"
---

# refactor: Move catalog reads to theme-owned facts

## Summary

Replace Korri's list-oriented library read contract with a full-break, theme-neutral catalog facts contract. `korrid` will expose coordinator-relative facts over one canonical RPC for local UI, remote UI, and peer federation; shared React/platform code will provide transport and caching only; Shift and other themes will own their own interpretation of loading, empty, degraded, and ready states.

---

## Problem Frame

The recent unified catalog fabric fixed Bandai's immediate `Loading library…` failure by making local games render while peers fail independently. The remaining architecture still lets shared UI plumbing decide too much: `libraryItemsAtom` strips catalog facts down to entries, `LibraryListStateRoot` imposes a universal loading/error/empty/ready model, and multiple RPCs (`app.library.list`, `app.library.snapshot`, `app.source.list`) encode overlapping catalog concepts. That makes it too easy for a theme to inherit another layer's interpretation instead of defining its own experience.

---

## Requirements

- R1. The server must not care where the UI is running; catalog facts must have the same meaning for embedded, browser, remote, and agent clients.
- R2. `self`, `isLocal`, and equivalent source identity fields are coordinator-relative facts, not UI-device-relative labels.
- R3. Replace list-oriented catalog reads with one canonical, theme-neutral catalog facts RPC used by UI reads and peer federation.
- R4. The canonical RPC must support both full fabric reads and bounded self/coordinator reads without recursive peer fan-out.
- R5. Shared platform/React code must expose transport, cache, refresh, and typed facts; it must not define universal library presentation states.
- R6. Themes must own their own catalog interpretation and presentation state, including loading, empty, degraded, peer-failed, and ready experiences.
- R7. Split catalog read facts from launch resolution/routing while preserving structural source identity needed to launch local and remote entries.
- R8. This is an intentional full break: migrate all in-repo callers and remove/replace `app.library.list`, `app.library.snapshot`, `app.source.list`, `libraryItemsAtom`, `LibrarySource` list reads, and `LibraryListStateRoot` instead of preserving compatibility shims.
- R9. Local/coordinator catalog reads must be bounded and produce explicit self status (`loading`, `ready`, `failed`) so a slow/broken local source cannot become an unclassified infinite UI loading state.
- R10. Tooling and agent surfaces that discover games must migrate to the new catalog facts contract in the same slice.

---

## Scope Boundaries

- Do not create a backend-owned home-screen model. `korrid` exposes facts; themes define the experience.
- Do not make catalog facts relative to the screen/device that requested them. Coordinator-relative identity is the stable server contract.
- Do not redesign visual styling, layout, rail composition, or theme personality beyond the state-boundary changes needed to consume catalog facts.
- Do not change game launch semantics beyond splitting read facts from launch resolution and preserving source identity through existing launch routing.
- Do not solve LAN reachability between Bandai, aka, and zao in this plan; peer timeout facts must be represented, not hidden.
- Do not preserve old catalog-read APIs as compatibility aliases after in-repo consumers are migrated.

### Deferred to Follow-Up Work

- Durable on-disk peer catalog cache across daemon restarts.
- Rich per-theme UX for peer diagnostics beyond Shift's first interpretation of the facts.
- Cross-version peer compatibility for mixed old/new Korri hosts. This plan assumes the user's current operational posture: hosts can move to latest Korri together.

---

## Context & Research

### Relevant Code and Patterns

- `product/apps/portal/api/library/snapshot.rpc.ts` already carries the closest existing facts shape: entries, peers, health, generation, and updatedAt.
- `product/apps/portal/api/library/catalog-snapshot.ts` owns the current coordinator snapshot and is the right starting point, but it currently triggers peer refresh from snapshot reads and uses an unsafe refresh scope.
- `product/apps/portal/peers/peer-source-fetcher.ts` isolates peer catalog fetches and currently calls `app.source.list`; this is the seam to move peer federation onto the canonical catalog facts RPC with a self-only/no-fan-out mode.
- `product/apps/portal/features/home/library-source-layer-rpc.ts` currently calls `app.library.snapshot` but discards peer facts and exposes old `LibrarySource` list/launch methods.
- `product/platform/react/library/library-atoms.ts` exports `libraryItemsAtom`, which returns entries only and refreshes every second.
- `product/platform/library/library-list-state.ts` and `product/platform/react/library/library-list-state-root.tsx` define a shared universal interpretation that themes should own instead.
- `product/themes/shift/pages/ShiftHomePage.tsx` and `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx` are the current UI consumers of `libraryItemsAtom` and `LibraryListStateRoot`.
- `product/apps/portal/platform-bridge.ts`, `product/apps/portal/control/korri-control-rpc.ts`, `product/apps/portal/stream/remote-stream-client.ts`, and `packages/pi-korrid-tools/src/korrid-tools.ts` are non-theme consumers that hardcode `app.library.list` or `app.source.list` and must be migrated in the full break.
- `product/platform/api/rpc/envelope-guard.ts` and existing Hono RPC tests are the pattern to preserve for LAN-facing RPC safety.

### Institutional Learnings

- `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`: themes are autonomous web apps; Korri provides capabilities, not experience structure. This directly supports theme-owned catalog interpretation.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`: one service owns truth and standard RPC surfaces proxy it. Catalog status should follow the same source-of-truth discipline.
- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: plugins/services contribute data and actions, not DOM or slots. Catalog services should publish facts; themes decide presentation.
- `docs/solutions/best-practices/electrobun-portal-via-localhost-bun-and-cage-input-passthrough-2026-05-27.md`: desktop remains a thin loopback/same-origin host and must not learn catalog semantics.
- `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md`: every LAN-facing RPC path must keep the envelope guard so malformed peer/client frames cannot crash the RPC pipeline.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`: state conversion should happen once at the domain/theme boundary. In this plan, that boundary moves from shared platform into Shift/theme code.

### External References

- External research skipped. The repo has direct current patterns for Effect RPC, Hono wiring, peer discovery/fetch, Atom-based React state, theme boundaries, and platform bridge/tooling consumers.

---

## Key Technical Decisions

- Canonical catalog facts RPC: introduce `app.catalog.snapshot` as the single catalog-read contract. It replaces `app.library.list`, `app.library.snapshot`, and `app.source.list` for in-repo UI, tooling, and peer federation.
- One tag, explicit scope: `app.catalog.snapshot` supports a full-fabric coordinator read and a self-only bounded read. Peer federation uses the self-only mode so coordinators do not recursively fan out through each other.
- Coordinator-relative identity: entries and peers may carry `source`/`isLocal` as structural routing facts, but those facts describe the coordinator that produced the snapshot, not the UI location.
- Theme-neutral facts only: the server response carries entries, peers, health/status, generation/update metadata, and sanitized failure facts. It does not carry home-screen sections, banners, rails, copy, or universal UI states.
- Split read and launch services: replace the list-oriented `LibrarySource` read path with a catalog-facts read service, and keep launch resolution/routing behind launch-oriented services and RPCs.
- Remove shared UI interpretation: delete/replace `LibraryListStateRoot` and `LibraryListState`; Shift creates a theme-owned state root, while dual-screen either composes that Shift experience explicitly or owns a small dual-screen adapter over the same facts.
- Full in-repo break: old RPC tags (`app.library.list`, `app.library.snapshot`, `app.source.list`) and old atom/service names should fail at compile/test time after migration rather than silently adapting old shapes.
- Bounded self status: the coordinator must report explicit self status and should not block a facts response indefinitely on local source or peer fan-out work.

---

## Open Questions

### Resolved During Planning

- Should the server emit a home-screen/view-model response? No. Theme defines the experience; server emits location-agnostic facts.
- Is `self` relative to the coordinator or the UI device? Coordinator-relative.
- Should `libraryItemsAtom` remain as a compatibility helper? No. This is a full break; callers should migrate to facts-first contracts.
- Should the lower-level `LibrarySource` read contract also change? Yes. Replace list-oriented reads with catalog facts.
- Should catalog reading and launch resolution split? Yes. Read facts and launch routing are separate responsibilities.
- Should the shared universal `LibraryListStateRoot` remain? No. Themes own interpretation.
- Should dual-screen and other current consumers migrate in the same plan? Yes. No legacy UI consumer should remain.
- Should `app.library.list` survive as a compatibility RPC? No. Remove/replace it as part of the full break.
- Should peer federation use the same canonical facts RPC? Yes, with a self-only/no-fan-out mode to avoid recursion.
- Should local reads be bounded with explicit self status? Yes.

### Deferred to Implementation

- Exact type names and module names for the new catalog service: choose while aligning with nearby platform naming, but preserve the facts-first boundary.
- Exact timeout values for bounded self reads and peer reads: select the smallest safe defaults based on existing peer timeout patterns.
- Exact Shift diagnostic presentation for failed/loading peers: theme-owned and can evolve during implementation, provided facts are available and local ready entries are not hidden.
- Whether generation remains an in-memory counter or becomes timestamp-like: implementation should ensure renderers treat daemon restart snapshots as fresh, not stale.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Target ownership
════════════════

korrid / catalog coordinator
  └─ owns facts
     - entries
     - coordinator-relative source identity
     - peers and self status
     - bounded failure/loading facts

platform RPC / browser / React adapters
  └─ own transport and cache
     - canonical RPC schema
     - fetch/refresh atoms
     - no universal loading/empty/ready interpretation

product themes
  └─ own experience
     - Shift decides what Loading means
     - Shift decides whether peer failures are subtle or prominent
     - another theme may interpret the same facts differently

Electrobun desktop
  └─ owns local same-origin piping only
     - no peer selection
     - no catalog interpretation
```

```text
Canonical catalog RPC modes
═══════════════════════════

UI / agent / browser client
  └─ app.catalog.snapshot(scope: fabric)
       returns coordinator self + known remote peer facts
       may refresh peers asynchronously

PeerSourceFetcher on another coordinator
  └─ app.catalog.snapshot(scope: self)
       returns only that coordinator's own catalog facts
       must not trigger peer fan-out
       prevents A → B → A recursive federation
```

---

## Implementation Units

### U1. Define the canonical catalog facts protocol

**Goal:** Replace overlapping list/source/snapshot wire shapes with one theme-neutral catalog facts contract that supports full-fabric and self-only reads.

**Requirements:** R1, R2, R3, R4, R7, R8, R9

**Dependencies:** None

**Files:**
- Create/Modify: `product/apps/portal/api/catalog/snapshot.rpc.ts`
- Modify: `product/apps/portal/api/library/snapshot.rpc.ts`
- Modify: `product/apps/portal/api/library/list.rpc.ts`
- Modify: `product/apps/portal/api/source/list.rpc.ts`
- Test: `product/apps/portal/api/catalog/snapshot.rpc.test.ts`
- Test: `product/apps/portal/api/server/rpc-server.test.ts`

**Approach:**
- Introduce `app.catalog.snapshot` as the single catalog-read RPC.
- Move the current snapshot response vocabulary into a catalog namespace and make the payload carry an explicit read scope: full fabric for UI/tooling and self-only for peer federation.
- Keep entries as theme-neutral playable facts with structural `EntrySource` for coordinator-relative routing.
- Use one vocabulary for entry identity/display fields; prefer the richer playable-library vocabulary (`title`, releases, source) over `displayName`. Do not treat `streamable` as a synonym for `launchable`: catalog facts may state intrinsic release launchability, while stream-preparation capability remains launch/control-domain information.
- Mark old list/source RPC definitions for removal in later units rather than maintaining aliases.

**Patterns to follow:**
- `product/apps/portal/api/library/snapshot.rpc.ts` for Effect RPC schema structure.
- `product/apps/portal/api/server/rpc-server.test.ts` for RPC group registration expectations.
- `product/platform/api/rpc/entry-source.ts` for coordinator-relative source identity.

**Test scenarios:**
- Happy path: schema decodes a full-fabric snapshot with self peer, remote peer, entries, health, generation, and updatedAt.
- Happy path: schema decodes a self-only snapshot with self status and entries but no remote peer fan-out requirement.
- Edge case: empty but ready self catalog is valid and distinguishable from self loading.
- Error path: failed self status can carry a sanitized error fact without requiring entries.
- Contract: `serverRpcGroup` and `appRpcGroup` expose `app.catalog.snapshot` and no longer expose old list/source catalog read tags once downstream units remove them.

**Verification:**
- There is one canonical catalog facts RPC type for UI, tools, and peers.
- The protocol distinguishes full-fabric reads from self-only reads without introducing theme presentation language.

### U2. Rework the coordinator snapshot service around bounded self facts

**Goal:** Make catalog facts production explicit about self status, bounded local reads, peer state, and non-recursive self-only snapshots.

**Requirements:** R2, R4, R7, R9

**Dependencies:** U1

**Files:**
- Modify/Create: `product/apps/portal/api/catalog/catalog-snapshot.ts`
- Modify: `product/apps/portal/api/library/catalog-snapshot.ts`
- Modify: `product/apps/portal/peers/catalog-peer-state.ts`
- Test: `product/apps/portal/api/catalog/snapshot.rpc-handler.test.ts`
- Test: `product/apps/portal/peers/catalog-peer-state.test.ts`

**Approach:**
- Split the current `getSnapshot()` behavior into a self-read path and full-fabric path.
- Ensure self-only reads do not trigger peer discovery refresh or call remote peers.
- Ensure full-fabric reads can return promptly with the current peer cache and explicit peer loading/failed facts.
- Use a scoped catalog refresh lifecycle for this slice: the catalog snapshot/facts live layer owns the peer-refresh scope, forks refreshes into that scope, and closes/cancels in-flight refresh work when the layer is disposed.
- Add sanitization/clamping for error strings that cross LAN-facing catalog facts, following the sessiond status precedent.
- Treat generation as renderer reconciliation metadata, not a cross-restart global clock; tests should pin restart-safe consumer behavior rather than assuming durable monotonicity unless implementation chooses durable generation.

**Execution note:** Characterization-first around the existing snapshot service: pin self-ready-with-peer-failed behavior and no-recursive-self-read behavior before restructuring.

**Patterns to follow:**
- `product/apps/portal/api/library/catalog-snapshot.ts` for current snapshot assembly.
- `product/apps/portal/peers/catalog-peer-state.ts` for self and peer records.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` for one-owner status semantics and error redaction posture.

**Test scenarios:**
- Happy path: self-only snapshot returns coordinator entries with self `ready` and does not include remote entries.
- Integration: full-fabric snapshot returns self entries immediately while a remote peer remains `loading`.
- Error path: local source failure yields self `failed` and sanitized error facts instead of an unclassified transport defect.
- Error path: peer timeout yields peer `failed` and preserves self entries.
- Edge case: empty local catalog with self `ready` returns zero entries and is not confused with self `loading`.
- Regression: two coordinators discovering each other cannot cause recursive A→B→A snapshot fan-out when peer fetch uses self-only scope.
- Lifecycle: peer refresh work is scoped/cancelable and cannot keep writing after the catalog snapshot service is disposed.

**Verification:**
- Full-fabric reads are prompt and peer-failure tolerant.
- Self-only reads are bounded, coordinator-relative, and no-fan-out.
- Error facts crossing the RPC boundary are safe to show/log without leaking internal paths.

### U3. Move peer federation to the canonical catalog facts RPC

**Goal:** Replace `app.source.list` federation pulls with self-only `app.catalog.snapshot` reads while preserving peer entry source tagging and launch routing facts.

**Requirements:** R2, R3, R4, R7, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `product/apps/portal/peers/peer-source-fetcher.ts`
- Modify: `product/apps/portal/api/source/list.rpc-handler.ts`
- Modify: `product/apps/portal/api/source/list.rpc.ts`
- Test: `product/apps/portal/peers/peer-source-fetcher.test.ts`
- Test: `product/apps/portal/api/source/list.rpc-handler.test.ts`

**Approach:**
- Update `PeerSourceFetcher` to request self-only catalog facts from each peer.
- Map peer self entries into the coordinator's remote-entry cache without changing their host identity incorrectly, using the smallest catalog-facts projection needed for federation so LAN peer pulls do not hydrate theme-only or presentation-only data.
- Keep old source handler removal out of this unit; U3 only migrates `PeerSourceFetcher` to the new facts contract and updates any local adapters needed for that migration.
- Preserve `EntrySource` on entries as structural routing metadata; the split from launch resolution does not remove the facts needed to route remote launches.
- Ensure peer fetch failure remains a peer state fact, not a failed coordinator snapshot.

**Patterns to follow:**
- Current `peer-source-fetcher.ts` timeout/error handling and tests.
- `product/apps/portal/api/library/list.rpc-handler.test.ts` peer partial-failure scenarios from the previous catalog fabric plan.

**Test scenarios:**
- Happy path: fetching a peer via self-only catalog facts tags returned entries with the peer's host identity and `isLocal: false` from the requesting coordinator's perspective.
- Error path: peer RPC timeout returns a failed peer state and no entries.
- Regression: peer fetch does not call a full-fabric snapshot and therefore does not recursively fetch the requester.
- Contract: no production caller still depends on `SourceCatalogGame.displayName` or `streamable`, and tests keep stream-preparation capability out of catalog facts.

**Verification:**
- Peer federation uses the same canonical facts schema as UI/tooling without recursive fan-out.
- `PeerSourceFetcher` no longer calls `app.source.list`; final public RPC-group removal is owned by U9.

### U4. Split platform catalog facts from launch resolution

**Goal:** Replace the overloaded list-oriented `LibrarySource` read path with a facts-first catalog service while keeping launch resolution/routing explicit and separate.

**Requirements:** R5, R7, R8

**Dependencies:** U1, U2

**Files:**
- Modify/Create: `product/platform/library/library-services.ts`
- Create: `product/platform/catalog/catalog-facts-source.ts`
- Modify: `product/apps/portal/features/home/library-source-layer-rpc.ts`
- Modify/Create: `product/apps/portal/features/home/catalog-source-layer-rpc.ts`
- Modify: `product/platform/library/library-source-layer-live.ts`
- Modify: `product/platform/library/library-source-layer-memory.ts`
- Test: `product/apps/portal/features/home/catalog-rpc-layers.test.ts`
- Test: `product/platform/catalog/catalog-facts-source.test.ts`

**Approach:**
- Introduce a catalog facts source service that reads `app.catalog.snapshot` and returns typed facts unchanged.
- Move or keep launch-specific behavior (`launchSpecFor`, `resolveLaunchForGame`, launcher integration) behind launch-oriented services rather than catalog read services.
- Remove lossy adapters that convert snapshots into legacy `ResolvedGameRecord[]` for UI consumption.
- Keep memory/live fixtures only insofar as they provide facts-shaped test data or launch resolution; do not preserve list-oriented API compatibility.

**Patterns to follow:**
- Existing `LibrarySource` Effect service/layer pattern.
- `product/apps/portal/features/home/library-source-layer-rpc.ts` for RPC-backed layer composition.
- `product/platform/library/launcher-layer-live.ts` and launch RPC handlers for separated launch responsibility.

**Test scenarios:**
- Happy path: catalog RPC layer returns entries, peers, and health without discarding peer facts.
- Error path: RPC failure returns a catalog facts error without manufacturing an empty catalog.
- Regression: launch controller still resolves and runs a selected entry using its structural source identity after read/launch service split.
- Contract: no platform read service exposes `list()` or `listPlayableEntries()` as the primary UI catalog path.

**Verification:**
- Read-side platform code is facts-first and presentation-neutral.
- Launch behavior remains available through launch-oriented APIs and still receives source identity.

### U5. Replace shared React library interpretation with facts transport

**Goal:** Remove shared universal library UI state and expose only catalog facts transport/cache/refresh to React consumers.

**Requirements:** R5, R6, R8

**Dependencies:** U4

**Files:**
- Modify: `product/platform/react/library/library-atoms.ts`
- Create/Modify: `product/platform/react/catalog/catalog-atoms.ts`
- Delete: `product/platform/library/library-list-state.ts`
- Delete: `product/platform/react/library/library-list-state-root.tsx`
- Test: `product/platform/react/catalog/catalog-atoms.test.ts`
- Remove/Test: `product/platform/react/library/library-atoms.test.ts`

**Approach:**
- Replace `libraryItemsAtom` with a facts-first atom such as `catalogSnapshotAtom` in a catalog namespace.
- Keep React atom behavior limited to runtime/layer wiring, refresh, and AsyncResult transport state; do not classify empty/loading/degraded/ready in platform code.
- Delete the shared `LibraryListState` ADT and root/context helpers so old interpretation cannot persist accidentally.
- Update config-change refresh bridges to refresh the facts atom instead of item-only atoms.

**Patterns to follow:**
- `foregroundSessionGateStateAtom` for transport atom with refresh, while avoiding presentation-specific classification in shared code.
- `HomeRuntimeLayersRoot.tsx` for atom initial values and config-change refresh bridge.

**Test scenarios:**
- Happy path: facts atom is exported and refreshable, returning the full catalog facts response.
- Happy path: old `libraryItemsAtom` export is gone or replaced by a facts-first export in this unit's module boundary.
- Integration: config-change events refresh the facts atom, not an item-only atom.

**Verification:**
- Shared React code no longer defines universal catalog presentation cases.
- Themes receive raw typed facts plus transport result only.

### U6. Make Shift own catalog interpretation

**Goal:** Give Shift a theme-owned catalog state model that interprets catalog facts into Shift's experience without backend or platform presentation decisions.

**Requirements:** R5, R6, R8, R9

**Dependencies:** U5

**Files:**
- Create: `product/themes/shift/catalog/shift-catalog-state.ts`
- Create: `product/themes/shift/catalog/ShiftCatalogStateRoot.tsx`
- Modify: `product/themes/shift/pages/ShiftHomePage.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeReadyBody.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeLoadingBody.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeLoadErrorBody.tsx`
- Modify: `product/themes/shift/entry.tsx`
- Test: `product/themes/shift/catalog/shift-catalog-state.test.ts`
- Test: `product/themes/shift/pages/ShiftHomePage.test.tsx`
- Test: `product/themes/shift/pages/ShiftHomeReadyBody.test.tsx`
- Test: `product/themes/shift/templates/ShiftHomeRoot.test.tsx`

**Approach:**
- Add a Shift-local ADT that maps AsyncResult + catalog facts into Shift's own cases.
- Treat self `loading` with no first result as Shift's full-screen loading case.
- Treat self `ready` with entries as ready, even when peers are loading/failed.
- Treat self `ready` with zero entries as Shift's empty-library experience.
- Treat self `failed` or coordinator transport failure as Shift-local error/defect according to Shift's UX rules.
- Surface peer loading/failure as facts available to ready-state components, but let Shift decide whether they are subtle, prominent, or hidden.

**Patterns to follow:**
- Previous `LibraryListStateRoot` state-component pattern, but implemented inside `product/themes/shift/` rather than platform.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` for converting async results into a domain/theme ADT once.

**Test scenarios:**
- Happy path: self ready with entries and failed peers renders ready body, not loading.
- Happy path: self ready with entries and loading peers renders ready body with Shift-owned peer diagnostic facts available.
- Edge case: self ready with zero entries renders Shift empty body.
- Error path: self failed renders Shift local/catalog error, not peer-failed ready state.
- Error path: transport/RPC failure renders retryable load error.
- Regression: Shift components no longer import shared `LibraryListStateRoot` or `useLibraryListCase`.

**Verification:**
- Shift owns all catalog presentation states.
- Bandai's self-ready catalog cannot be hidden by aka/zao failures.

### U7. Migrate dual-screen and non-theme UI consumers

**Goal:** Remove remaining UI dependencies on item-only atoms and universal library list state outside the primary Shift route.

**Requirements:** R5, R6, R8

**Dependencies:** U5, U6

**Files:**
- Modify: `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx`
- Modify: `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx`
- Test: `product/apps/portal/features/dual-screen/DualScreenRouteRoot.test.tsx`
- Test: `product/apps/portal/features/home/HomeRuntimeLayersRoot.test.tsx`

**Approach:**
- Treat dual-screen ownership explicitly: if the route is intended to be a Shift composition surface, wrap it in the Shift-owned catalog state root; otherwise create a small dual-screen adapter over catalog facts instead of importing a generic platform interpretation.
- Update runtime-layer refresh bridges to target the new facts atom.
- Remove old item-only imports and wrappers completely.

**Patterns to follow:**
- Existing `DualScreenRouteRoot.tsx` composition pattern.
- `HomeRuntimeLayersRoot.tsx` config-change refresh bridge.

**Test scenarios:**
- Happy path: dual-screen route renders ready state from catalog facts with self ready entries.
- Error path: dual-screen route handles self failed/transport failed through its explicit chosen owner: Shift composition state or a dual-screen adapter.
- Regression: home runtime config change refreshes catalog facts and causes updated titles/entries to render.

**Verification:**
- All current UI consumers use catalog facts and theme-owned interpretation.
- No old item-only atom/state-root imports remain.

### U8. Migrate control, bridge, CLI, and Pi tooling callers

**Goal:** Complete the full public-contract break by moving all in-repo non-theme callers from old list/source RPCs to catalog facts.

**Requirements:** R3, R8, R10

**Dependencies:** U1, U4

**Files:**
- Modify: `product/apps/portal/platform-bridge.ts`
- Modify: `product/apps/portal/control/korri-control-rpc.ts`
- Modify: `product/apps/portal/stream/remote-stream-client.ts`
- Modify: `product/apps/cli/source-aware-play.ts`
- Modify: `product/apps/cli/source-aware-games.ts`
- Modify: `product/apps/cli/remote-stream-control-client.ts`
- Modify: `product/platform/control/korri-control-live.ts`
- Modify: `packages/pi-korrid-tools/src/korrid-tools.ts`
- Test: `product/apps/portal/platform-bridge.test.ts`
- Test: `product/apps/portal/control/korri-control-rpc.test.ts`
- Test: `product/apps/portal/stream/remote-stream-client.test.ts`
- Test: `product/apps/cli/source-aware-games.test.ts`
- Test: `product/platform/control/korri-control-live.test.ts`
- Test: `packages/pi-korrid-tools/tests/korrid-tools.test.ts`

**Approach:**
- Update raw string RPC callers and Effect RPC callers to use `app.catalog.snapshot`.
- For list/find tooling and local control services, derive compact game lists from catalog facts entries rather than old `{ games }` responses.
- Preserve platform bridge launch behavior while changing only its catalog read path.
- Ensure agent tools (`korrid_query`, `korrid_find_game`) keep working against servers that expose only the new catalog facts endpoint.

**Execution note:** Characterization-first for `platform-bridge.ts` and `pi-korrid-tools`; these are easy to miss because some calls use raw string tags and will not all fail at compile time.

**Patterns to follow:**
- Existing `platform-bridge.test.ts` for injected `appRpc` calls.
- `packages/pi-korrid-tools/tests/korrid-tools.test.ts` for compact read-only command behavior.
- `product/apps/portal/control/korri-control-rpc.ts` transport failure mapping.

**Test scenarios:**
- Happy path: platform bridge `library.list()` returns entries from catalog facts.
- Error path: platform bridge still treats no-upstream/503 as unavailable according to existing bridge policy, not as an empty catalog unless that policy is intentionally revised.
- Happy path: control RPC `listGames` and `findGame` work against `app.catalog.snapshot`.
- Happy path: pi-korrid-tools compact library output reports count, id, title, and source from catalog facts.
- Regression: grep-level test or standards assertion finds no `app.library.list`, `app.library.snapshot`, or `app.source.list` read-only command references in active callers.

**Verification:**
- In-repo tools and agents can discover games against the new API.
- Removing old RPC tags does not leave hidden runtime-only callers behind.

### U9. Remove old RPC registrations and enforce the break

**Goal:** Delete compatibility surfaces after all consumers have migrated, making the new contract the only catalog read path.

**Requirements:** R3, R8, R10

**Dependencies:** U3, U8

**Files:**
- Modify: `product/apps/portal/api/app-rpc-group.ts`
- Modify: `product/apps/portal/api/server/rpc-group.ts`
- Modify: `product/apps/portal/api/handlers.ts`
- Modify: `product/apps/portal/api/server/rpc-server.ts`
- Delete/Modify: `product/apps/portal/api/library/list.rpc.ts`
- Delete/Modify: `product/apps/portal/api/library/list.rpc-handler.ts`
- Delete/Modify: `product/apps/portal/api/library/snapshot.rpc.ts`
- Delete/Modify: `product/apps/portal/api/library/snapshot.rpc-handler.ts`
- Delete/Modify: `product/apps/portal/api/source/list.rpc.ts`
- Delete/Modify: `product/apps/portal/api/source/list.rpc-handler.ts`
- Test: `product/apps/portal/api/server/rpc-server.test.ts`
- Test: `product/apps/portal/api/hono-app.test.ts`
- Test/Create: `tools/testing/standards/catalog-api-boundaries.test.ts`

**Approach:**
- Remove old tags (`app.library.list`, `app.library.snapshot`, `app.source.list`) from both app and server RPC groups.
- Remove old handlers once no in-repo caller needs them.
- Add a standards/regression test that prevents reintroducing old list/source catalog read tags or shared UI interpretation imports.
- Keep launch RPCs unchanged unless a direct type dependency requires import cleanup.

**Patterns to follow:**
- `product/apps/portal/api/server/rpc-server.test.ts` for public RPC surface assertions.
- `tools/testing/standards/import-boundaries.test.ts` for repo-wide import/reference boundary checks.

**Test scenarios:**
- Contract: app/server RPC groups contain `app.catalog.snapshot` and do not contain `app.library.list`, `app.library.snapshot`, or `app.source.list`.
- Error path: POSTing an unknown old tag yields the normal RPC unknown-tag failure instead of a stale compatibility response.
- Regression: standards test fails if old catalog read tags, `libraryItemsAtom`, `LibraryListState`, or `LibraryListStateRoot` are reintroduced in active product code.
- Security: existing envelope guard still normalizes malformed headers for the new catalog RPC route.

**Verification:**
- The full break is real and enforced by tests.
- Old catalog read contracts are gone from product/runtime/tooling code.

---

## System-Wide Impact

- **Interaction graph:** The primary graph changes from `Theme → libraryItemsAtom → LibrarySource.listPlayableEntries → app.library.snapshot` to `Theme → catalog facts atom → CatalogFactsSource → app.catalog.snapshot`. Peer federation changes from `PeerSourceFetcher → app.source.list` to `PeerSourceFetcher → app.catalog.snapshot(scope: self)`.
- **Error propagation:** Coordinator transport failures, self catalog failures, peer failures, and empty catalogs must remain distinct facts. Shared platform code transports errors; themes decide presentation.
- **State lifecycle risks:** Peer refresh must be scoped/cancelable; full-fabric reads must not recursively fan out through peers; generation resets across daemon restarts must not strand renderers on stale/loading states.
- **API surface parity:** App RPC group, server RPC group, platform bridge, control RPC, CLI clients, remote-stream client, and pi-korrid-tools all need the new catalog facts contract in the same migration.
- **Integration coverage:** Unit tests must be paired with integration tests through real RPC groups and raw-string bridge/tooling paths because not all callers are type-coupled to RPC definitions.
- **Unchanged invariants:** Desktop remains a loopback/same-origin pipe. Themes remain autonomous. Launch routing still receives enough structural source identity to launch local and remote entries. Game runtime/emulator/Steam behavior is out of scope.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Recursive peer federation if full snapshots call each other | Use one canonical tag with explicit self-only scope for peer fetch; test two coordinators discovering each other. |
| Hidden raw-string callers of old RPC tags | Include `platform-bridge.ts`, control RPC, remote-stream client, CLI, and pi-korrid-tools in migration; add standards grep/regression coverage. |
| Backend accidentally grows theme/home-screen semantics | Keep schema limited to facts and put Shift interpretation under `product/themes/shift/`. |
| Removing `LibraryListStateRoot` causes large UI churn | Migrate all current consumers in one slice and add theme-owned state fixtures/tests. |
| Local source hang still appears as infinite loading | Add bounded self status and tests for self loading, self failed, self ready empty, and self ready with peer failures. |
| Launch routing loses remote/local source metadata | Preserve `EntrySource` as structural catalog fact while moving launch resolution into a separate service. |
| Agent/device tooling breaks after RPC removal | Update `packages/pi-korrid-tools` and control RPC tests in the same plan; do not leave old tags as hidden dependencies. |
| LAN-facing catalog errors leak internal paths | Sanitize/clamp error facts at the catalog status/RPC seam. |

---

## Documentation / Operational Notes

- Update or add a solution note only after implementation validates the boundary, likely under `docs/solutions/architecture-patterns/` for theme-owned catalog facts and coordinator-relative source identity.
- Device rollout should restart `korrid` and `korri-sessiond` after deploy so old desktop/webview processes do not keep old RPC/client code alive.
- After rollout, validate Bandai's catalog facts through the desktop forwarder and direct `korrid`, then validate aka/zao peers once they run the latest contract.
- Tooling docs or help text for `pi-korrid-tools` should refer to catalog facts rather than `app.library.list`.

---

## Sources & References

- Related plan: `work/items/active/01KV0RYJWKZHVBZ8ZVBHXHP63A-unified-catalog-fabric/plan.md`
- Related backlog: `work/items/parking-lot/01KV0TZAVD2KVDXZKV7J4BMX9C-move-catalog-peer-refresh-to-a-scoped-discovery-driven-servi.md`
- Related code: `product/apps/portal/api/library/snapshot.rpc.ts`
- Related code: `product/apps/portal/api/library/catalog-snapshot.ts`
- Related code: `product/apps/portal/peers/peer-source-fetcher.ts`
- Related code: `product/platform/react/library/library-atoms.ts`
- Related code: `product/platform/react/library/library-list-state-root.tsx`
- Related code: `product/platform/library/library-list-state.ts`
- Related code: `product/themes/shift/pages/ShiftHomePage.tsx`
- Related code: `product/apps/portal/features/dual-screen/DualScreenRouteRoot.tsx`
- Related code: `product/apps/portal/platform-bridge.ts`
- Related code: `product/apps/portal/control/korri-control-rpc.ts`
- Related code: `packages/pi-korrid-tools/src/korrid-tools.ts`
- Institutional learning: `docs/solutions/architecture-patterns/korri-product-platform-theme-architecture-2026-06-03.md`
- Institutional learning: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
- Institutional learning: `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`
- Institutional learning: `docs/solutions/best-practices/electrobun-portal-via-localhost-bun-and-cage-input-passthrough-2026-05-27.md`
- Institutional learning: `docs/solutions/runtime-errors/effect-rpc-server-headers-concat-undefined-crash-2026-05-27.md`
