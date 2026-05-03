---
title: "feat: Big bang migration to Effect v4 with atoms + layer-swap architecture"
type: feat
status: active
date: 2026-05-03
origin: docs/plans/2026-05-03-002-feat-effect-atoms-spike-plan.md
---

# feat: Big bang migration to Effect v4 with atoms + layer-swap architecture

## Overview

Migrate Korri from Effect v3 (`effect@3.20.0`, `@effect/rpc@0.74.0`, `@effect/platform@0.95.0`, `@effect-atom/atom-react@0.5.0`) to Effect v4 beta (`effect@4.0.0-beta.60`, `@effect/atom-react@4.0.0-beta.60`) in a single PR, while simultaneously adopting the architectural patterns validated by the prior spike: atoms over `Atom.runtime((get) => get(layerAtom))`, `LibrarySource` and `Launcher` as `Context.Service`s, the `LibraryListState` / `LaunchState` ADT pattern, state-root + self-selecting children in React, and layer-swappable Storybook stories with zero mocks.

The migration is **phased green-bar**: tests pass at each phase boundary (not between every unit). Phase 1 lands the v4 dependency change and rebuilds the test infrastructure on v4 RPC. Phase 2 lands the architectural adoption on top of the v4 foundation.

## Problem Frame

The personal-MVP work (`docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`) shipped a working ROCKNIX launcher loop, but exposed two layering problems:

1. **`korri/shared/themes/shift/pages/ShiftHomePage.tsx` imports `useRpcQuery` and `@app/features/resume/launch-controller`** — shared theme code reaches into product-specific transport. Storybook stories for the home page break at runtime because `useRpcQuery` fires a real `POST /api/rpc` against an absent server.
2. **`useGameLaunch` is a hand-rolled state machine over `runRpc`**, and `useRpcQuery` + `rpcQueryStore` are ~340 lines of homegrown query infrastructure. The development standards (`docs/development/standards.md`) explicitly call this out: *"Avoid hand-rolling query stores, transport hooks, or request caches once Effect is on the critical path."*

The v4 spike (`tools/spike-effect-atoms/`) validated the pattern that solves both: atoms over a swappable layer atom, `Context.Service`s for source + launcher, ADT-based state in React, layer-swap stories. The standards doc is now built around this pattern. This plan executes the migration that brings production code in line.

## Requirements Trace

- **R1.** Production runtime uses `effect@4.0.0-beta.60` and `@effect/atom-react@4.0.0-beta.60` (pin exact, per Q3).
- **R2.** All 33 files currently importing from `effect`/`@effect/*` continue to compile and pass tests after migration.
- **R3.** `useRpcQuery`, `runRpc`, `rpcQueryStore`, `rx/client.ts`, `rx/microtask-batch-queue.ts` are deleted; replaced by atoms.
- **R4.** `LibraryContext` singleton is deleted; `LibrarySource` and `Launcher` become `Context.Service`s composed via `Layer`.
- **R5.** `useGameLaunch` state machine is replaced by `LaunchState` ADT + atom-driven launch (per `docs/development/style-guide.md` Functional state component pattern).
- **R6.** `ShiftHomePage` no longer imports `useRpcQuery` or anything under `@app/*`. It composes a state-root + self-selecting children. Production wiring lives in `korri/products/app/features/home/`.
- **R7.** `ShiftHomePage.stories.tsx` renders five distinct visual states (`Default`, `Loading`, `LoadError`, `Empty`, `FailedLaunch`) using layer-swap decorators against in-memory implementations, with zero network calls and no mocking.
- **R8.** `tools/spike-effect-atoms/` is deleted after its validated pieces are promoted into shared/product locations.
- **R9.** `bun test` passes at the end of Phase 1 and at the end of Phase 2.
- **R10.** `just typecheck`, `just lint`, `just format` pass at the end of Phase 2.
- **R11.** `just dev-storybook` renders all `Themes/Shift/Pages/Home/*` stories without an API server running.
- **R12.** The dev stack (`just dev`) starts cleanly and `app.library.list` / `app.library.launch` continue to work end-to-end against a real ROCKNIX library.

## Scope Boundaries

- **Not migrating routing.** TanStack Router stays as-is — it is not Effect-coupled and the migration does not need to touch it.
- **Not migrating logging.** `@shared/logger` (Pino) stays. Effect's structured logger is a follow-up.
- **Not adopting `@effect/vitest`.** Test runner stays `bun test`.
- **Not migrating Schema patterns beyond mechanical renames.** Existing `Schema.Struct` / `Schema.Class` shapes stay; only the v3→v4 API renames apply.
- **Not adding new feature behavior.** Every story, hook, and RPC handler preserves its current observable behavior.
- **Not on-device smoke-test orchestration.** Unit 13 of the personal-MVP plan (manual smoke against the Odin) is user-driven and re-run after this migration lands; it is verification, not implementation.

### Deferred to Separate Tasks

- **BDD fixture infrastructure** for Storybook E2E layer-swap (already deferred per `docs/solutions/integration-issues/2026-05-02-bdd-fixture-deferred.md`).
- **Effect-native logger adoption** — separate refactor.
- **Effect Schema's `decodeTo` and structural transformations** for richer error / response shaping — current shapes are preserved as-is.

## Context & Research

### Relevant Code and Patterns

- **Spike (validated, ready to promote):** `tools/spike-effect-atoms/library-service.ts`, `library-layer-memory.ts`, `library-atoms.ts`, `library-list-state.ts`, plus tests. The spike's `Library` service is split into `LibrarySource` + `Launcher` for production (per the layering rationale captured in `korri/shared/library/library-source.ts` doc-comment).
- **Spike best-practice doc:** `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — locked in by `docs/development/style-guide.md` Functional state component pattern.
- **Current backend RPC stack:** `korri/shared/api/rpc/{app-rpc-group,handlers,server,serialization,errors,response,runRpc,useRpcQuery,rpcQueryStore}.ts`, `korri/shared/api/rpc/rx/{client,microtask-batch-queue}.ts`. Migrates to v4 import paths (`effect/unstable/rpc`, `effect/unstable/http`).
- **Current library stack:** `korri/shared/library/{library-context,library-source,launcher,shell-launcher}.ts`, `korri/shared/library/rocknix/{rocknix-source,gamelist,es-systems}.ts`. The `LibraryContext` singleton is deleted; the rest stay as the production layer implementations behind the new `Context.Service`s.
- **Current consumers:** `korri/shared/themes/shift/pages/ShiftHomePage.tsx` (refactored), `korri/products/app/features/resume/launch-controller.ts` (replaced), `korri/products/app/routes/+index.tsx` (composes Server Roots).
- **Existing v3 schema-typed errors:** `korri/shared/api/rpc/errors.ts` — uses `Schema.TaggedError` (renamed to `Schema.TaggedErrorClass` in v4).
- **Test harnesses:** `tools/testing/library/{with-rpc-server,with-temp-library}.ts`, `tools/testing/fake-game.sh`. The temp-library and fake-game pieces stay; `with-rpc-server` updates for v4 RPC.

### Institutional Learnings

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — testing posture that the layer-swap pattern preserves and strengthens.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — UI state pattern that the migration formalizes in production.
- `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md` — relevant to test infra migration (`with-rpc-server` + `window.location.pathname` happy-dom interaction). Verify the v4 RPC client surfaces the same constraint or removes it.

### External References

- **Effect v4 migration guide:** `https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md`
- **Schema v4 migration guide:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/schema.md` (TaggedError → TaggedErrorClass, Literal variadic → Literals array, Union variadic → array, Record signature change, decode → decodeEffect, etc.)
- **Services migration:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md` (Tag → Service, Effect.Service → Context.Service with `make`, layer naming convention).
- **Runtime migration:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/runtime.md` (`Runtime<R>` removed; use `Context<R>`; `Runtime.runFork` → `Effect.runForkWith`).
- **v4 atom-react package:** `https://github.com/Effect-TS/effect-smol/tree/main/packages/atom/react/src` — same hooks (`useAtomValue`, `useAtomSet`, `useAtomRefresh`, `useAtomMount`, `useAtom`, `useAtomSubscribe`); `Result` from v3 atom-react is renamed to `AsyncResult` in `effect/unstable/reactivity/AsyncResult`.
- **v4 unstable modules confirmed:** `effect/unstable/{rpc,http,schema,reactivity}` — RPC and HTTP server/client paths shift accordingly.

### Slack Context

Not requested.

## Key Technical Decisions

- **Big bang in one PR, phased green-bar internally.** All 33 files migrate together. Tests are red mid-Phase-1; green at the Phase 1 boundary; red mid-Phase-2; green at the Phase 2 boundary. Single PR allows atomic revert via `git revert`.
- **Pin exact beta versions** (Q3 answer): `"effect": "4.0.0-beta.60"`, `"@effect/atom-react": "4.0.0-beta.60"`. No carets, no tildes. Beta upgrades are intentional, reviewed changes — never surprised by `bun install`.
- **Two services, not one** (Q4 follow-up): `LibrarySource` (filesystem read) and `Launcher` (subprocess spawn) become two separate `Context.Service`s, not one combined `Library`. The spike's combined service was scope-appropriate for the spike. In production, source and launcher are independently swappable infrastructure (e.g., a future Steam library source paired with the same shell launcher).
- **Spike disposition: promote pieces, delete the rest** (Q4 answer). `library-service.ts` (split) → `library-services.ts` in shared. `library-layer-memory.ts` (split) → two layer files in shared. `library-atoms.ts` → `library-atoms.ts` in shared. `library-list-state.ts` → `library-list-state.ts` + `launch-state.ts` in shared. `LibraryList.tsx` and `LibraryList.stories.tsx` are deleted (their job is taken over by the refactored `ShiftHomePage`).
- **`@effect-atom/atom-react@0.5.0` → `@effect/atom-react@4.0.0-beta.60`.** Org change AND major version. Hooks API is functionally the same. `Result` is renamed `AsyncResult` and lives at `effect/unstable/reactivity/AsyncResult`. The standards doc `docs/development/standards.md` references `@effect-atom/atom-react` and must be updated as part of this migration (Unit 13).
- **`LibraryContext` singleton is deleted.** The server constructs an `AppRpcLayer` that composes `LibrarySourceLayerLive` (real ROCKNIX over filesystem) and `LauncherLayerLive` (real ShellLauncher), and provides them to RPC handlers via `Layer.provide`. Tests construct an alternative layer using `LibrarySourceLayerInMemory` / `LauncherLayerInMemory`.
- **Frontend transport disappears.** `runRpc.ts`, `useRpcQuery.ts`, `rpcQueryStore.ts`, `rx/client.ts`, `rx/microtask-batch-queue.ts` are deleted. The frontend uses atoms over `Atom.runtime((get) => get(layerAtom))`. Production wires the layer atom to a `LibrarySourceLayerRpc` / `LauncherLayerRpc` that internally uses the v4 RPC client; stories override the layer atom.
- **No `Stub*` / `Mock*` / `Fake*`.** All in-memory implementations are real `LibrarySource` / `Launcher` implementations with `behavior` / `config` knobs. Same shape as `fake-game.sh --exit-code N`.
- **Phase boundary verification gates.** End of Phase 1: `bun test` green, `just typecheck` green. End of Phase 2: `bun test` green, `just typecheck` green, `just lint` green, `just format` clean, `just dev` boots cleanly, `just dev-storybook` renders all five home stories without an API server.

## Open Questions

### Resolved During Planning

- **Migration scope (Q1):** Architectural adoption — version bump + spike patterns. (Confirmed.)
- **Phasing (Q2):** Phased green-bar — test infra migrates first, production code on top. (Confirmed.)
- **Beta pinning (Q3):** Pin exact `4.0.0-beta.60`. (Confirmed.)
- **Spike disposition (Q4):** Promote pieces, delete the rest. (Confirmed.)
- **Two services or one:** Two — `LibrarySource` + `Launcher` separated. (Documented above.)
- **Atom package name in standards:** Update `@effect-atom/atom-react` → `@effect/atom-react` and `Result` → `AsyncResult` in `docs/development/standards.md` (Unit 13).

### Deferred to Implementation

- **Exact v4 RPC server API for `RpcServer.toWebHandler`.** v4 may have renamed or restructured the web-handler builder. Inspect `effect/unstable/rpc/RpcServer.ts` at implementation time and adapt; the contract (Hono-compatible handler accepting a `Layer`) is preserved.
- **Whether `effect/unstable/rpc/RpcSerialization` exposes the same `unsafeMake` shape** for the custom batch-JSON serializer in `korri/shared/api/rpc/serialization.ts`. Adapt at implementation time.
- **Whether the v4 atom-react `useAtomSet` callback's `mode: "promiseExit"` is still spelled exactly that way.** Verify against `packages/atom/react/src/Hooks.ts` (Hooks export already inspected: `useAtomSet` and `useAtom` accept a `Mode` generic that includes `"promiseExit"` — looks unchanged).
- **The exact v4 form for `RpcMiddleware.Tag` / `RpcMiddleware.makeMiddleware`** used by `FeatureGatesMiddleware`. The middleware contract is preserved (a Tag plus a Layer providing it); resolve naming at implementation.
- **`window.location.pathname` happy-dom interaction with v4 HTTP client.** May or may not still apply; verify by running the existing `useGameLaunch` tests after Unit 5.
- **Synchronous-throw behavior of `Bun.spawn` ENOENT** in the v4 process layer (if any). The current `ShellLauncher` catches ENOENT and translates to `exitCode 127`; preserve that.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Composition shape after migration

```
korri/products/app/routes/+index.tsx          # composition root for the home route
├── HomeServerRoot                             # in korri/products/app/features/home/
│   ├── sets libraryLayerAtom = LibrarySourceLayerRpc
│   ├── sets launcherLayerAtom = LauncherLayerRpc
│   └── renders <ShiftHomePage />              # in korri/shared/themes/shift/pages/
│
korri/shared/themes/shift/pages/ShiftHomePage.tsx
└── reads libraryItemsAtom + launchAtom
    ├── <LibraryListStateRoot result={items}>
    │   ├── <ShiftHomeLoadingBody />            # self-selects "Loading"
    │   ├── <ShiftHomeLoadErrorBody />          # self-selects "LoadError"
    │   ├── <ShiftHomeDefectBody />             # self-selects "Defect"
    │   ├── <ShiftHomeEmptyBody />              # self-selects "Ready" w/ games.length === 0
    │   └── <ShiftHomeReadyBody>                # self-selects "Ready" w/ games.length > 0
    │       └── <ShiftHomeLaunchStateRoot state={launch.state}>
    │           ├── <ShiftLaunchFailureBanner />
    │           ├── <ShiftHomeRail />
    │           └── <ShiftHomeBottomBar />
    └── (no <ShiftHomePage> symbol stays — see Unit 11)
```

### Phase 1 → Phase 2 boundary

```
PHASE 1 GREEN BAR        PHASE 2 GREEN BAR
─────────────────        ─────────────────
v4 packages installed    + atoms in production
v4 schema renames        + LibrarySource/Launcher services
v4 import paths          + LibraryContext singleton deleted
v4 RPC test harness      + useRpcQuery/runRpc deleted
existing arch preserved  + ShiftHomePage refactored
                         + 5 home stories layer-swapped
                         + tools/spike-effect-atoms deleted
```

### File-count blast radius

| Surface | Files |
|---|---|
| Schema renames (errors, RPCs, launcher schema) | 6 |
| Service / Layer / Context renames | 9 (gates middleware, library-context, server, handlers, etc.) |
| Import path migration `@effect/*` → `effect/unstable/*` | 12 |
| Test harnesses + tests | 8 |
| Atom files (new) | 3 |
| ADT files (promoted) | 2 |
| Layer files (promoted) | 4 |
| Frontend transport (deleted) | 5 |
| Spike folder (deleted) | 7 |

## Output Structure

The migration creates new files in shared/library and a few new layer files in product locations. Existing file paths that survive are not redrawn here.

```
korri/shared/library/
├── library-services.ts                    # NEW: LibrarySource + Launcher Context.Service definitions
├── library-source-layer-memory.ts         # NEW: in-memory LibrarySource layer (configurable)
├── launcher-layer-memory.ts               # NEW: in-memory Launcher layer (configurable)
├── library-source-layer-memory.test.ts    # NEW: unit tests for in-memory layer behavior
├── launcher-layer-memory.test.ts          # NEW: unit tests for in-memory launcher
├── library-atoms.ts                       # NEW: layer atoms + items atom + launch atom
├── library-list-state.ts                  # NEW: LibraryListState ADT (promoted from spike)
├── library-list-state.test.ts             # NEW: unit tests for ADT (promoted from spike)
├── launch-state.ts                        # NEW: LaunchState ADT (promoted from spike)
├── launch-state.test.ts                   # NEW: unit tests for LaunchState
├── library-source.ts                      # MODIFIED: stays but interface becomes Context.Service contract input
├── launcher.ts                            # MODIFIED: same — interface stays, Context.Service wraps it
├── library-context.ts                     # DELETED
└── (rocknix/, shell-launcher.ts unchanged)

korri/products/app/features/home/
├── HomeServerRoot.tsx                     # NEW: composition root that sets layer atoms = RPC layers
└── (existing brief.md, e2e/ unchanged)

korri/products/app/features/resume/
├── launch-controller.ts                   # DELETED (replaced by atom-driven launch)
├── launch-controller.test.tsx             # DELETED
└── (brief.md, e2e/ unchanged)

korri/products/app/api/library/
├── library-source-layer-rpc.ts            # NEW: LibrarySource layer that wraps the v4 RPC client
├── launcher-layer-rpc.ts                  # NEW: Launcher layer that wraps the v4 RPC client
└── (list.rpc.ts, launch.rpc.ts updated for v4 schema; *.rpc-handler.ts updated for service injection)

korri/shared/api/rpc/
├── runRpc.ts                              # DELETED
├── useRpcQuery.ts                         # DELETED
├── rpcQueryStore.ts                       # DELETED
├── rx/                                    # DELETED (entire folder)
└── (app-rpc-group.ts, handlers.ts, server.ts, errors.ts, serialization.ts: kept and migrated)

korri/shared/themes/shift/pages/
├── ShiftHomePage.tsx                      # REFACTORED: state-root + self-selecting children, no @app imports
├── ShiftHomePage.stories.tsx              # REFACTORED: 5 stories with layer-swap decorator
├── ShiftHomeLoadingBody.tsx               # NEW
├── ShiftHomeLoadErrorBody.tsx             # NEW
├── ShiftHomeDefectBody.tsx                # NEW
├── ShiftHomeEmptyBody.tsx                 # NEW
└── ShiftHomeReadyBody.tsx                 # NEW (current rail+banner composition lives here)

tools/spike-effect-atoms/                  # ENTIRE FOLDER DELETED

korri/deploy/storybook/main.ts             # MODIFIED: remove tools/spike-effect-atoms glob

docs/development/standards.md              # MODIFIED: package name + AsyncResult update
```

## Implementation Units

### Phase 1 — v4 foundation (test infra + backend on v4)

- [ ] **Unit 1: Bump dependencies and remove v3 packages**

**Goal:** Replace v3 Effect packages with v4 beta pinned-exact, verify install.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (regenerated by `bun install`)

**Approach:**
- Remove `@effect/platform`, `@effect/rpc`, `@effect-atom/atom-react` from `package.json`.
- Add `effect: "4.0.0-beta.60"` (no caret, no tilde — exact pin).
- Add `@effect/atom-react: "4.0.0-beta.60"` (exact pin).
- Run `bun install` to regenerate `bun.lock`.
- The build will be broken at this point; this is expected and resolved by Units 2–5.
- Do **not** keep both v3 and v4 packages installed simultaneously — there is no incremental cohabitation path through this migration.

**Patterns to follow:**
- `package.json` dependency style elsewhere in the repo (alphabetical, no version operators that allow drift).

**Test scenarios:**
- Test expectation: none — pure dependency change. Verification is `bun install` succeeds and `package.json` diff is exactly the four version replacements.

**Verification:**
- `bun install` completes without `peer dep` errors. `bun.lock` shows `effect@4.0.0-beta.60`, `@effect/atom-react@4.0.0-beta.60`, no `@effect/platform`, no `@effect/rpc`, no `@effect-atom/atom-react`.

---

- [ ] **Unit 2: Schema v4 mechanical rename pass**

**Goal:** Update every file using `Schema.*` v3 APIs to v4 names per the official migration table.

**Requirements:** R2

**Dependencies:** Unit 1

**Files:**
- Modify: `korri/shared/api/rpc/errors.ts` (TaggedError → TaggedErrorClass; Schema.Union variadic → array)
- Modify: `korri/products/app/api/library/list.rpc.ts` (Schema.Class shape preserved; verify field signatures)
- Modify: `korri/products/app/api/library/launch.rpc.ts` (Schema.Literal variadic → Literals array; Schema.Union variadic → array)
- Modify: `korri/products/app/api/hello/rpc.ts`
- Modify: `korri/shared/library/launcher.ts` (Schema.Record shape: `{ key, value }` → `(key, value)`)
- Modify: `korri/shared/fixtures/games/game.ts` (verify shape; rename if it uses any flagged v3 API)
- Modify: any other file using Schema (run `rg "Schema\\." korri/ tools/` to find them all)
- Modify: `korri/shared/api/rpc/errors.test.ts` (update assertions if shape changed)

**Approach:**
- Apply the rename table from `https://github.com/Effect-TS/effect-smol/blob/main/migration/schema.md`. Mechanical replacements:
  - `Schema.TaggedError<X>()("Name", { ... })` → `Schema.TaggedErrorClass<X>()("Name", { ... })` (semantic equivalent — verify error shape on the wire is identical).
  - `Schema.Literal("a", "b", "c")` → `Schema.Literals(["a", "b", "c"])`.
  - `Schema.Union(A, B, C)` → `Schema.Union([A, B, C])`.
  - `Schema.Record({ key, value })` → `Schema.Record(key, value)`.
  - `Schema.decodeUnknownSync` → preserved (sync decoders unchanged in name); confirm signature.
  - `Schema.optional(...)` — verify still accepts `Schema` directly; the migration guide flags `optionalWith` as varying.
- Do **not** restructure to use new v4 features (`decodeTo`, `mapFields`, etc.) in this unit. Only mechanical renames that preserve behavior.

**Patterns to follow:**
- `tools/spike-effect-atoms/library-service.ts` already shows v4-compatible `Schema.TaggedError` syntax (the spike was on v3 atoms but adjacent Schema usage was already forward-compatible). Use it as a sanity reference but apply v4 rename names.

**Test scenarios:**
- Integration: existing `errors.test.ts` assertions on `_tag`, `reason`, `message` discrimination still pass after rename.
- Integration: each rpc payload decode round-trips identically (the wire format is unchanged — only the constructor name changed).
- Edge case: `LaunchSpec` schema's `Schema.filter` on non-empty command still rejects empty strings.
- Error path: `LaunchLibraryResponse` Union still discriminates `launched` from `failed` correctly post-rename.

**Verification:**
- `bun test korri/shared/api/rpc/errors.test.ts` passes.
- `bun test korri/shared/library/launcher.test.ts` passes (Schema-related portion only — the launcher tests themselves run later).
- `rg "Schema\\.TaggedError\\b" korri/ tools/` returns no v3-style usages (all migrated).

---

- [ ] **Unit 3: Service / Tag / Layer rename pass**

**Goal:** Migrate all `Context.Tag`, `Effect.Service`, and Layer-naming conventions to v4.

**Requirements:** R2

**Dependencies:** Unit 2

**Files:**
- Modify: `korri/shared/gates/middleware.ts` (`Context.Tag` → `Context.Service`; `RpcMiddleware.Tag` — verify v4 equivalent)
- Modify: `korri/shared/library/library-context.ts` (no Tag here yet — this file is deleted in Unit 7; just stabilize imports for now)
- Modify: `korri/shared/api/rpc/server.ts` (Layer.mergeAll usage; layer naming)
- Modify: `korri/shared/api/rpc/handlers.ts`
- Modify: `korri/shared/api/rpc/runRpc.ts` (transitional — file still exists in Phase 1, deleted Unit 9)
- Modify: any other file using `Context.Tag(...)` / `Context.GenericTag` / `Effect.Service<T>()` (run `rg "Context\\.Tag\\b|Context\\.GenericTag\\b|Effect\\.Service\\b" korri/ tools/`)

**Approach:**
- Per `https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md`:
  - `class X extends Context.Tag("X")<X, Shape>() {}` → `class X extends Context.Service<X, Shape>()("X") {}` (note argument order flip).
  - `class X extends Effect.Service<X>()("X", { effect: ... })` → `class X extends Context.Service<X>()("X", { make: ... }) {}` plus an explicit `static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Deps.layer))`.
  - Layer naming: rename `XYZLive` → `XYZLayer` only when the file is being meaningfully restructured. **In Unit 3 we preserve names** to keep the diff small; Phase 2 renames things that are actually rewritten.
- `RpcMiddleware.Tag` usage in `gates/middleware.ts`: verify against v4 `effect/unstable/rpc/RpcMiddleware`. Likely `RpcMiddleware.Tag` becomes `RpcMiddleware.Service` or similar.

**Patterns to follow:**
- `tools/spike-effect-atoms/library-service.ts` — uses v3 syntax `class Library extends Context.Tag("...")<Library, ...>() {}`. After migration, this becomes `class Library extends Context.Service<Library, ...>()("...") {}`. Use the migrated form as the template.

**Test scenarios:**
- Integration: `bun test korri/shared/gates/` passes after middleware rename.
- Integration: any test that constructs a `Layer.succeed(Tag, value)` still works.
- Edge case: `Context.Tag` callsites that previously used `yield* Tag` continue to work after the rename — `Context.Service` is the same yieldable shape.

**Verification:**
- `rg "Context\\.Tag\\b|Context\\.GenericTag\\b|Effect\\.Service\\b" korri/ tools/` returns zero hits in production code (test files allowed only if importing from a v3-shaped fixture; should be zero by end of Phase 1).
- Type-check passes for the gates/library files in isolation.

---

- [ ] **Unit 4: Import path migration `@effect/*` → `effect/unstable/*`**

**Goal:** Move all imports from `@effect/platform`, `@effect/rpc` into the v4 unstable namespace.

**Requirements:** R2

**Dependencies:** Unit 3

**Files:**
- Modify: `korri/shared/api/rpc/app-rpc-group.ts` (`@effect/rpc` → `effect/unstable/rpc`)
- Modify: `korri/shared/api/rpc/handlers.ts`
- Modify: `korri/shared/api/rpc/server.ts` (`@effect/platform` → `effect/unstable/http`; `@effect/rpc` → `effect/unstable/rpc`)
- Modify: `korri/shared/api/rpc/serialization.ts`
- Modify: `korri/shared/api/rpc/runRpc.ts` (transitional)
- Modify: `korri/shared/api/rpc/rx/client.ts` (transitional — this file is deleted in Unit 9, but Phase 1 keeps it compiling on v4)
- Modify: `korri/shared/api/http/hono-app.ts` if it imports from `@effect/platform`
- Modify: `korri/products/app/api/library/list.rpc.ts`, `launch.rpc.ts` (`Rpc` import path)
- Modify: `tools/scripts/odin-smoke-rpc.ts` (`Schema` and any RPC types)
- Modify: any test file importing from `@effect/rpc` or `@effect/platform`

**Approach:**
- Mechanical find-and-replace, then verify each importer compiles:
  - `from "@effect/rpc"` → `from "effect/unstable/rpc"` (or specific submodule like `effect/unstable/rpc/Rpc`).
  - `from "@effect/platform/HttpClient"` → `from "effect/unstable/http/HttpClient"`.
  - `from "@effect/platform/HttpBody"` → `from "effect/unstable/http/HttpBody"`.
  - `from "@effect/platform/HttpClientRequest"` → `from "effect/unstable/http/HttpClientRequest"`.
  - `from "@effect/platform/HttpServer"` → `from "effect/unstable/http/HttpServer"`.
  - `from "@effect/platform"` (whole-package re-export) — split into specific submodule imports per the v4 namespace.
- Verify named exports still exist under the new paths (e.g., `RpcGroup`, `Rpc`, `RpcClient`, `RpcServer`, `RpcSerialization`, `RpcMiddleware`, `RpcMessage`, `RpcClientError`, `HttpClient`, `HttpServer`, `HttpClientRequest`, `HttpBody`, `FetchHttpClient`, `HttpServer.layerContext`).

**Patterns to follow:**
- v4 source tree: `https://github.com/Effect-TS/effect-smol/tree/main/packages/effect/src/unstable`. Use to verify each import path.

**Test scenarios:**
- Integration: `bun test` collection step (no test runs, just imports resolve) passes for `korri/shared/api/rpc/**` and `korri/products/app/api/**`.
- Edge case: `tools/scripts/odin-smoke-rpc.ts` continues to type-check (not run — it's a script).

**Verification:**
- `rg "@effect/(rpc|platform)" korri/ tools/` returns zero hits.
- `just typecheck` is closer to passing — may still fail on Schema or Service-shape issues from Units 2 and 3 if any were missed; those failures are debugged here before moving on.

---

- [ ] **Unit 5: Test infrastructure migration**

**Goal:** Update all test harnesses (`with-rpc-server`, RPC handler tests, runRpc test paths) for v4 RPC. End of this unit: full test suite green on v4 with the existing architecture preserved.

**Requirements:** R2, R9

**Dependencies:** Units 2–4

**Files:**
- Modify: `tools/testing/library/with-rpc-server.ts` (verify it still works against v4 `RpcServer.toWebHandler`)
- Modify: `tools/testing/library/with-rpc-server.test.ts`
- Modify: `tools/testing/library/with-temp-library.ts` (no Effect imports; only update if Schema usage exists)
- Modify: `korri/products/app/api/library/list.rpc-handler.test.ts`
- Modify: `korri/products/app/api/library/launch.rpc-handler.test.ts`
- Modify: `korri/products/app/api/hello/rpc-handler.test.ts`
- Modify: `korri/products/app/features/resume/launch-controller.test.tsx` (still uses v4 RPC client over real HTTP; the file itself is deleted in Phase 2 Unit 12, but in Phase 1 it must compile and pass)
- Modify: `korri/shared/library/library-context.test.ts` (still v3 architecture in Phase 1; deleted Unit 7)
- Modify: any other test using `runRpc` over `withRpcServer`

**Approach:**
- The shape of `withRpcServer` is wire-protocol agnostic: it boots a real Hono app, returns a base URL. Should require minimal changes — verify the v4 RPC client sends and receives the same JSON envelope shape.
- For RPC handler tests: handlers in Phase 1 still call `getLibraryContext()` (the singleton survives this phase). The test pattern `configureLibraryContextForTesting({ source, launcher })` continues to work. Schema imports in tests need the v4 names from Unit 2.
- For `launch-controller.test.tsx`: the test sets `window.location.{origin,href,pathname}` and exercises the real RPC roundtrip via `runRpc` (which exists in Phase 1, deleted Phase 2). Verify the v4 HTTP client surfaces the same `pathname` requirement (per `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md`); update the doc if the issue is fixed in v4.

**Execution note:** This unit is the Phase 1 green-bar gate. Do not move to Phase 2 until `bun test` is fully green here.

**Patterns to follow:**
- `tools/testing/library/with-rpc-server.ts` — preserve the in-process Hono server pattern. Only adapt the v4 RPC server-side handler builder.
- `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md` — the location override pattern.

**Test scenarios:**
- Happy path: `with-rpc-server.test.ts` boots, the test makes a real RPC call against the in-process server, gets the expected response shape.
- Integration: `list.rpc-handler.test.ts` verifies a configured-real ROCKNIX source returns games sorted by `lastPlayed desc`.
- Integration: `launch.rpc-handler.test.ts` verifies a configured-real launcher (against `fake-game.sh`) reports `{ status: "launched" }` on exit 0 and `{ status: "failed", exitCode: N }` on non-zero.
- Error path: `launch.rpc-handler.test.ts` returns `NotFoundError._tag === "NotFoundError"` for an unknown id.
- Integration: `launch-controller.test.tsx` exercises the full state machine (idle → launching → idle/failed → retry) over a real RPC roundtrip.

**Verification (Phase 1 GREEN BAR GATE):**
- `bun test` exits 0 with the same number of passing tests as before migration (currently 652).
- `just typecheck` passes.
- `rg "from \"@effect/(rpc|platform|atom-react)\"" korri/ tools/` returns zero hits.
- The diff against `main` shows: package.json swap, schema renames, service renames, import path migrations — but no architectural changes yet. Existing files preserved.

---

### Phase 2 — Architectural adoption (atoms, ADTs, layer-swap)

- [ ] **Unit 6: Promote Library services and in-memory layers**

**Goal:** Create `LibrarySource` and `Launcher` as `Context.Service`s in shared, with both Live (filesystem/subprocess) and InMemory (configurable) layer implementations.

**Requirements:** R4, R8

**Dependencies:** Unit 5 (Phase 1 green bar)

**Files:**
- Create: `korri/shared/library/library-services.ts` (defines `LibrarySource` and `Launcher` Context.Service classes; the underlying interfaces in `library-source.ts` and `launcher.ts` stay as the input shape used by `Layer.succeed(LibrarySource, value)`)
- Create: `korri/shared/library/library-source-layer-memory.ts` (`makeInMemoryLibrarySourceLayer({ games, behavior })`)
- Create: `korri/shared/library/library-source-layer-memory.test.ts`
- Create: `korri/shared/library/launcher-layer-memory.ts` (`makeInMemoryLauncherLayer({ kind, exitCode?, delayMs? })`)
- Create: `korri/shared/library/launcher-layer-memory.test.ts`
- Create: `korri/shared/library/library-source-layer-live.ts` (`LibrarySourceLayerLive` that wraps `createRocknixSource(buildRocknixConfigFromEnv())`)
- Create: `korri/shared/library/launcher-layer-live.ts` (`LauncherLayerLive` that wraps `createShellLauncher()`)
- Reference: `korri/shared/library/library-source.ts` (interface stays, becomes the `Shape` input to `Context.Service<LibrarySource, LibrarySourceShape>`)
- Reference: `korri/shared/library/launcher.ts` (same)

**Approach:**
- Split the spike's combined `Library` service into two:
  ```
  class LibrarySource extends Context.Service<LibrarySource, LibrarySourceShape>()("LibrarySource") {}
  class Launcher extends Context.Service<Launcher, LauncherShape>()("Launcher") {}
  ```
  where `LibrarySourceShape` and `LauncherShape` are the existing interfaces in `library-source.ts` / `launcher.ts`, lifted into Effect-flavored signatures (`list: () => Effect.Effect<readonly GameRecord[], LibraryError>`).
- `LibraryError` (TaggedErrorClass) lives in `library-services.ts`. Replace the spike's `LibraryError` (which currently exists in `library-service.ts`).
- `library-source-layer-memory.ts` adapts the spike's `makeInMemoryLibraryLayer` for the source-only contract. Behavior knobs: `games`, `behavior: "ready" | "loading-forever" | { kind: "fail-list", error: LibraryError }`.
- `launcher-layer-memory.ts` adapts the spike's launch portion. Behavior knobs: `kind: "succeed" | "fail"`, `exitCode?`, `delayMs?`, `stderrTail?`.
- `library-source-layer-live.ts` and `launcher-layer-live.ts` use `Layer.effect(LibrarySource, Effect.sync(() => createRocknixSource(...)))` (or `Layer.succeed` if the existing factory functions are pure). The live layers absorb the env-driven config currently in `library-context.ts`.

**Patterns to follow:**
- `tools/spike-effect-atoms/library-service.ts` — service shape (after v4 rename).
- `tools/spike-effect-atoms/library-layer-memory.ts` — in-memory layer pattern.
- `korri/shared/library/library-context.ts` (`buildFromEnv`) — env-driven config logic that moves into the live layers.

**Test scenarios:**
- Happy path (memory source): `makeInMemoryLibrarySourceLayer({ games: [...3 games] })` resolved through `Layer` returns those 3 games on `list()`.
- Edge case (loading): `loadingForeverLayer.list()` never resolves (verify via timeout assertion in test).
- Error path (failing list): `makeFailingListLayer(new LibraryError(...))` causes `list()` to fail with that exact error.
- Happy path (memory launcher): `{ kind: "succeed" }` resolves to `{ status: "launched" }` after `delayMs`.
- Error path (memory launcher): `{ kind: "fail", exitCode: 7 }` resolves to `{ status: "failed", exitCode: 7 }`.
- Error path (memory launcher): `stderrTail` propagates when configured.
- Integration (live layers): `LibrarySourceLayerLive` over a `withTempLibrary` directory returns the same games as the existing `RocknixSource` test suite.
- Integration (live launcher): `LauncherLayerLive` against `fake-game.sh --exit-code 7` reports `{ status: "failed", exitCode: 7 }`.

**Verification:**
- New tests pass.
- `LibrarySource` and `Launcher` are usable from any Effect program via `yield* LibrarySource` / `yield* Launcher`.

---

- [ ] **Unit 7: Wire Layers into RPC handlers; delete `LibraryContext`**

**Goal:** Replace the singleton `getLibraryContext()` with Layer-injected services. Handlers consume `LibrarySource` and `Launcher` via `Effect.gen`.

**Requirements:** R4

**Dependencies:** Unit 6

**Files:**
- Modify: `korri/products/app/api/library/list.rpc-handler.ts` (consume `LibrarySource` via `Effect.gen`)
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts` (consume both `LibrarySource` and `Launcher`)
- Modify: `korri/shared/api/rpc/server.ts` (compose `LibrarySourceLayerLive` + `LauncherLayerLive` into the server `Layer.mergeAll`)
- Modify: `korri/shared/api/rpc/handlers.ts` (the `HandlersLive` layer composition shifts when handlers stop being plain payload functions)
- Modify: `korri/products/app/api/library/list.rpc-handler.test.ts` (test pattern shifts: provide an in-memory `LibrarySource` layer instead of `configureLibraryContextForTesting`)
- Modify: `korri/products/app/api/library/launch.rpc-handler.test.ts` (same — provide both layers)
- Modify: `korri/shared/library/library-context.test.ts` → DELETE (the singleton it tested is gone)
- Delete: `korri/shared/library/library-context.ts`

**Approach:**
- Handler shape change:
  ```
  // before
  export const handleListLibrary = (_: typeof ListLibraryPayload.Type) =>
    Effect.tryPromise({ try: () => getLibraryContext().source.list(), ... })

  // after
  export const handleListLibrary = (_: typeof ListLibraryPayload.Type) =>
    Effect.gen(function*() {
      const source = yield* LibrarySource
      return { games: yield* source.list() }
    })
  ```
- The handlers' `R` channel now includes `LibrarySource | Launcher`; the server's `Layer.mergeAll` provides them.
- Tests provide an in-memory layer composition:
  ```
  const TestServerLayer = Layer.mergeAll(
    HandlersLive,
    makeInMemoryLibrarySourceLayer({ games: [...] }),
    makeInMemoryLauncherLayer({ kind: "succeed" }),
    FeatureGatesMiddlewareLive,
    BatchJsonSerializationLive,
  )
  // pass to RpcServer.toWebHandler or a direct Effect.runPromise(handler.pipe(Effect.provide(TestServerLayer)))
  ```
- Existing tests that use `withTempLibrary` + `configureLibraryContextForTesting` reshape to `withTempLibrary` + `LibrarySourceLayerLive` (because `LibrarySourceLayerLive` reads env vars; the test sets `KORRI_ROCKNIX_GAMELIST_ROOTS` to the temp dir). This preserves the real-implementation testing posture.
- Alternative for tests: provide `Layer.succeed(LibrarySource, { list: () => ..., launchSpecFor: () => ... })` directly with an in-memory implementation that wraps the temp directory's contents. Pick whichever is shorter; both are real implementations.

**Execution note:** Test-first for handler reshape — write the new handler test against the layer-injection pattern before changing the handler.

**Patterns to follow:**
- Effect v4 `Layer.mergeAll` and `Effect.provide` for composing service layers.
- `korri/shared/api/rpc/server.ts` existing `ServerLive` composition shape.

**Test scenarios:**
- Happy path: `app.library.list` handler with an in-memory layer of 3 games returns `{ games: [3 games] }`.
- Edge case: `app.library.list` with an empty in-memory layer returns `{ games: [] }`.
- Error path: `app.library.list` with `makeFailingListLayer(error)` propagates the `LibraryError` (mapped to `DataError` in the handler).
- Happy path: `app.library.launch` with a known id and a succeeding launcher returns `{ status: "launched" }`.
- Error path: `app.library.launch` with a failing launcher (`exitCode: 7`) returns `{ status: "failed", exitCode: 7 }`.
- Error path: `app.library.launch` with an unknown id returns `NotFoundError`.
- Integration: end-to-end `withRpcServer` test that mounts the test layer composition and exercises the wire format with a real RPC client.

**Verification:**
- All RPC handler tests pass with no `getLibraryContext` calls remaining.
- `rg "getLibraryContext|configureLibraryContextForTesting" korri/ tools/` returns zero hits.

---

- [ ] **Unit 8: Promote ADTs (`LibraryListState`, `LaunchState`) to shared**

**Goal:** Move the validated state ADTs from spike to shared, adjust for v4 (`Result` → `AsyncResult`).

**Requirements:** R5, R8

**Dependencies:** Unit 6

**Files:**
- Create: `korri/shared/library/library-list-state.ts` (promoted from `tools/spike-effect-atoms/library-list-state.ts`, split off the `LaunchState` portion)
- Create: `korri/shared/library/library-list-state.test.ts` (promoted from spike)
- Create: `korri/shared/library/launch-state.ts` (the `LaunchState` portion, separated)
- Create: `korri/shared/library/launch-state.test.ts`

**Approach:**
- Promote `LibraryListState` + its `fromResult` and `select` helpers, but rename `Result.Result` → `AsyncResult.AsyncResult` and `Result.matchWithWaiting` → `AsyncResult.matchWithWaiting` (verify exact v4 export name from `effect/unstable/reactivity/AsyncResult`).
- Promote `LaunchState` + `fromExit` + `select` + `idle` / `launching` constructors. No type renames here — `Exit` and `Cause` are stable.
- Tests are nearly verbatim copies; only the Result→AsyncResult import path changes.

**Patterns to follow:**
- `tools/spike-effect-atoms/library-list-state.ts` and `library-list-state.test.ts` — the source content. Adjust imports.

**Test scenarios:**
- Happy path: `LibraryListState.fromResult(asyncResultSuccess([...3 games]))` returns `{ _tag: "Ready", games: [...] }`.
- Edge case: empty success (`asyncResultSuccess([])`) still returns `{ _tag: "Ready", games: [] }` (Empty is a Ready with zero games — distinguished in render, not in ADT).
- Edge case: waiting state returns `{ _tag: "Loading" }`.
- Error path: failure with `LibraryError` returns `{ _tag: "LoadError", error: <LibraryError> }`.
- Edge case: defect (unhandled error) returns `{ _tag: "Defect", defect: ... }`.
- Selector: `LibraryListState.select("Ready")(readyState)` is `Option.some({ _tag: "Ready", games })`; on a non-Ready state, `Option.none()`.
- Happy path: `LaunchState.fromExit(id, Exit.succeed({ status: "launched" }))` returns `{ _tag: "Launched", gameId: id }`.
- Error path: `LaunchState.fromExit(id, Exit.succeed({ status: "failed", exitCode: 7 }))` returns `{ _tag: "Failed", gameId: id, exitCode: 7 }`.
- Edge case: `LaunchState.fromExit(id, Exit.fail(...))` returns `{ _tag: "Defect", gameId, defect }`.

**Verification:**
- `bun test korri/shared/library/library-list-state.test.ts` passes.
- `bun test korri/shared/library/launch-state.test.ts` passes.
- ADTs are pure — testable without React or any browser globals.

---

- [ ] **Unit 9: Atoms — items atom, launch atom, layer atoms**

**Goal:** Create the production atom layer that components consume.

**Requirements:** R3, R6

**Dependencies:** Units 6, 8

**Files:**
- Create: `korri/shared/library/library-atoms.ts` (defines `librarySourceLayerAtom`, `launcherLayerAtom`, `libraryRuntime`, `libraryItemsAtom`, `launchAtom`)

**Approach:**
- Two layer atoms (one per service) so production wiring sets each independently. Defaults to `loadingForeverLayer` for both — prevents first-render content flash.
- One `Atom.runtime((get) => Layer.merge(get(librarySourceLayerAtom), get(launcherLayerAtom)))` providing both services.
- `libraryItemsAtom` reads `LibrarySource` and calls `list()`.
- `launchAtom = libraryRuntime.fn<string>()(id => ...)` reads `Launcher` + `LibrarySource` (to resolve `launchSpecFor(id)` first), then runs the launch.
- All exports are module-level — atoms are global per the v4 atom-react model. Subtree scoping is via the layer atoms, not React Provider.

**Patterns to follow:**
- `tools/spike-effect-atoms/library-atoms.ts` — direct template, but with two layer atoms instead of one.
- v4 imports: `import * as Atom from "effect/unstable/reactivity/Atom"` — verify exact spelling against the v4 source tree.

**Test scenarios:**
- Test expectation: none for atoms themselves at this unit (covered by integration via the components in Unit 11). Atom internals are Effect ecosystem code — testing them is testing Effect itself.

**Verification:**
- `korri/shared/library/library-atoms.ts` type-checks.
- `librarySourceLayerAtom` and `launcherLayerAtom` are settable from outside (via `useAtomSet` in components/stories).

---

- [ ] **Unit 10: Production layers — RPC-backed `LibrarySource` and `Launcher`**

**Goal:** Create the layers that production composition uses to wire the frontend atoms to the v4 RPC client.

**Requirements:** R3, R6

**Dependencies:** Unit 9

**Files:**
- Create: `korri/products/app/features/library/library-source-layer-rpc.ts` (`LibrarySourceLayerRpc` — uses v4 RPC client to call `app.library.list`)
- Create: `korri/products/app/features/library/launcher-layer-rpc.ts` (`LauncherLayerRpc` — uses v4 RPC client to call `app.library.launch`)
- Create: `korri/products/app/features/home/HomeServerRoot.tsx` (composition root that sets layer atoms = RPC layers, then renders children)
- Modify: `korri/products/app/routes/+index.tsx` (mounts `<HomeServerRoot>...children...</HomeServerRoot>`)

**Approach:**
- `LibrarySourceLayerRpc` is a `Layer.effect(LibrarySource, Effect.gen(function*() { const client = yield* RpcClient; return { list: () => client.use(c => c.app["library.list"]({})).pipe(Effect.map(r => r.games)), launchSpecFor: (id) => /* via the launch RPC's spec resolver, OR keep launchSpecFor server-side via launch RPC */ } }))`. Adjust the spec resolver: in the new architecture, `launchSpecFor` may not need to round-trip — the launch RPC handles spec resolution server-side. Confirm at implementation.
- `LauncherLayerRpc` is `Layer.effect(Launcher, Effect.gen(function*() { const client = yield* RpcClient; return { run: (spec) => client.use(c => c.app["library.launch"]({ id: spec.command })) /* or a different shape if the launch RPC payload changes */ } }))`. **Note:** the current launch RPC takes `id`, not `spec`. The v4 frontend Launcher's `run` takes a spec; we may need to either (a) preserve the current id-based shape and have the frontend's `Launcher` take an id, or (b) restructure the wire to pass spec. Option (a) keeps the wire compatible — preferred.
- `HomeServerRoot` uses `useAtomSet` (or `useAtomMount` + `useAtomSet`) to set `librarySourceLayerAtom = LibrarySourceLayerRpc` and `launcherLayerAtom = LauncherLayerRpc` once on mount.

**Execution note:** The shape of `client.use(c => c.app[...]({}))` in v4 may differ slightly from v3. Verify against `effect/unstable/rpc/RpcClient` API at implementation time.

**Patterns to follow:**
- v3 `korri/shared/api/rpc/runRpc.ts` — the `client.app["library.list"]({})` access pattern survives because v4 RPC preserves the tag-prefix splitting (split at first dot).

**Test scenarios:**
- Integration: `LibrarySourceLayerRpc` over `withRpcServer` returns the same games as the underlying handler with an in-memory backend.
- Integration: `LauncherLayerRpc` over `withRpcServer` reports `{ status: "failed", exitCode: 7 }` when the backend launcher is configured to fail.
- Edge case: `HomeServerRoot` mount sets both layer atoms exactly once (no re-renders thrash).

**Verification:**
- `HomeServerRoot` mounted with a real `withRpcServer` harness drives `libraryItemsAtom` to a Ready AsyncResult containing the harness's games.

---

- [ ] **Unit 11: Refactor `ShiftHomePage` — state-root + self-selecting children**

**Goal:** `ShiftHomePage` becomes a pure composition under `LibraryListStateRoot`, with self-selecting body components per state. No `useRpcQuery`, no `useGameLaunch`, no `@app/*` imports.

**Requirements:** R5, R6, R11

**Dependencies:** Units 8–10

**Files:**
- Modify: `korri/shared/themes/shift/pages/ShiftHomePage.tsx` (remove `useRpcQuery`, `useGameLaunch`, `@app/*` imports; compose state-root + self-selecting bodies)
- Create: `korri/shared/themes/shift/pages/ShiftHomeLoadingBody.tsx` (self-selects "Loading"; renders existing loading placeholder)
- Create: `korri/shared/themes/shift/pages/ShiftHomeLoadErrorBody.tsx` (self-selects "LoadError"; renders error message + retry)
- Create: `korri/shared/themes/shift/pages/ShiftHomeDefectBody.tsx` (self-selects "Defect"; renders a defect message — same visual as error for now)
- Create: `korri/shared/themes/shift/pages/ShiftHomeEmptyBody.tsx` (self-selects "Ready" with `games.length === 0`; renders existing empty placeholder)
- Create: `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx` (self-selects "Ready" with `games.length > 0`; renders the existing rail + bottom-bar + launch surface composition)
- Modify: `korri/shared/themes/shift/molecules/ShiftLaunchFailureBanner.tsx` (no behavior change; ensure it can be driven by `LaunchState` ADT)
- Reference: `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` (Provider shape — keep)

**Approach:**
- `ShiftHomePage.tsx` becomes:
  ```
  function ShiftHomePage() {
    const items = useAtomValue(libraryItemsAtom)
    const refreshItems = useAtomRefresh(libraryItemsAtom)
    const launch = useLibraryLaunchController()  // from Unit 12

    return (
      <LibraryListStateRoot result={items}>
        <ShiftHomeLoadingBody />
        <ShiftHomeLoadErrorBody onRetry={refreshItems} />
        <ShiftHomeDefectBody />
        <ShiftHomeEmptyBody />
        <ShiftHomeReadyBody launch={launch} />
      </LibraryListStateRoot>
    )
  }
  ```
- Each body component reads from the state context via `useLibraryListCase("...")` and returns `null` when not its case.
- `ShiftHomeReadyBody` composes the existing `ShiftHomeRoot` (the Shift template) + `ShiftHomeRail` + `ShiftHomeBottomBar` + `ShiftLaunchFailureBanner`. The launch controller is passed in.
- `LibraryListStateRoot` lives in `korri/shared/library/library-list-state-root.tsx` (or co-located in `library-list-state.ts` if small enough). It accepts the AsyncResult, computes the ADT once, provides via Context.

**Execution note:** Read `~/.pi/packages/react/skills/react/SKILL.md` before editing any `.tsx` file in this unit.

**Patterns to follow:**
- `tools/spike-effect-atoms/LibraryList.tsx` — exact template shape (state-root + self-selecting children).
- `docs/development/style-guide.md` Functional state component pattern — the canonical reference.
- Existing `ShiftHomePage.tsx` for the visual composition that lands in `ShiftHomeReadyBody`.

**Test scenarios:**
- Test expectation: behavior covered by Unit 14 stories (visual) + existing E2E feature files (functional). No new unit tests for the page itself — the body components are presentational and the state logic is in the unit-tested ADTs.

**Verification:**
- `ShiftHomePage.tsx` has zero imports from `@app/*` or `@shared/api/rpc/runRpc` or `@shared/api/rpc/useRpcQuery`.
- `rg "from \"@app/" korri/shared/themes/` returns zero hits.

---

- [ ] **Unit 12: Replace `useGameLaunch` with `useLibraryLaunchController`**

**Goal:** The launch controller is an atom-driven hook that returns `{ state: LaunchState, start: (game) => void }`.

**Requirements:** R3, R5

**Dependencies:** Units 8, 9

**Files:**
- Create: `korri/shared/library/use-library-launch-controller.ts` (the new hook)
- Create: `korri/shared/library/use-library-launch-controller.test.tsx`
- Delete: `korri/products/app/features/resume/launch-controller.ts`
- Delete: `korri/products/app/features/resume/launch-controller.test.tsx`

**Approach:**
- Hook shape:
  ```
  export function useLibraryLaunchController(): LaunchController {
    const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
    const [state, setState] = useState<LaunchState>(LaunchState.idle)

    const start = useCallback((game: GameRecord) => {
      setState(LaunchState.launching(game.id))
      void launch(game.id).then(exit => setState(LaunchState.fromExit(game.id, exit)))
    }, [launch])

    return useMemo(() => ({ state, start }), [state, start])
  }
  ```
- The hook lives in `shared/library` (not in `products/app/features/resume/`) because it's a generic capability over the `Launcher` service and consumed by any theme/page that triggers launches.
- Spatial-nav `confirm` action subscription (`useInputAction("confirm", ...)`) moves into the page composition (`ShiftHomeReadyBody`), not into the controller hook — the hook is theme-agnostic; "confirm triggers launch on the focused tile" is a theme-level binding.
- Tests verify state transitions using a real in-memory launcher layer (no mocks).

**Execution note:** Test-first. The state-transition contract is the testable thing.

**Patterns to follow:**
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — the controller hook example.
- `tools/spike-effect-atoms/LibraryList.tsx` — the `useLibraryLaunchController` shape (already present in spike).
- Existing `launch-controller.test.tsx` — preserves the test scenarios via real-RPC-roundtrip; the new tests use real-in-memory-launcher instead. Same testing posture, simpler harness.

**Test scenarios:**
- Happy path: `start(game)` transitions state from Idle → Launching → Launched (after the in-memory launcher's delay).
- Error path: with a failing launcher, state goes Idle → Launching → Failed with the configured `exitCode` and `gameId`.
- Edge case: calling `start` while `Launching` does not start a second launch (suppressed).
- Retry path: after Failed, calling `start(sameGame)` re-fires and transitions through Launching again.
- Edge case: `LaunchState.fromExit` is used directly; no separate retry-state machinery.
- Defect path: with a launcher that throws (configured via `behavior: "defect"`), state goes to Defect with the squashed cause.

**Verification:**
- New tests pass.
- `rg "useGameLaunch" korri/ tools/` returns zero hits.
- `korri/products/app/features/resume/` no longer contains `launch-controller.*` files.

---

- [ ] **Unit 13: Delete legacy frontend transport (`runRpc`, `useRpcQuery`, `rpcQueryStore`, `rx/`)**

**Goal:** Remove the homegrown query infrastructure now that atoms drive all reads.

**Requirements:** R3

**Dependencies:** Unit 11 (no callers remain)

**Files:**
- Delete: `korri/shared/api/rpc/runRpc.ts`
- Delete: `korri/shared/api/rpc/useRpcQuery.ts`
- Delete: `korri/shared/api/rpc/rpcQueryStore.ts`
- Delete: `korri/shared/api/rpc/rx/client.ts`
- Delete: `korri/shared/api/rpc/rx/microtask-batch-queue.ts`
- Delete: `korri/shared/api/rpc/rx/microtask-batch-queue.test.ts`
- Modify: `tools/scripts/odin-smoke-rpc.ts` (this script speaks the wire format directly — verify v4 wire format is unchanged or update accordingly)

**Approach:**
- Pure deletion. No replacement files.
- `tools/scripts/odin-smoke-rpc.ts` was deliberately written without going through `runRpc` (per its docstring); it speaks the @effect/rpc wire format directly. Verify v4's wire format is the same shape (`Schema.ExitEncoded` envelopes, batch-JSON array). Update import paths only.

**Test scenarios:**
- Test expectation: none — deletion. Verification is type-check + grep.

**Verification:**
- `rg "runRpc|useRpcQuery|rpcQueryStore" korri/ tools/` returns only references in deleted files (which no longer exist) and `docs/`. Zero in active code.
- `just typecheck` passes.

---

- [ ] **Unit 14: Refactor `ShiftHomePage.stories.tsx` — five layer-swap stories**

**Goal:** Replace the single broken `Default` story with five stories (Default, Loading, LoadError, Empty, FailedLaunch) that render via layer-swap decorators against in-memory implementations.

**Requirements:** R7, R11

**Dependencies:** Units 6, 9, 11

**Files:**
- Modify: `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx`
- Reference: `tools/spike-effect-atoms/LibraryList.stories.tsx` (the layer-swap decorator pattern)

**Approach:**
- Adopt the `withLibraryLayers(sourceLayer, launcherLayer)` decorator pattern from the spike. Two layers: source layer + launcher layer; sets both via `useAtomSet` in `useLayoutEffect`.
- Stories:
  - **Default**: in-memory source with seed games (use `korri/shared/fixtures/games/games.ts`); succeeding launcher.
  - **Loading**: `loadingForeverLayer` for source; any launcher.
  - **LoadError**: `makeFailingListLayer(new LibraryError({ reason: "io", message: "Seeded read failure" }))`; any launcher.
  - **Empty**: in-memory source with `games: []`; any launcher.
  - **FailedLaunch**: in-memory source with seed games; failing launcher (`{ kind: "fail", exitCode: 1, delayMs: 200 }`). The story includes a `play` function (Storybook interaction test) that focuses a tile, fires the confirm action, and asserts the failure banner appears.

**Execution note:** Read `~/.pi/packages/react/skills/react/SKILL.md` before editing the `.tsx` story file.

**Patterns to follow:**
- `tools/spike-effect-atoms/LibraryList.stories.tsx` — layer-swap decorator (after adapting for two layer atoms).
- Existing `ShiftHomePage.stories.tsx` viewport configuration — preserve.

**Test scenarios:**
- Visual: each story renders without an API server running.
- Visual: each story renders the corresponding state ADT case (Loading/LoadError/Ready/Empty distinctly).
- Interaction (FailedLaunch story `play` function): confirm action triggers launch attempt → spinner → failure banner appears with the configured exit code and game title.

**Verification (parts of Phase 2 GREEN BAR GATE):**
- `just dev-storybook` boots and renders all five `Themes/Shift/Pages/Home/*` stories without making network calls.
- DevTools network panel shows zero `/api/rpc` requests when navigating between stories.

---

- [ ] **Unit 15: Cleanup — delete spike, update Storybook glob, update standards**

**Goal:** Remove the spike folder; update tooling references; update the standards doc to reflect the actual v4 package name and `AsyncResult` rename.

**Requirements:** R8, R10, R11

**Dependencies:** Units 6–14 (everything that references spike paths must already be updated)

**Files:**
- Delete: `tools/spike-effect-atoms/library-service.ts`
- Delete: `tools/spike-effect-atoms/library-layer-memory.ts`
- Delete: `tools/spike-effect-atoms/library-layer-memory.test.ts`
- Delete: `tools/spike-effect-atoms/library-atoms.ts`
- Delete: `tools/spike-effect-atoms/library-list-state.ts`
- Delete: `tools/spike-effect-atoms/library-list-state.test.ts`
- Delete: `tools/spike-effect-atoms/LibraryList.tsx`
- Delete: `tools/spike-effect-atoms/LibraryList.stories.tsx`
- Delete: `tools/spike-effect-atoms/README.md`
- Delete: `tools/spike-effect-atoms/` (the directory itself)
- Modify: `korri/deploy/storybook/main.ts` (remove the `tools/spike-effect-atoms/**` glob entry)
- Modify: `docs/development/standards.md` (replace `@effect-atom/atom-react` with `@effect/atom-react`; replace `Result` references in atom context with `AsyncResult`)
- Modify: `docs/development/style-guide.md` if any examples reference `Result` from atom-react — update to `AsyncResult`

**Approach:**
- Pure cleanup. No new behavior.
- The standards doc currently says "Reactive state uses `@effect-atom/atom-react`" — update the package name. Also: the style guide's Functional state component example uses `Result.Result<...>` for the atom's input — verify whether that should become `AsyncResult.AsyncResult<...>` and update consistently.
- Run `just generate-feature-map` afterward to confirm no documentation links broke.

**Test scenarios:**
- Test expectation: none — pure cleanup. Verification is grep + format + lint + typecheck pass.

**Verification (Phase 2 GREEN BAR GATE):**
- `bun test` passes (full suite green).
- `just typecheck` passes.
- `just lint` passes.
- `just format` reports no changes needed (or applies only auto-fixes).
- `rg "tools/spike-effect-atoms" korri/ tools/ docs/` returns zero hits in active code (docs may legitimately reference the spike for historical context — review each).
- `just dev` boots cleanly; the home route loads a real ROCKNIX library and a tile launch invokes `runemu.sh` (manual smoke).
- `just dev-storybook` boots and renders the five home stories without network.
- The diff against `main` includes: package.json swap, ~50 modified files, ~12 new files, ~10 deleted files, the spike folder gone.

---

## System-Wide Impact

- **Interaction graph:**
  - The RPC layer composition changes shape: handlers now declare service requirements via Effect's `R` channel; the server's `Layer.mergeAll` provides them. Any new RPC handler added during the migration window must follow the v4 pattern.
  - The frontend's data-source seam moves from `runRpc` (module global) to `Atom.runtime + layer atoms` (module global atoms with story/test override).
  - `useInputAction("confirm", ...)` subscription moves from `useGameLaunch` (deleted) into `ShiftHomeReadyBody` (theme-level).
- **Error propagation:**
  - Schema TaggedError → TaggedErrorClass should preserve wire shape, but verify by exercising every error path test (`DataError`, `NotFoundError`, `ValidationError`, `LibraryError`).
  - `LibraryListState.Defect` and `LaunchState.Defect` are new failure surfaces in the UI ADT — they replace the implicit "RPC throws unstructured error" path. Stories cover the visual.
- **State lifecycle risks:**
  - Atoms live across the iframe lifetime. If a story re-renders and the layer atom retains its previous value, state can leak between stories. Mitigation: each story's decorator sets both layer atoms in a `useLayoutEffect`. Verify in Unit 14.
  - The `useLibraryLaunchController` hook's local state resets on mount/unmount; matches current `useGameLaunch` behavior.
- **API surface parity:**
  - Wire format for `app.library.list` and `app.library.launch` is preserved: payload shapes, response shapes, error shapes all unchanged. Schema renames are constructor-level only.
  - Feature gates middleware preserves its header/payload contract (`X-Korri-Feature-Gates` header).
- **Integration coverage:**
  - End-to-end RPC roundtrip via `withRpcServer` covers handler service-injection.
  - End-to-end story interaction via `play` covers atom-driven launch.
  - On-device smoke (manual) covers the full prod stack.
- **Unchanged invariants:**
  - All public RPC tags (`app.hello.get`, `app.library.list`, `app.library.launch`) keep the same names and wire format.
  - All Schema-typed errors keep their `_tag` discriminators.
  - The Hono `honoApp` mount path (`/api/rpc`) is unchanged.
  - Feature gates registry, header parsing, and resolver behavior are unchanged.
  - All `korri/shared/themes/shift/{atoms,molecules,organisms,templates}/**` files are unchanged (the bug was confined to `pages/ShiftHomePage.tsx`).
  - `tools/testing/fake-game.sh`, `tools/testing/library/with-temp-library.ts`, and the ROCKNIX parsers are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| **Beta breakage in `effect@4.0.0-beta.60`** — the unstable RPC module may have rough edges that block the migration mid-flight. | Pin exact version. If beta-60 has a blocker, freeze on the highest beta that compiles cleanly. Single-PR atomic revert is always available. |
| **`@effect/atom-react@4.0.0-beta.60` peer-dep conflict** — requires `react>=19.2.4`; Korri has 19.2.5. | Already verified at planning time. Re-verify after `bun install` in Unit 1. |
| **Schema TaggedError → TaggedErrorClass changes wire shape subtly** — error responses might serialize with a different field order or extra metadata, breaking client error discrimination. | Phase 1 green-bar runs every error-path test; any wire-format change shows up immediately. The mitigation is the existing test coverage. |
| **`@effect/platform` removed entirely; some HTTP-layer usage may have no v4 equivalent yet** — e.g., a specific middleware or layer composition utility. | All current uses are basic (FetchHttpClient, HttpServer.layerContext, HttpClient/HttpClientRequest/HttpBody). All have direct v4 equivalents under `effect/unstable/http`. If something is missing, fall back to a hand-rolled layer for that one piece. |
| **`window.location.pathname` happy-dom interaction** persists in v4 — tests fail with the "InvalidUrl" error from the integration-issues doc. | The `with-rpc-server` harness already handles this via the `pointWindowAtRpcHarness` pattern flagged in the integration-issues doc. Re-verify in Unit 5. |
| **Atom state leaks between stories** in the same iframe — Storybook autodocs renders multiple stories simultaneously. | Each story's decorator sets layer atoms in `useLayoutEffect`. If autodocs becomes a problem, switch to non-autodocs `tags: []` for the home stories specifically. |
| **`useLibraryLaunchController` local state confuses the spatial-nav focus model** — currently `useGameLaunch` integrates with `useInputAction` in a hook; the refactor moves confirm-binding into `ShiftHomeReadyBody`. Tile focus + confirm action may not behave identically. | Existing E2E feature files (`korri/products/app/features/resume/e2e/safe-game-resume.feature`) are the regression check. The `play` function in the FailedLaunch story is a tighter interaction test. |
| **`tools/scripts/odin-smoke-rpc.ts` wire format drift** — the script hand-encodes the @effect/rpc batch-JSON envelope; v4 may have changed the envelope. | Verify against the v4 `RpcMessage.FromClientEncoded` shape during Unit 13. The script is a smoke test, not a hot-path; failures are easy to spot. |
| **Type errors that only surface in whole-repo typecheck** (path aliases) — Phase 1 internal compile may pass per-file but `just typecheck` fails. | Run `just typecheck` at the end of each unit, not just at phase boundaries. Slows iteration but prevents accumulated debt. |

## Documentation / Operational Notes

- **Standards doc update is part of Unit 15** — the migration changes the canonical package name and the `Result`/`AsyncResult` rename ripples into the style guide example.
- **No production runtime config changes** — the same `KORRI_ROCKNIX_GAMELIST_ROOTS`, `KORRI_LAUNCHER`, etc. env vars continue to work; the live layers absorb the env-driven config that was previously in `library-context.ts`.
- **No deployment changes** — the dev stack (`just dev`), the desktop build (`just desktop-build`), and the Odin remote loop (`just dev-odin`) all continue to work because the wire format and ports are unchanged.
- **On-device smoke is post-merge** — Unit 13 of the personal-MVP plan (`just dev-odin` + manual launch test) is rerun by the user after this migration lands. Not orchestrated here.
- **No new Slack threads, runbooks, or external comms** — single-developer project, single-PR change.

## Sources & References

- **Origin spike plan:** `docs/plans/2026-05-03-002-feat-effect-atoms-spike-plan.md`
- **Spike code:** `tools/spike-effect-atoms/` (deleted by Unit 15)
- **Spike best-practice doc:** `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- **Development standards:** `docs/development/{philosophy,standards,style-guide}.md`
- **Effect v4 main migration:** `https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md`
- **Schema v4 migration table:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/schema.md`
- **Services migration:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md`
- **Runtime migration:** `https://github.com/Effect-TS/effect-smol/blob/main/migration/runtime.md`
- **v4 source tree:** `https://github.com/Effect-TS/effect-smol/tree/main/packages/effect/src/unstable`
- **v4 atom-react source:** `https://github.com/Effect-TS/effect-smol/tree/main/packages/atom/react/src`
- **Personal-MVP origin work:** `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`
- **Real-implementations testing posture:** `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
- **`window.location.pathname` happy-dom gotcha:** `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md`
