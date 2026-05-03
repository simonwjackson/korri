# Style Guide

How code looks and reads. Project-agnostic conventions; project-specific overrides live in `AGENTS.md`.

## Formatting

Use Biome (or the equivalent) consistently.

- 2-space indentation.
- Semicolons only as needed.
- Double quotes.
- No trailing whitespace.
- Keep files small and purpose-specific.

## Naming

| Thing | Convention | Example |
|---|---|---|
| React component | `PascalCase.tsx` | `WelcomeCard.tsx` |
| Hook | `useFoo.ts` / `useFoo.tsx` | `useWelcomeData.ts` |
| Effect Service | `Context.Service` class, `PascalCase` | `class Library extends Context.Service<...>()("Library") {}` |
| Effect Layer | `<Service>Layer<Variant>` | `LibraryLayerLive`, `LibraryLayerInMemory` |
| Atom | `<noun>Atom` | `libraryItemsAtom`, `launchAtom` |
| Test/spec | `*.test.ts` / `*.spec.ts` | `resolver.test.ts` |
| Single-action RPC | `rpc.ts` / `rpc-handler.ts` | `hello/rpc.ts` |
| Multi-action RPC | `<action>.rpc.ts` / `<action>.rpc-handler.ts` | `get.rpc.ts` |

## TypeScript

- Strict mode required.
- Avoid `any`.
- Explicit types at module boundaries.
- Effect Schema as the source of truth for wire payloads, responses, and typed errors.
- Choose clear names over clever abstractions.

## Imports

- Prefer relative imports inside a small local area.
- `import type` for type-only imports.
- Follow alias and module-boundary rules in `standards.md`.

## Component architecture

- One component per file.
- Compounds are prefixed with the widget name (`AppShellHeader`, not `Header`).
- The Root lives at the widget root, not in `components/`.
- Only the Root creates state and renders the Provider; every other compound reads via the widget's hook.
- No boolean prop forests. Compose distinct trees per use case rather than toggling shared subtrees with flags.
- Atoms read state from context (or atoms), not from props drilled through every parent.
- One state owner per Root. Lift the Root when siblings need shared state; do not duplicate.
- No barrel exports.

## Branching on async state

- Prefer a domain ADT plus self-selecting state components over inline control flow.
- Convert raw async primitives once: `Result -> FeatureState`, `Exit -> CommandState`, RPC payload -> view model.
- Status (`Loading | Ready | LoadError | Defect | Empty`) is part of the contract, not a boolean check scattered across components.
- Loading, error, empty, and ready are different views of the same data, not different data flows.
- `Result.builder` and `Result.match*` are useful in pure adapters, but avoid fluent builder chains in JSX.
- Avoid render props for state branching. Prefer compound children that read state from context/atoms and self-select.

## Effect-flavored React

- Service: `Context.Service<Self, Shape>()("ID")`.
- Layer: `Layer.effect(Service, makeEffect)` for live; `Layer.succeed(Service, value)` for in-memory.
- Runtime: `Atom.runtime((get) => get(layerAtom))` so the layer is swappable per harness.
- Read: `useAtomValue(resultAtom)`, then adapt the result into a domain ADT before rendering.
- Write: `useAtomSet(fnAtom, { mode: "promiseExit" })`, then adapt the exit into a command ADT.
- Render: compose state-specific components (`<FeatureLoading />`, `<FeatureError />`, `<FeatureReady />`) under a state provider.

## Functional state component pattern

Use this shape for behavior-bearing React state:

```tsx
<LibraryListStateRoot result={items}>
  <LibraryListLoading />
  <LibraryListLoadError onRetry={refreshItems} />
  <LibraryListDefect />
  <LibraryListReady launch={launch} />
</LibraryListStateRoot>
```

Under the hood:

```ts
type LibraryListState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly games: readonly GameRecord[] }
  | { readonly _tag: "LoadError"; readonly error: LibraryError }
  | { readonly _tag: "Defect"; readonly defect: unknown }

const LibraryListState = {
  fromResult: (result: Result.Result<readonly GameRecord[], LibraryError>) =>
    Result.matchWithWaiting(result, {
      onWaiting: () => ({ _tag: "Loading" }),
      onError: error => ({ _tag: "LoadError", error }),
      onDefect: defect => ({ _tag: "Defect", defect }),
      onSuccess: success => ({ _tag: "Ready", games: success.value }),
    }),

  select:
    <Tag extends LibraryListState["_tag"]>(tag: Tag) =>
    (state: LibraryListState) =>
      state._tag === tag ? Option.some(state) : Option.none(),
}
```

State components consume selected cases:

```tsx
function LibraryListReady() {
  const ready = useLibraryListCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => <LibraryListReadyView games={games} />,
  })
}
```

Guidelines:

- The Root/provider converts raw runtime state into the ADT.
- ADT conversion and selectors are pure and unit-tested.
- Components do not inspect raw `Result` / `Exit` values.
- Success views receive already-valid case data.
- Keep this domain-specific first; do not introduce a generic result-boundary framework until multiple features force it.

## Real-implementation conventions

- Test and harness doubles are real implementations with a `behavior` or `config` argument:

  ```ts
  createInMemoryLauncher({ kind: "fail", exitCode: 1 })
  ```

- Configurable knobs: outcome, delay, error type, seed data.
- Doubles live alongside the real implementations they share an interface with — not in a `__mocks__` or `fakes/` folder.
- `Mock*` / `Stub*` / `Fake*` prefixes are forbidden, even in tests.

## Visual design

- Use design tokens — Tailwind theme utilities and CSS theme variables — for type, spacing, color, and radius. Hardcoded values (`font-size: 14px`, `#1B1714`) require an inline comment explaining why no token fits, and are an invitation to add a missing token.
- Theme tokens for size and spacing are fluid by default — `clamp(min, fluid, max)` calibrated to read sensibly from a small handheld through a TV. Static pixel values in the theme are reserved for things that genuinely should not scale (e.g., 1px hairlines).
- Components respond to their **container**, not the viewport. Use container query units (`cqi`, `cqh`, `cqw`) and `@container` queries; declare `container-type: inline-size` (or `size`) on the appropriate ancestor. Reserve `@media` and viewport units for page-frame layout decisions where the layout itself fundamentally rearranges.
- Grids add cells when space allows: `grid-template-columns: repeat(auto-fit, minmax(MIN, 1fr))` or equivalent. Do not scale a fixed column count up. Designs should look denser on a TV, not zoomed in.
- Inline `style={{ … }}` and raw values in scoped `<style>` blocks bypass theme constraints. Prefer Tailwind utilities or theme-variable references; reach for inline values only when no theme token applies.

## Comments

- Comment the why, not the obvious what.
- Keep comments current or delete them.
- Doc comments are sparing and must add real value.
