# U4: Setting atoms from outside React in `@effect/atom-react`

**Versions in this repo:**
- `@effect/atom-react@4.0.0-beta.60`
- `effect@4.0.0-beta.60` (atoms live at `effect/unstable/reactivity/*`)

Source inspected directly under `node_modules/`:
- `node_modules/@effect/atom-react/dist/{RegistryContext.d.ts,RegistryContext.js,Hooks.d.ts,index.d.ts}`
- `node_modules/effect/dist/unstable/reactivity/{AtomRegistry.d.ts,Atom.d.ts}`

Project surfaces involved:
- `korri/shared/library/library-atoms.ts` — `librarySourceLayerAtom`, `launcherLayerAtom`, `libraryRuntime`
- `korri/products/app/features/home/HomeServerRoot.tsx` — the `useLayoutEffect` we are removing
- `korri/deploy/portal/main.tsx` — composition root

---

## 1. Canonical way to set an atom from outside React

The runtime primitive is **`AtomRegistry`** (from `effect/unstable/reactivity/AtomRegistry`). It is a plain object with a stable, well-typed surface — none of it is React-aware:

```ts
interface AtomRegistry {
  readonly get:     <A>(atom: Atom<A>) => A
  readonly set:     <R, W>(atom: Writable<R, W>, value: W) => void
  readonly update:  <R, W>(atom: Writable<R, W>, f: (_: R) => W) => void
  readonly modify:  ...
  readonly mount:   <A>(atom: Atom<A>) => () => void
  readonly refresh: <A>(atom: Atom<A>) => void
  readonly subscribe: <A>(atom, f, opts?) => () => void
  readonly reset:   () => void
  readonly dispose: () => void
  // ...
}
```

Constructors / layers:
```ts
AtomRegistry.make(options?: {
  readonly initialValues?: Iterable<readonly [Atom<any>, any]>
  readonly scheduleTask?: (f: () => void) => () => void
  readonly timeoutResolution?: number
  readonly defaultIdleTTL?: number
}): AtomRegistry

AtomRegistry.layer:        Layer.Layer<AtomRegistry>
AtomRegistry.layerOptions: (opts) => Layer.Layer<AtomRegistry>
AtomRegistry.AtomRegistry: Context.Service<AtomRegistry, AtomRegistry>
```

There is also a curried Effect-flavored form in `effect/unstable/reactivity/Atom`:
```ts
Atom.set:    <R, W>(atom: Writable<R, W>, value: W) => Effect.Effect<void, never, AtomRegistry>
Atom.update: <R, W>(atom: Writable<R, W>, f: (_: R) => W) => Effect.Effect<void, never, AtomRegistry>
Atom.mount:  <A>(atom: Atom<A>) => Effect.Effect<void, never, AtomRegistry | Scope.Scope>
```

So from plain TS (no JSX, no hooks), once you have a registry you call **`registry.set(atom, value)`** (sync, void). From an Effect, you `yield* Atom.set(atom, value)` with `AtomRegistry` in context.

---

## 2. Are atoms global singletons?

**Atoms are not singletons. The `AtomRegistry` is.** Atoms are inert descriptors (they only hold a `read`/`write` recipe and metadata). All actual state, computation, and subscriptions live in an `AtomRegistry` — the same atom in two registries holds two independent values.

How a registry is obtained in normal React usage (from `RegistryContext.js`):

```ts
// node_modules/@effect/atom-react/dist/RegistryContext.js
export const RegistryContext = React.createContext(
  AtomRegistry.make({ scheduleTask, defaultIdleTTL: 400 }),
)

export const RegistryProvider = (options) => {
  const ref = React.useRef(null)
  if (ref.current === null) {
    ref.current = {
      registry: AtomRegistry.make({
        scheduleTask: options.scheduleTask ?? scheduleTask,
        initialValues: options.initialValues,
        timeoutResolution: options.timeoutResolution,
        defaultIdleTTL: options.defaultIdleTTL,
      }),
    }
  }
  // ...dispose on unmount with a 500ms grace timer...
  return <RegistryContext.Provider value={ref.current.registry}>{children}</RegistryContext.Provider>
}
```

Two ways the registry can be reached:
1. **Default context value.** `RegistryContext = React.createContext(AtomRegistry.make({...}))`. If no `RegistryProvider` is mounted, every `useAtomValue`/`useAtomSet` call in the tree reads this **module-level default registry**, created when `@effect/atom-react` is first imported. There is no public export that returns this default registry directly.
2. **`<RegistryProvider initialValues={...}>`** (or your own `<RegistryContext.Provider value={registry}>`). The provider creates a registry in a ref on first render and pins it for the tree's lifetime.

Today the portal does **not** render `RegistryProvider`, so the whole app reads the default singleton.

---

## 3. Set-before-mount: does the tree see it?

Yes, **as long as the React tree reads from the same registry instance you wrote to.** The atom subsystem is fully imperative under the hood — `useAtomValue` calls `registry.get(atom)` (and subscribes), so a value present in the registry before the first `get` is just returned.

Gotchas to commit to in the plan:

- **Registry identity is the only real constraint.** If you create your own `AtomRegistry.make(...)` at boot, you must hand the same instance to the React tree via `<RegistryContext.Provider value={registry}>` (or use `<RegistryProvider initialValues={...}>`, which creates the registry itself). Writing to a registry that the tree never sees is a silent no-op.
- **Default-registry trick is fragile.** Calling `registry.set` on the module-level default registry from `main.tsx` would work in principle, but `@effect/atom-react` does not export that registry — you would have to reach for `RegistryContext._currentValue` / a re-`createContext` shim. Don't do this; render a `RegistryProvider`/`RegistryContext.Provider` instead.
- **`Atom.make(initialValue)` returns a `Writable<A>`** (see `Atom.d.ts:make` overloads). It does not auto-evaluate; the first `registry.get` materializes it. Pre-seeding with `initialValues` or `registry.set` before mount avoids ever observing the dummy initial layer (`loadingForeverLibrarySourceLayer`) during the first render.
- **`Atom.runtime(get => ...)` reads its layer atoms lazily on first dependent access.** The `libraryRuntime` in `library-atoms.ts` does not capture the layers at module load — it re-reads them on each evaluation, so seeding the source/launcher atoms before any consumer of `libraryRuntime.atom(...)` mounts is sufficient. No registry-cache invalidation is required.
- **`RegistryProvider` disposes its registry on unmount** (500ms grace, then `registry.dispose()`). For a top-level provider that lives for the whole document this is a non-issue, but be aware before wrapping a registry around a sub-tree that can unmount.
- **Strict-mode double mount is fine** because the registry is held in a `useRef` and only created once; the existing `useLayoutEffect` pattern is double-fired today, which is one of the reasons to move setup out.

---

## 4. Is "atom-holding-a-Layer" the right shape?

It is one valid shape — the project already uses it:

```ts
// korri/shared/library/library-atoms.ts
export const librarySourceLayerAtom = Atom.make(loadingForeverLibrarySourceLayer)
export const launcherLayerAtom      = Atom.make(makeInMemoryLauncherLayer({ behavior: { kind: "succeed" } }))
export const libraryRuntime = Atom.runtime(get =>
  Layer.merge(get(librarySourceLayerAtom), get(launcherLayerAtom)),
)
```

That pattern is **idiomatic when the layer is meant to be swappable at runtime** — Storybook stories and the dual-screen test override the layer via `useAtomSet` (see `ShiftHomePage.stories.tsx:135-136`, `DualScreenRouteRoot.test.tsx:53-54`, `use-library-launch-controller.test.tsx:28-29`). That swap seam is the harness/test entry point the lattice conventions describe, and it should stay.

The closest "no atom" alternative is to pass a `Layer` directly into `Atom.runtime(layer)` (the `RuntimeFactory` overload accepts either `Layer` or `(get) => Layer`). That removes the dynamic seam entirely and is appropriate only when the layer is fixed at module load — which it isn't here, because Storybook/tests must override it.

**Recommendation:** keep the atoms-of-layers shape. The refactor is not about replacing that pattern; it is about **who writes to those atoms, and when**. Today it is `HomeServerRoot` via `useLayoutEffect` (renderer-side, after first mount). It should be the composition root, before the React tree mounts.

---

## 5. Idiomatic "select-one-layer-at-boot" pattern

For "choose at boot, never change", the cleanest pattern given the existing atoms-of-layers shape is **seed via `RegistryProvider.initialValues`**. The provider builds the registry itself and pre-populates it before any child renders:

```tsx
// korri/deploy/portal/main.tsx (shape, not literal code)
import { RegistryProvider } from "@effect/atom-react"
import { launcherLayerAtom, librarySourceLayerAtom } from "@shared/library/library-atoms"
import { LibrarySourceLayerRpc } from "@app/features/home/library-source-layer-rpc"
import { LauncherLayerBridge } from "@app/features/home/launcher-layer-bridge"

const initialValues = [
  [librarySourceLayerAtom, LibrarySourceLayerRpc],
  [launcherLayerAtom,      LauncherLayerBridge],
] as const

ReactDOM.createRoot(rootElement).render(
  <RegistryProvider initialValues={initialValues}>
    <RouterProvider router={router} />
  </RegistryProvider>,
)
```

Why this and not the alternatives:

- **`<RegistryProvider initialValues={...}>`** runs synchronously inside the provider's render before its children render. The values exist in the registry before any `useAtomValue` ever fires, so the dummy `loadingForeverLibrarySourceLayer` is never observed and `HomeServerRoot` collapses to nothing (no flag, no `useLayoutEffect`, no `null` first paint).
- **`AtomRegistry.make({ initialValues })` + custom `<RegistryContext.Provider value={r}>`** is functionally equivalent and gives you the registry handle to use from non-React code (workers, IPC). Reach for it only if you actually need that handle; otherwise `RegistryProvider` is the smaller surface.
- **`registry.set(atom, value)` from main.tsx** works but only if you also own the registry (see above). It is the right tool if the runtime-config flag is resolved asynchronously (e.g. waiting on `window.__korriRuntime`) — create the registry, render the provider, then `registry.set` once the config arrives. For "config is known synchronously at boot", `initialValues` is simpler.
- **`Layer.unwrapEffect` / a derived atom** is overkill here. It buys you a way to express "the chosen layer is itself an Effect-computed value", which you do not need: by the time `main.tsx` runs, both candidate layers are concrete `Layer` values.

If layer selection needs to read `window.__korriRuntime` or another runtime flag, the natural shape is:

```ts
const layers = selectLayersFromRuntimeConfig(getInitialRuntimeConfig())
const initialValues = [
  [librarySourceLayerAtom, layers.source],
  [launcherLayerAtom,      layers.launcher],
] as const
```

Pure function `selectLayersFromRuntimeConfig` belongs next to `getInitialRuntimeConfig` in `main.tsx` (or one helper module beside it). It returns concrete `Layer` values, not atoms or effects — keep the seam thin.

---

## Recommended approach (commit this in the plan)

1. **Delete `HomeServerRoot`'s `useLayoutEffect` and `layersReady` flag.** The component becomes a pass-through (or just inline `{children}` at the call sites — see `routes/+index.tsx`, `routes/+screen.tsx`). Storybook/test override paths via `useAtomSet` are untouched because they run inside their own provider scopes anyway.
2. **In `korri/deploy/portal/main.tsx`,** before `ReactDOM.createRoot(...).render(...)`:
   - Resolve the layer choice synchronously from runtime config (pure function).
   - Build `initialValues: ReadonlyArray<readonly [Atom<any>, any]>` referencing `librarySourceLayerAtom` and `launcherLayerAtom`.
   - Wrap the existing `<RouterProvider />` in `<RegistryProvider initialValues={initialValues}>`.
3. **Leave `library-atoms.ts` shape unchanged** — atoms-of-layers is still the harness seam Storybook and tests rely on. The only behavioural change is that production seeds them at boot instead of in a layout effect.
4. **If a deferred (post-mount) override is ever needed** (e.g. runtime config arrives async from the desktop bridge), reach for `registry.set` against a registry you constructed yourself (`AtomRegistry.make({ initialValues })` + `<RegistryContext.Provider value={registry}>`), keeping the registry handle in module scope. Not needed for the current refactor.

### Concrete API names to write into the plan

| Need | API |
|---|---|
| Build a registry with seeded values | `AtomRegistry.make({ initialValues, scheduleTask?, defaultIdleTTL?, timeoutResolution? })` |
| React provider that does both for you | `<RegistryProvider initialValues={[[atom, value], ...]}>` from `@effect/atom-react` |
| Bring-your-own-registry provider | `<RegistryContext.Provider value={registry}>` from `@effect/atom-react` |
| Imperative set from non-React code | `registry.set(atom, value)` / `registry.update(atom, f)` / `registry.modify(atom, f)` |
| Effect-flavored set (needs `AtomRegistry` in context) | `Atom.set(atom, value)` / `Atom.update(atom, f)` from `effect/unstable/reactivity/Atom` |
| Read once from non-React code | `registry.get(atom)` |
| Subscribe from non-React code | `registry.subscribe(atom, listener, { immediate? })` |
| The default singleton registry exposed by the package | **not publicly exported** — do not rely on it; render a provider |

### Gotchas to mention in the plan

- Registry identity is load-bearing. Whatever code writes to the atoms must hold the same `AtomRegistry` the React tree reads from. The simplest way to guarantee this is `<RegistryProvider initialValues={...}>`.
- `initialValues` are seeded synchronously during the provider's render, *before* children render. This is the exact ordering guarantee that lets us delete the `useLayoutEffect`.
- `Atom.runtime(get => Layer.merge(get(a), get(b)))` reads its inputs lazily, so seeding upstream atoms before first consumer access is sufficient — no manual cache invalidation, no atom-graph reset.
- `RegistryProvider` disposes its registry on unmount (500ms grace). Fine for a document-root provider; surprising if wrapped around a subtree.
- The module-level `RegistryContext` default is *not* exported; do not try to write to it from `main.tsx`.
- Strict-mode double mount: irrelevant for `RegistryProvider` (registry is ref-pinned). It is one of the reasons the current `useLayoutEffect` is a smell.

### References

- `node_modules/@effect/atom-react/dist/RegistryContext.d.ts`
- `node_modules/@effect/atom-react/dist/RegistryContext.js` (implementation showing `initialValues` plumbing and ref-pinned registry)
- `node_modules/@effect/atom-react/dist/Hooks.d.ts` (`useAtomValue`, `useAtomSet`, `useAtomInitialValues`)
- `node_modules/effect/dist/unstable/reactivity/AtomRegistry.d.ts` (the `AtomRegistry` interface, `make`, `layer`, `layerOptions`)
- `node_modules/effect/dist/unstable/reactivity/Atom.d.ts` (`Atom.make`, `Atom.runtime`, `Atom.set`, `Atom.update`, `RuntimeFactory`)
- Project sites: `korri/shared/library/library-atoms.ts`, `korri/products/app/features/home/HomeServerRoot.tsx`, `korri/deploy/portal/main.tsx`
