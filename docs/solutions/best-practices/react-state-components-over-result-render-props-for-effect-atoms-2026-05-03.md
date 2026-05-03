---
title: React state components over Result render props for Effect atoms
date: 2026-05-03
category: best-practices
module: korri/frontend-runtime + react-component-architecture
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Building React components on top of Effect atoms or Result-shaped async state
  - A fluent Result.builder chain makes JSX feel imperative or render-prop-like
  - You want Storybook states driven by real Effect layers without mocking transport
  - Async state needs both React composition and pure FP testability
related_components:
  - testing_framework
  - development_workflow
tags:
  - react
  - effect
  - atoms
  - result
  - adt
  - composition
  - storybook
---

# React state components over Result render props for Effect atoms

## Context

The Effect atoms spike started with the technically correct shape: `libraryItemsAtom` returned a `Result`, `LibraryList` consumed it with `useAtomValue`, and JSX branched with `Result.builder(...)`. That validated the atom runtime path, but the component still read like control flow embedded in React:

```tsx
{Result.builder(items)
  .onInitialOrWaiting(() => <LibraryListLoading />)
  .onError(error => <LibraryListError error={error} />)
  .onSuccess(games => <LibraryListReady games={games} />)
  .render()}
```

The problem was not `Result` itself. The problem was letting raw async primitives drive the JSX shape. It felt too close to render props: success/error/loading branches were passed into a controller instead of appearing as ordinary React composition.

The spike settled on a better separation:

1. Effect atoms produce `Result` values.
2. Pure FP adapters convert `Result` / `Exit` into domain ADTs.
3. A small React Root provides the ADT through context.
4. State-specific child components self-select their case with `Option`.
5. Views receive already-valid case data.

## Guidance

Use **React composition at the boundary** and **FP state algebra underneath**.

### 1. Convert infrastructure state into a domain ADT

Do not make components pattern-match `Result.Result<readonly GameRecord[], LibraryError>` directly. Convert it once into a UI-domain state:

```ts
type LibraryListState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly games: readonly GameRecord[] }
  | { readonly _tag: "LoadError"; readonly error: LibraryError }
  | { readonly _tag: "Defect"; readonly defect: unknown }

const LibraryListState = {
  fromResult: (
    result: Result.Result<readonly GameRecord[], LibraryError>,
  ): LibraryListState =>
    Result.matchWithWaiting(result, {
      onWaiting: () => ({ _tag: "Loading" }),
      onError: error => ({ _tag: "LoadError", error }),
      onDefect: defect => ({ _tag: "Defect", defect }),
      onSuccess: success => ({ _tag: "Ready", games: success.value }),
    }),
}
```

The ADT is the contract the UI actually understands. `Result` remains the atom/runtime contract.

### 2. Add typed selectors that return `Option`

Each state component should be able to ask for the case it knows how to render:

```ts
const LibraryListState = {
  // ...fromResult

  select:
    <Tag extends LibraryListState["_tag"]>(tag: Tag) =>
    (
      state: LibraryListState,
    ): Option.Option<Extract<LibraryListState, { readonly _tag: Tag }>> =>
      state._tag === tag
        ? Option.some(
            state as Extract<LibraryListState, { readonly _tag: Tag }>,
          )
        : Option.none(),
}
```

This keeps branching local, typed, and functional. Components do not need nullable props or `status` plus optional data fields.

### 3. Let React compose state components normally

The top-level component should read like React, not like a state-machine builder:

```tsx
<LibraryListStateRoot result={items}>
  <LibraryListLoading />
  <LibraryListLoadError onRetry={refreshItems} />
  <LibraryListDefect />
  <LibraryListReady launch={launch} />
</LibraryListStateRoot>
```

`LibraryListStateRoot` only converts the result and provides context:

```tsx
function LibraryListStateRoot({ result, children }: Props) {
  const state = LibraryListState.fromResult(result)

  return (
    <LibraryListStateContext.Provider value={state}>
      {children}
    </LibraryListStateContext.Provider>
  )
}
```

This avoids both render props and branch slots such as `ready={<Ready />}`. Children are ordinary components.

### 4. Make each state component self-select

A state-specific component asks for its case, then `Option.match` decides whether it renders:

```tsx
function LibraryListReady({ launch }: { readonly launch: LaunchController }) {
  const ready = useLibraryListCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => (
      <LibraryListReadyView games={games} launch={launch} />
    ),
  })
}
```

The view gets data that is valid by construction:

```tsx
function LibraryListReadyView({ games, launch }: Props) {
  return games.map(game => (
    <button key={game.id} type="button" onClick={() => launch.start(game)}>
      {getGameDisplayName(game)}
    </button>
  ))
}
```

### 5. Model mutations as ADTs too

Avoid `launching: boolean`, `lastFailure?: Error`, or `status + optional data` drift. Use a second ADT for the mutation lifecycle:

```ts
type LaunchState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Launching"; readonly gameId: string }
  | { readonly _tag: "Launched"; readonly gameId: string }
  | { readonly _tag: "Failed"; readonly gameId: string; readonly exitCode: number }
  | { readonly _tag: "Defect"; readonly gameId: string; readonly defect: unknown }

const LaunchState = {
  fromExit: (
    gameId: string,
    exit: Exit.Exit<LaunchResult, never>,
  ): LaunchState => {
    if (Exit.isFailure(exit)) {
      return { _tag: "Defect", gameId, defect: Cause.squash(exit.cause) }
    }

    return exit.value.status === "failed"
      ? { _tag: "Failed", gameId, exitCode: exit.value.exitCode }
      : { _tag: "Launched", gameId }
  },
}
```

The hook is just the interpreter around an Effectful command:

```ts
function useLibraryLaunchController(): LaunchController {
  const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
  const [state, setState] = useState<LaunchState>(LaunchState.idle)

  const start = useCallback((game: GameRecord) => {
    setState(LaunchState.launching(game.id))
    void launch(game.id).then(exit => {
      setState(LaunchState.fromExit(game.id, exit))
    })
  }, [launch])

  return useMemo(() => ({ state, start }), [state, start])
}
```

## Why This Matters

**React stays declarative.** The component tree names the visual states as components. Reviewers see the composition immediately instead of decoding a fluent builder chain.

**FP stays testable.** The important state semantics live in pure functions (`fromResult`, `fromExit`, `select`). They can be tested without React, Storybook, atom registries, or browser globals.

**Infrastructure does not leak into views.** `Result` and `Exit` remain at the atom/hook boundary. Views receive `games`, `error`, or `exitCode` only after the ADT has proven that data exists.

**No render-prop pressure.** A generic `<ResultBoundary>{success => ...}</ResultBoundary>` would reintroduce the pattern this avoids. Branch slots (`ready={<Ready />}`) are better but still make the parent pass UI cases into a controller. Self-selecting child components are the most React-shaped version.

**Storybook remains honest.** Stories can swap real Effect layers through an atom, then render the same component tree. No network mocks, no global fetch replacement, no fake providers that only exist for stories.

## When to Apply

- A component consumes an Effect atom, async query atom, or any `Result`-shaped state.
- JSX starts accumulating `Result.builder`, `match`, `switch`, or `if` branches for loading/error/success.
- Success/error/loading states are meaningful visual components worth naming.
- The same state surface needs Storybook stories, unit tests for state semantics, and future production wiring.
- A mutation has more states than “pending or not pending”.

Do **not** extract a generic result framework first. Start with a domain-specific root (`LibraryListStateRoot`), domain-specific ADTs (`LibraryListState`, `LaunchState`), and domain-specific selectors. Generalize only after two or three real components share the same shape.

## Examples

### Before: builder chain in JSX

```tsx
function LibraryList() {
  const items = useAtomValue(libraryItemsAtom)

  return Result.builder(items)
    .onInitialOrWaiting(() => <LibraryListLoading />)
    .onError(error => <LibraryListError error={error} />)
    .onSuccess(games => <LibraryListReady games={games} />)
    .render()
}
```

This is compact, but the component is still written as control flow.

### Better: state root plus self-selecting children

```tsx
function LibraryList() {
  const items = useAtomValue(libraryItemsAtom)
  const refreshItems = useAtomRefresh(libraryItemsAtom)
  const launch = useLibraryLaunchController()

  return (
    <LibraryListStateRoot result={items}>
      <LibraryListLoading />
      <LibraryListLoadError onRetry={refreshItems} />
      <LibraryListDefect />
      <LibraryListReady launch={launch} />
    </LibraryListStateRoot>
  )
}
```

The child component owns its state case:

```tsx
function LibraryListLoadError({ onRetry }: { readonly onRetry: () => void }) {
  const loadError = useLibraryListCase("LoadError")

  return Option.match(loadError, {
    onNone: () => null,
    onSome: ({ error }) => <LibraryListErrorView error={error} onRetry={onRetry} />,
  })
}
```

### Storybook layer swap stays real

The story remains a composition root. It swaps the layer atom, not component internals:

```tsx
export const FailedLaunch: Story = {
  decorators: [
    withLayer(
      makeInMemoryLibraryLayer({
        games: seedGames,
        launch: { kind: "fail", exitCode: 1, delayMs: 200 },
      }),
    ),
  ],
}
```

The component does not know whether it received a loading-forever layer, an in-memory layer, a failing list layer, or a future production layer.

## Related

- `docs/solutions/best-practices/mode-as-composition-for-layout-primitives-2026-05-01.md` — same architectural instinct: choose composition and shared context over mode/branch props.
- `docs/solutions/best-practices/evolving-shared-context-layout-primitives-2026-05-01.md` — guidance for evolving context-based compound primitives without widening the blast radius.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — testing posture that the layer-swapped Storybook stories preserve.
- `docs/solutions/best-practices/per-level-storybook-coverage-for-atomic-themes-2026-05-01.md` — related Storybook discipline for making visual states reviewable.
- `tools/spike-effect-atoms/` — current spike that validated this pattern in place.
