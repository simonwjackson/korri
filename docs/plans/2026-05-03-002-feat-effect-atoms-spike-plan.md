---
title: "feat: validate Effect atoms + Result.builder pattern via in-place spike"
type: feat
status: active
date: 2026-05-03
---

# feat: validate Effect atoms + Result.builder pattern via in-place spike

## Overview

Build a small, throwaway-ready spike that validates the **Effect atoms + `Result.builder` pattern** as the future shape for Korri's React data layer. The spike uses `@effect-atom/atom-react@0.5.0` against the existing `effect@3.20` runtime — the v3 atom library shares the same API surface as the v4 successor (`@effect/atom-react@4.0.0-beta.60`), per Tim Smart's confirmation that v4 atoms live at `effect/unstable/reactivity` with the same shape. Validating in v3 answers "do we like the pattern?" without paying the ~10–14 hr cost of a full v4 migration.

The spike does NOT migrate any existing component, does NOT change production routes, and does NOT swap the existing `runRpc` / `useRpcQuery` infrastructure. It builds one isolated component (`LibraryList`) with one in-memory `Library` service implementation and four Storybook stories that demonstrate the full lifecycle (loading → ready → focused interaction → launch success/failure → retry → error) with **zero network calls and zero mocks**.

## Problem Frame

Brainstorm conversation (no requirements doc — planning from in-conversation discussion) established:

- Korri's current renderer code couples theme components (`korri/shared/themes/shift/pages/ShiftHomePage.tsx`) to product RPC infrastructure (`useRpcQuery`, `runRpc`). Storybook can't render any "page" without a backing API server because `useRpcQuery` always fires HTTP.
- The user's standard: any page must render in Storybook, fully testable, with no network calls and no mocking of network APIs. Real implementations of contracts only — same posture as `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`.
- The user's stated long-term goal: Effect-everywhere on the codebase, including the frontend.
- Three paths were evaluated: full v4 migration in place (~10–14 hrs), v4 sub-package spike (~3 hrs), v3 in-place spike (~90 min). The v3 spike was chosen because its API is functionally identical to v4 atoms, which means the design question ("do we like atoms?") is answerable today without committing to a v4 migration.

## Requirements Trace

- **R1.** A `LibraryList` component renders four distinct visual states (loading, ready, error, failed-launch) in Storybook, with no network requests in the browser network tab.
- **R2.** Story-level state swap is achieved by **swapping a layer atom**, not by mocking, stubbing callbacks, or replacing global functions. Each story constructs a real `Library` service implementation with configured behavior.
- **R3.** Click interaction in the "ready" story triggers the real launch state machine (`idle → launching → idle | failed`) via the in-memory `Library.launch` implementation and renders any failure visual through `Result.builder`.
- **R4.** A pure-Effect unit test exercises the in-memory layer through `Effect.runPromise` (no React) and confirms `list` and `launch` produce the configured outcomes.
- **R5.** Existing tests (652 currently passing) continue to pass. Existing `bun run dev`, `just dev-storybook`, and `just typecheck` continue to work.
- **R6.** The spike is fully revertable via `git revert` of the spike commits — no edits to existing production code beyond the Storybook config.

## Scope Boundaries

- No changes to `ShiftHomePage`, `ShiftHomeRoot`, `useRpcQuery`, `runRpc`, `useGameLaunch`, or any RPC handler.
- No production route changes.
- No new RPC schemas, no backend changes.
- No `Live` layer that talks to `runRpc` — the spike only exercises the in-memory layer.
- No styling work beyond enough to visually distinguish the four states.
- No bundle-size optimization or analysis (deferred — see Open Questions).

### Deferred to Separate Tasks

- **Full Effect v4 migration of the existing app** (~10–14 hrs, separate plan): only undertaken if the spike validates the pattern. Includes migrating all 38 `effect`-importing files, replacing `@effect/rpc@v3` with `effect/unstable/rpc`, replacing `@effect/platform@v3` with v4, rewriting `runRpc.ts` and `rx/client.ts` (both use removed `Runtime<R>` API).
- **`ShiftHomePage` refactor to be source-agnostic** (separate plan): regardless of whether atoms are adopted, the existing page violates `korri/shared/themes/*` boundaries by importing `@app/*` and `useRpcQuery`. That refactor stands on its own.
- **Production `Live` layer** wrapping `runRpc` as a `Library` service: only relevant if the spike succeeds and we proceed.
- **Multi-component validation** (settings page, game-detail page, library-browser): the spike is one component on purpose. Broader validation comes after the pattern decision.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/library/library-source.ts` — existing `LibrarySource` interface (real implementations: `RocknixSource`, `withTempLibrary`). The spike's `Library.list` mirrors `LibrarySource.list`.
- `korri/shared/library/launcher.ts` — existing `Launcher` interface (real implementations: `ShellLauncher`, `fake-game.sh`). The spike's `Library.launch` mirrors `Launcher.run`.
- `korri/shared/fixtures/games/games.ts` — three reusable seed games: "Crystalline Drift", "Ember Circuit", "Halcyon Orbit". Reuse, do not duplicate.
- `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` — example of the existing Provider-based Root pattern (not used by the spike, but informs how a future production `Live` layer would compose).
- `korri/deploy/storybook/main.ts` — Storybook config. Current `stories` glob covers `korri/shared/**` and `korri/products/**` only. Spike location must either fit the glob or extend it.
- `korri/deploy/storybook/preview.tsx` — existing decorator + global setup pattern; spike decorators follow the same shape.

### Institutional Learnings

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — the testing posture this spike honors. In-memory `Library` is a real implementation of the contract (same shape as `withTempLibrary` for filesystem-backed tests), not a stub.
- `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md` — not directly relevant (the spike does not exercise RPC) but signals the kinds of integration gotchas that real-implementation testing surfaces.

### External References

- Effect v4 beta announcement (April 2026): https://effect.website/blog/releases/effect/40-beta — confirms v3 stays recommended for production until v4 LTS.
- `@effect-atom/atom-react@0.5.0` README: https://github.com/tim-smart/effect-atom — source of API patterns used in the spike.
- `RuntimeFactory` source confirming `Atom.runtime((get) => get(layerAtom))` derived-layer pattern works: `packages/atom/src/Atom.ts:625-720`.
- Tim Smart on v4 atoms (issue #413, March 2026): "In v4 Atom is part of the library `import { Atom } from "effect/unstable/reactivity"`" — confirms v3-validated patterns transfer to v4.

## Key Technical Decisions

- **v3 atom library, not v4 beta.** Validates the pattern at minimum cost. The atom API surface is functionally identical between `@effect-atom/atom-react@0.5.0` and `@effect/atom-react@4.0.0-beta.60` (same author, same shape, folded into core for v4). If the spike succeeds, the v4 migration is a separate, larger plan.
- **One service, two methods.** The spike collapses the production `LibrarySource` + `Launcher` contracts into a single `Library` service with `list` and `launch` methods. Production keeps the seam; the spike doesn't need it. Reduces files and cognitive load for a 90-minute validation.
- **Layer-swap via `Atom.runtime((get) => get(layerAtom))`.** Source review of `RuntimeFactory` (lines 625–720 of `packages/atom/src/Atom.ts`) confirms `Atom.runtime` accepts either a static Layer or a function `(get: Context) => Layer`. Swapping `layerAtom` via `useAtomSet` in a story decorator triggers runtime rebuild and downstream atom re-evaluation. This is the central swap mechanism — if it doesn't work as expected at implementation time, see Risks.
- **Default layer is "loading forever".** `libraryLayerAtom` initial value is a layer where `list` returns `Effect.never`. This prevents a flash of wrong content during the brief window between component mount and decorator `useLayoutEffect` swap. Any unswapped story would naturally render the loading visual rather than garbage.
- **Spike location: `tools/spike-effect-atoms/`.** AGENTS.md reserves `korri/shared/*` for runtime code; a throwaway spike doesn't fit. Storybook config is extended one line to include `tools/spike-effect-atoms/**/*.stories.@(ts|tsx)`. Reverts cleanly with the rest of the spike.
- **`Result.builder` for state branching, not manual `if/else`.** The spike validates this exact pattern as the future replacement for `ShiftHomePage`'s current `if (loading) … if (error) … if (empty) …` boolean forest.

## Open Questions

### Resolved During Planning

- **Does `Atom.runtime` accept a derived layer?** Yes — confirmed via source. `(get: Context) => Layer.Layer<...>` is a valid signature.
- **Does `@effect-atom/atom-react@0.5.0` work with React 19?** Yes — peer dep is `react >=18 <20`, Korri runs `react@^19.0.0`.
- **Does `@effect-atom/atom-react@0.5.0` work with `effect@3.20`?** Yes — peer dep is `effect ^3.19`, Korri runs `effect@^3.20.0`.
- **Where does the spike live?** `tools/spike-effect-atoms/` (one-line Storybook glob extension to include it).
- **What seed games?** Reuse `korri/shared/fixtures/games/games.ts` (Crystalline Drift, Ember Circuit, Halcyon Orbit).

### Deferred to Implementation

- **Exact Storybook decorator timing for `useAtomSet(libraryLayerAtom)` swap.** Likely `useLayoutEffect` to swap before paint, but `useEffect` may suffice if the first-render flash is invisible due to the loading-forever default. To be confirmed by eyeballing during Unit 4.
- **Whether `Atom.fn` returns awaitable Promise via `useAtomSet(launchAtom, { mode: "promiseExit" })` works as documented in the README.** Verified via README example, but exact options shape may have evolved between README write date and 0.5.0. Minor — fall back to `Atom.fn` without options if the mode argument doesn't apply.
- **Visual treatment of the four states.** The spike uses minimal styling — enough to distinguish them in Storybook. Final designed states are out of scope.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌──────────────────────────────────────────────────────────────────────┐
│ Storybook story (e.g., FailedLaunch)                                 │
│   decorator: withLayer(makeInMemoryLibraryLayer({                    │
│     games: SEED_GAMES,                                               │
│     launch: { kind: "fail", exitCode: 1 }                            │
│   }))                                                                │
│   ↓ useAtomSet(libraryLayerAtom) sets the layer                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ libraryLayerAtom (writable, holds a Layer<Library>)                  │
│   default: layerLoadingForever                                       │
│   on swap: triggers libraryRuntime rebuild                           │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ libraryRuntime = Atom.runtime((get) => get(libraryLayerAtom))        │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────┐                ┌──────────────────────────────┐
│ libraryItemsAtom     │                │ launchAtom                   │
│   = libraryRuntime   │                │   = libraryRuntime.fn        │
│       .atom(         │                │       (id => Library.launch) │
│         Library.list │                │   Result via promiseExit     │
│       )              │                └──────────────────────────────┘
│   Result<readonly    │                              ↓
│     GameRecord[]>    │                              ↓
└──────────────────────┘                              ↓
        ↓                                             ↓
        ↓                                             ↓
┌──────────────────────────────────────────────────────────────────────┐
│ <LibraryList />                                                      │
│   const items = useAtomValue(libraryItemsAtom)                       │
│   const launch = useAtomSet(launchAtom, { mode: "promiseExit" })     │
│                                                                      │
│   return Result.builder(items)                                       │
│     .onInitial(() => <Loading />)                                    │
│     .onFailure(() => <ErrorWithRetry />)                             │
│     .onSuccess((games) => (                                          │
│       <List games={games} onSelect={(id) => launch(id)} />           │
│     ))                                                               │
│     .render()                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

The component has zero knowledge of which `Library` implementation it received. Stories swap the layer atom; production (out of scope here) would compose its own layer at app boot.

## Output Structure

```
tools/spike-effect-atoms/
  README.md                          # what this is, how to revert, what we learned
  library-service.ts                 # Library Context.Tag, types
  library-layer-memory.ts            # makeInMemoryLibraryLayer + sentinel "loading-forever" layer
  library-layer-memory.test.ts       # pure-Effect test of the in-memory layer
  library-atoms.ts                   # libraryLayerAtom, libraryRuntime, libraryItemsAtom, launchAtom
  LibraryList.tsx                    # the component using Result.builder
  LibraryList.stories.tsx            # 4 stories: Default, FailedLaunch, Loading, Error
```

## Implementation Units

- [ ] **Unit 1: Add `@effect-atom/atom-react` dependency and extend Storybook glob**

**Goal:** Install the atom library, extend the Storybook stories glob to include the spike folder, verify nothing is broken in the existing app.

**Requirements:** R5, R6

**Dependencies:** None.

**Files:**
- Modify: `package.json` — add `"@effect-atom/atom-react": "^0.5.0"` to `dependencies` (it ships React-side hooks)
- Modify: `bun.lock` — regenerated by `bun install`
- Modify: `korri/deploy/storybook/main.ts` — extend the `stories` array to include `"../../../tools/spike-effect-atoms/**/*.stories.@(ts|tsx|mdx)"`

**Approach:**
- Single new dep, no version bumps to existing packages. `@effect-atom/atom-react@0.5.0` peer deps are `effect ^3.19`, `react >=18 <20`, both already satisfied.
- Storybook glob extension is the only edit to existing config. The relative path is a third `../` because `main.ts` lives at `korri/deploy/storybook/` and needs to reach `tools/` at repo root.

**Patterns to follow:**
- `korri/deploy/storybook/main.ts` existing `stories` array shape.

**Test scenarios:**
- Test expectation: none -- pure dependency install plus one config line.

**Verification:**
- `bun install` completes without peer-dep warnings beyond pre-existing ones.
- `bun test` reports the same 652 passing tests as before.
- `just typecheck` is clean.
- `just dev-storybook` starts and the existing stories render unchanged (smoke check).

---

- [ ] **Unit 2: Define `Library` service, in-memory layer factory, and atoms**

**Goal:** Build the v3-Effect side of the spike — the service contract, two layer constructors (configurable in-memory + sentinel loading-forever), and the module-level atoms that consume them.

**Requirements:** R2, R3, R4

**Dependencies:** Unit 1.

**Files:**
- Create: `tools/spike-effect-atoms/library-service.ts`
- Create: `tools/spike-effect-atoms/library-layer-memory.ts`
- Create: `tools/spike-effect-atoms/library-atoms.ts`
- Test: `tools/spike-effect-atoms/library-layer-memory.test.ts`

**Approach:**
- `library-service.ts` defines:
  - A `GameRecord` re-export from `@shared/fixtures/games/game` to avoid duplicating the type
  - A `LaunchResult` discriminated union (`{ status: "launched" } | { status: "failed", exitCode: number }`) — same shape as the existing production `LaunchResult` in `korri/shared/library/launcher.ts`
  - A `Library` Effect Service via `Context.Tag` (v3 class-based syntax matching the project's existing pattern in `korri/shared/gates/middleware.ts`) with two methods: `list` (returns `Effect<readonly GameRecord[], LibraryError>`) and `launch` (returns `Effect<LaunchResult, never>` — failures as data, not effect failures, mirroring production)
  - A `LibraryError` Schema-tagged error class for the list-error case
- `library-layer-memory.ts` exports two functions:
  - `makeInMemoryLibraryLayer(config: { games, launch: { kind: "succeed" | "fail", exitCode?, delayMs? } })` — returns `Layer.succeed(Library, …)` with `list` returning `Effect.succeed(games)` and `launch` returning `Effect.succeed(result).pipe(Effect.delay(...))` per config
  - `makeFailingListLayer(error)` — for the Error story (`list` returns `Effect.fail(LibraryError)`)
  - `loadingForeverLayer` — module constant; `list` and `launch` both return `Effect.never`. Used as the default for `libraryLayerAtom`.
- `library-atoms.ts` exports:
  - `libraryLayerAtom = Atom.make(loadingForeverLayer)` — writable, holds the current Layer
  - `libraryRuntime = Atom.runtime((get) => get(libraryLayerAtom))` — derives a runtime from the current layer atom
  - `libraryItemsAtom = libraryRuntime.atom(Effect.gen(function*() { const lib = yield* Library; return yield* lib.list() }))` — `Result<readonly GameRecord[]>`
  - `launchAtom = libraryRuntime.fn((id: string) => Effect.gen(function*() { const lib = yield* Library; return yield* lib.launch(id) }))` — `Atom.fn` taking an id

**Patterns to follow:**
- Existing service definitions: `korri/shared/gates/middleware.ts` (`Context.Tag` class form)
- Existing in-memory test helpers: `tools/testing/library/with-temp-library.ts` (configurable real implementation pattern)
- Existing fake-target: `tools/testing/fake-game.sh` (configurable behavior, not stubs)

**Test scenarios:**
- Happy path: in-memory layer with seed games + `launch: { kind: "succeed" }`. Run `Effect.gen(function*() { const lib = yield* Library; return yield* lib.list() }).pipe(Effect.provide(layer))` via `Effect.runPromise`. Assert returned games match the seed array element-wise.
- Happy path: same layer config. Run `lib.launch("crystalline-drift")` via `Effect.runPromise`. Assert result is `{ status: "launched" }`. Verify the configured `delayMs` actually elapses (timestamp before/after).
- Error path: layer with `launch: { kind: "fail", exitCode: 7 }`. Run `lib.launch(any-id)`. Assert result is `{ status: "failed", exitCode: 7 }`.
- Error path: `makeFailingListLayer(new LibraryError({ reason: "io" }))`. Run `lib.list()`. Assert the effect fails with that exact `LibraryError`.
- Edge case: `loadingForeverLayer` — running `lib.list()` with `Effect.runPromise` should never resolve; assert by racing against `Effect.timeout("100 millis")` and confirming the timeout wins.

**Verification:**
- `bun test tools/spike-effect-atoms/library-layer-memory.test.ts` reports all 5 scenarios green.
- TypeScript types check: `Library`, `GameRecord`, `LaunchResult`, layer constructors all infer/export the expected shapes.

---

- [ ] **Unit 3: Build the `LibraryList` component**

**Goal:** Build a small React component that consumes the atoms via `useAtomValue` / `useAtomSet` and renders the four states through `Result.builder`.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 2.

**Files:**
- Create: `tools/spike-effect-atoms/LibraryList.tsx`

**Approach:**
- Component reads `useAtomValue(libraryItemsAtom)` → `Result<readonly GameRecord[]>`.
- Component reads `useAtomSet(launchAtom, { mode: "promiseExit" })` for the launch handler — falls back to plain `useAtomSet(launchAtom)` if the `mode` option doesn't apply at this version (see Open Questions / Deferred).
- A small piece of local React state tracks the most recent launch attempt's outcome to render the failure banner — either:
  - subscribe to a separate `Result`-typed atom that mirrors the launch state, OR
  - track success/failure inline via the promise returned by the `launch` setter
  - Choice deferred to implementation; prefer the cleanest expression.
- Body returns `Result.builder(items).onInitial(...).onFailure(...).onSuccess(...).render()`.
- Visual: minimal Tailwind classes (e.g., centered list, simple `<button>` per game, an error banner div with red text). No design polish — distinguishable states only.

**Patterns to follow:**
- `@effect-atom/atom-react` README "Working with Effects" + "Working with sets of Atoms" sections for `useAtomValue` + `Result.builder` shape.
- `korri/shared/themes/shift/molecules/ShiftLaunchFailureBanner.tsx` for the rough shape of a failure banner (do not import — reproduce minimally to keep the spike isolated).

**Test scenarios:**
- Test expectation: visual-only — verification happens via the four Storybook stories in Unit 4. A unit test of the component would either mock atoms (forbidden by the spike's posture) or duplicate Unit 4's coverage. The story-level scenarios in Unit 4 are the test.

**Verification:**
- TypeScript types check.
- Component imports cleanly when included in `LibraryList.stories.tsx` (Unit 4).

---

- [ ] **Unit 4: Storybook stories with layer-swap decorator**

**Goal:** Demonstrate the four lifecycle states in Storybook, each driven by a real `Library` layer with configured behavior. Network tab must show zero requests.

**Requirements:** R1, R2, R3, R5

**Dependencies:** Unit 3.

**Files:**
- Create: `tools/spike-effect-atoms/LibraryList.stories.tsx`

**Approach:**
- Define a `withLayer(layer: Layer.Layer<Library>): Decorator` helper that calls `useAtomSet(libraryLayerAtom)` inside `useLayoutEffect` to swap the layer before paint.
- Four stories, each with its own layer:
  - `Default` — `makeInMemoryLibraryLayer({ games: SEED_GAMES, launch: { kind: "succeed", delayMs: 200 } })`
  - `FailedLaunch` — `makeInMemoryLibraryLayer({ games: SEED_GAMES, launch: { kind: "fail", exitCode: 1, delayMs: 200 } })`
  - `Loading` — `loadingForeverLayer` (or equivalently, no swap — the default already loading-forever)
  - `Error` — `makeFailingListLayer(new LibraryError({ reason: "io" }))`
- Use `SEED_GAMES` from `@shared/fixtures/games/games` (per Decisions).
- Title: `Spike/Library Atoms/LibraryList` so the spike is grouped clearly in the Storybook sidebar.

**Patterns to follow:**
- `korri/deploy/storybook/preview.tsx` `withColorMode` decorator shape.
- `korri/shared/themes/shift/pages/ShiftHomePage.stories.tsx` viewport configuration (lift `parameters.viewport` block; not strictly necessary for the spike but nice to have).

**Test scenarios:**
- Story scenario: `Default` — story renders. Three game tile buttons visible with seed names. Clicking any tile shows brief "launching" indicator (~200ms) then settles. Network tab shows zero requests.
- Story scenario: `FailedLaunch` — story renders three game tiles. Clicking any tile shows brief "launching" indicator, then a failure banner appears with "exit code 1". Network tab shows zero requests.
- Story scenario: `Loading` — story renders the loading visual. No game tiles visible. Network tab shows zero requests. State persists indefinitely.
- Story scenario: `Error` — story renders the error visual (whatever `Result.builder.onFailure` produces). Network tab shows zero requests.
- Integration scenario: in `Default` story, after clicking a tile and seeing it settle, clicking again triggers a fresh launching state — i.e., the launch atom's state machine resets correctly, not stuck in "launched".

**Verification:**
- `just dev-storybook` opens, `Spike/Library Atoms/LibraryList` is in the sidebar.
- All four stories load. Open browser DevTools network tab on each — zero RPC or fetch requests originating from the component.
- The integration scenario above passes by manual click-test.
- Captured screenshots / observations of each state are noted (informally) for the findings doc.

---

- [ ] **Unit 5 (optional): Capture findings and recommend next step**

**Goal:** After Units 1–4 are done and the stories work, write a short note that captures what was learned and recommends one of: (a) plan the full v4 migration, (b) keep v3 atoms and migrate components to atoms now, (c) reject atoms and pick a different pattern.

**Requirements:** R6

**Dependencies:** Units 1–4 verified.

**Files:**
- Create: `docs/solutions/best-practices/effect-atoms-spike-findings-2026-05-03.md` — short note (1–2 pages max) using the knowledge-track template per `~/.pi/agent/skills/ce-compound/references/schema.yaml`. Captures: what worked, what surprised us, ergonomics of `Result.builder`, ergonomics of layer-swap-via-atom, bundle-size impression (qualitative — "feels light" / "feels heavy"), recommended next step.

**Approach:**
- Knowledge-track frontmatter: `problem_type: best_practice`, `component: testing_framework` or `tooling`, `severity: medium`.
- Sections: Context, Guidance, Why This Matters, When to Apply, Examples (short — link to spike files).
- Explicit recommendation paragraph at the end naming one next step.
- Cross-reference: link to `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` (this spike honors that posture).

**Test scenarios:**
- Test expectation: none -- pure documentation.

**Verification:**
- The findings doc explicitly answers: "do we proceed with atoms?" with one of three named outcomes.
- The spike folder + the findings doc are committed together so the artifact and the conclusion travel as a unit.

## System-Wide Impact

- **Interaction graph:** None — the spike imports nothing from production code beyond `@shared/fixtures/games/games` (read-only, type-stable). No production module imports the spike.
- **Error propagation:** `LibraryError` is a Schema-tagged error inside the spike namespace. Does not pollute the existing error union in `korri/shared/api/rpc/errors.ts`.
- **State lifecycle risks:** Module-level atoms in `library-atoms.ts` are global to the Storybook iframe. Multi-story-per-iframe (Storybook autodocs mode) would share state. Mitigation: don't enable autodocs for the spike stories (Storybook 8 default is stories-only, so fine).
- **API surface parity:** N/A — no public API.
- **Integration coverage:** Unit 4 stories *are* the integration coverage. They exercise the full atom→runtime→layer→service→component→Result.builder chain end-to-end with no mocks.
- **Unchanged invariants:**
  - Existing `useRpcQuery`, `runRpc`, `useGameLaunch` paths untouched. All 652 existing tests pass unchanged.
  - Existing Storybook stories for `Themes/Shift/*` continue to work — only the `stories` glob is extended, not narrowed.
  - Existing `package.json` deps untouched. One new dep added; no upgrades.
  - `effect@3.20`, `@effect/platform@0.95`, `@effect/rpc@0.74` remain at their current versions.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `useAtomSet(layerAtom)` swap inside a `useLayoutEffect` causes a one-frame flash of the wrong state on first paint. | `libraryLayerAtom` defaults to `loadingForeverLayer`. Any first-frame paint shows the loading state — never garbage data, never an Error visual. Visually indistinguishable from a deliberate loading state. |
| `Atom.runtime((get) => get(layerAtom))` does not actually rebuild downstream atoms when the layer atom changes. | Source review (`packages/atom/src/Atom.ts:625-720`) shows the runtime atom internally creates a `readable` derived atom that reactively rebuilds. If implementation reveals this doesn't work as expected, fallback options are (a) `Atom.family` keyed by a profile string, or (b) one runtime atom per story file. Both are minor refactors of `library-atoms.ts` only. |
| `useAtomSet(launchAtom, { mode: "promiseExit" })` mode option has changed since the README was written. | Fallback: use plain `useAtomSet(launchAtom)` and read the launch result from a separate atom subscription. README example is from a recent commit on the main branch, so likely still accurate at 0.5.0; verify at implementation time. |
| Storybook autodocs renders multiple stories simultaneously and they fight over `libraryLayerAtom`. | Storybook 8 default is stories-only mode (no autodocs unless explicitly enabled). The spike stories file does not enable autodocs. Document as a known limitation in Unit 5 findings. |
| Spike is judged a success but never reverted, leaving `tools/spike-effect-atoms/` and the `@effect-atom/atom-react` dep in the repo indefinitely. | If the spike succeeds, the follow-up plan (full v4 migration) explicitly subsumes the spike — at the end of that plan, `tools/spike-effect-atoms/` is deleted as part of normalization. If the spike is rejected, `git revert` of the spike commits cleans up. Either way, the spike is not a permanent artifact. |
| Adding `@effect-atom/atom-react` to `package.json` `dependencies` (rather than `devDependencies`) bloats the production bundle even after revert if a transient feature lands accidentally. | `@effect-atom/atom-react` is only imported from spike files under `tools/spike-effect-atoms/`, which Vite/Bun production build does not bundle (production entry is `korri/deploy/portal/main.tsx`). Tree-shaking removes the unused dep from the production bundle. Verify with one quick `bun run build-web && du -sh out/build/portal/` post-Unit-1, expect no meaningful size delta. If it does land in the bundle, move dep to `devDependencies` (technically incorrect since it has runtime hooks, but acceptable for spike). |

## Documentation / Operational Notes

- **Reverting the spike:** `git revert <range-of-commits>` cleans `tools/spike-effect-atoms/`, the `package.json` dep, and the Storybook glob extension in one operation. No production code touched, so no rollback procedure beyond git.
- **Promoting the spike:** If findings recommend adoption, the next plan (separate, larger) covers Effect v4 migration, replacement of `runRpc` / `useRpcQuery`, and atom-driven re-implementation of `ShiftHomePage`. The spike folder is deleted as part of that work.
- **No production observability impact:** spike code is not loaded in any production entry point.

## Sources & References

- **Origin:** in-conversation brainstorm, 2026-05-03 (no requirements doc — captured here under Problem Frame).
- **Related code:**
  - `korri/shared/library/library-source.ts`
  - `korri/shared/library/launcher.ts`
  - `korri/shared/fixtures/games/games.ts`
  - `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx`
  - `korri/deploy/storybook/main.ts`
  - `korri/shared/gates/middleware.ts` (existing `Context.Tag` class-form pattern)
- **Related learnings:**
  - `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
  - `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md`
- **External:**
  - https://github.com/tim-smart/effect-atom (atom-react v3 source + README)
  - https://effect.website/blog/releases/effect/40-beta (v4 announcement, recommends v3 for production until LTS)
  - https://github.com/Effect-TS/effect-smol (v4 migration guide; same atom shape at `effect/unstable/reactivity`)
