# Framework Documentation Notes — dev-lab Design Tool

> **Generated:** 2026-07-03  
> **Working dir:** `tools/theme-workshop/lab/`  
> **Purpose:** Reference for safely modifying the dev-lab design tool

---

## 1. Version Table

| Package | `package.json` constraint | Resolved (`bun.lock`) |
|---|---|---|
| `effect` | `4.0.0-beta.78` (exact + override) | `4.0.0-beta.78` |
| `@effect/atom-react` | `4.0.0-beta.78` (exact) | `4.0.0-beta.78` |
| `@effect/platform-bun` | `4.0.0-beta.78` (exact) | `4.0.0-beta.78` |
| `react` | `^19.0.0` | 19.x |
| `react-dom` | `^19.0.0` | 19.x |
| `vite` | `^6.1.0` | **`6.4.2`** |
| `@tailwindcss/vite` | `^4.1.7` | **`4.2.4`** |
| `tailwindcss` | `^4.1.7` | **`4.2.4`** |
| `@tanstack/react-router` | `^1.120.3` | **`1.168.26`** |
| `@tanstack/router-plugin` | `^1.120.3` | (dev dep; not used in lab) |
| `@tanstack/history` | (transitive) | `1.161.6` |
| `framer-motion` | `^12.38.0` | 12.x |

**Key observation:** Effect and `@effect/atom-react` are **exact-pinned at beta.78** via both the dependency declaration and the `"overrides"` field in `package.json`. Never float these. A minor bump between beta builds can introduce breaking API changes.

---

## 2. Canonical API Shapes and Patterns

### 2a. The Layer-Atom Swapping Pattern

The core mechanism for changing a mounted surface's data source without remounting. Every surface follows the same three-layer shape:

```ts
// 1. A writable atom holding a Layer<Service> — the "source-layer atom"
//    Default is the fixture / in-memory implementation.
export const catalogFactsSourceLayerAtom = Atom.make(CatalogFactsSource.Fixtures)
//  ^ Atom.make(initialValue: A) → Writable<A>
//    This is MODULE-LEVEL — one instance per JS module, shared across all registries.

// 2. An AtomRuntime that rebuilds whenever the layer atom changes
export const catalogFactsRuntime = Atom.runtime(get => get(catalogFactsSourceLayerAtom))
//  ^ Atom.runtime is a RuntimeFactory (module-level default factory).
//    Calling it with a (get) => Layer function returns an AtomRuntime<R, E>.
//    When catalogFactsSourceLayerAtom changes, the runtime's Effect Context
//    is rebuilt; all atoms derived from it are invalidated.

// 3. Atoms backed by that runtime — what components actually read
export const catalogSnapshotAtom = catalogFactsRuntime.atom(
  get => CatalogFactsSource.pipe(Effect.flatMap(svc => svc.getSnapshot())),
)
//  ^ AtomRuntime.atom(...) returns Atom<AsyncResult<A, E | ER>>
//    The E | ER union means layer errors surface automatically.
```

**Real pattern in `library-atoms.ts` — merging two layer atoms:**
```ts
export const libraryRuntime = Atom.runtime(get =>
  Layer.merge(get(librarySourceLayerAtom), get(launcherLayerAtom)),
)
// Layer.merge (not Layer.mergeAll) for two layers in Effect v4.
```

**How the swap propagates (no remount):**
When a consumer calls `registry.set(catalogFactsSourceLayerAtom, newLayer)` (or `useAtomSet` inside React):

1. `catalogFactsSourceLayerAtom` node is updated in the registry.
2. The registry invalidates all dependent nodes — including `catalogFactsRuntime`.
3. `catalogFactsRuntime` is rebuilt: the Layer `newLayer` is built into a fresh `Context`, replacing the old one.
4. All `runtime.atom(...)` atoms derived from that runtime are invalidated and re-evaluated with the new context.
5. React components subscribed via `useAtomValue` re-render with new data.
6. **Zero component remount.** The React tree stays mounted; only atom values change.

### 2b. `Atom` Constructor Reference

| Constructor | Signature | Returns | Use case |
|---|---|---|---|
| `Atom.make(value)` | `(A) => Writable<A>` | Writable state atom | Layer-holding atom, simple state |
| `Atom.make(readFn)` | `((get) => A) => Atom<A>` | Derived atom | Synchronous derived state |
| `Atom.make(effect)` | `((get) => Effect<A,E>) => Atom<AsyncResult<A,E>>` | Async atom | Service calls |
| `Atom.runtime(fn)` | `((get) => Layer<R,E>) => AtomRuntime<R,E>` | AtomRuntime | Scoped Effect runtime per layer |
| `AtomRuntime.atom(effect)` | `(Effect<A,E,R|...>) => Atom<AsyncResult<A,E\|ER>>` | Service-backed atom | Layer-backed data |
| `Atom.readable(fn)` | `((get) => A) => Atom<A>` | Read-only derived | Explicit read-only |
| `Atom.writable(read, write)` | Both fns | `Writable<R,W>` | Custom write logic |
| `Atom.fn(effect)` | `((arg, get) => Effect) => AtomResultFn<Arg,A,E>` | Command atom | Launch, async commands |
| `Atom.family(fn)` | `(arg) => T` | Memoized atom factory | Per-ID atoms |

### 2c. `@effect/atom-react` Hook Reference

All hooks read from `RegistryContext` — the nearest `RegistryProvider`'s `AtomRegistry`.

```ts
import {
  useAtomValue,      // Read + subscribe
  useAtomSet,        // Mount + write setter
  useAtom,           // Read + write [value, setter]
  useAtomRefresh,    // Mount + returns () => void refresh callback
  useAtomMount,      // Mount without read/write
  useAtomInitialValues, // Seed initial values into current registry (once per atom)
  useAtomSuspense,   // Suspense-integrated AsyncResult read
  useAtomSubscribe,  // Side-effect subscription (not for render)
  RegistryProvider,  // Creates and provides AtomRegistry
  RegistryContext,   // React.Context<AtomRegistry> — for useContext access
} from "@effect/atom-react"
```

**`useAtomValue`:**
```ts
// Basic — subscribes and re-renders on change
const value = useAtomValue(atom)

// With selector — memoizes a derived atom before subscribing
const selected = useAtomValue(atom, (v) => v.someField)
```

**`useAtomSet` — the lab's write hook:**
```ts
// Default mode: synchronous setter; accepts value OR updater fn
const set = useAtomSet(layerAtom)
set(newLayer)                        // direct value
set(current => transformLayer(current))  // updater fn

// promiseExit mode: async; resolves to Exit<Success, Failure>
const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
const exit = await launch(gameId)    // Promise<Exit<A, E>>

// promise mode: resolves to success value, throws on failure
const run = useAtomSet(commandAtom, { mode: "promise" })
const result = await run(arg)        // Promise<A>
```

`mode` is only available when `R` extends `AsyncResult<A, E>`. TypeScript enforces this.

**`useAtomInitialValues` — seeding a registry:**
```ts
// Call INSIDE a component rendered below a RegistryProvider.
// Each atom is seeded AT MOST ONCE per registry — subsequent calls for the same
// atom in the same registry are silently ignored.
useAtomInitialValues([
  [catalogFactsSourceLayerAtom, CatalogFactsSource.Fixtures],
  [launcherLayerAtom, Launcher.InMemory],
])
```

**`RegistryProvider`:**
```tsx
// Creates one AtomRegistry, passes via RegistryContext.
// Options are only read at registry creation — changes after first render are ignored.
<RegistryProvider
  initialValues={[[layerAtom, FixtureLayer]]}
  defaultIdleTTL={400}   // default: 400ms for idle atom disposal
>
  <App />
</RegistryProvider>
```

The provider delays registry disposal by **500 ms** after unmount, then calls `registry.dispose()`. This allows React Strict Mode double-mount without destroying state between the two mounts.

### 2d. `AtomRegistry` Direct API (lab-side usage)

The lab drives surface state by calling the registry's imperative API directly, outside React. The registry is retrieved via the `onRegistry` callback in `mountSurface`:

```ts
// Registry methods (AtomRegistry interface):
registry.set(layerAtom, newLayer)          // swap layer → triggers reactive cascade
registry.get(atom)                         // read current value (non-reactive)
registry.refresh(atom)                     // force re-evaluation
registry.subscribe(atom, listener)         // → unsubscribe fn
registry.mount(atom)                       // → unmount fn (keeps atom alive)
registry.update(atom, f)                   // read-modify-write
registry.reset()                           // clear all nodes (keep registry alive)
registry.dispose()                         // permanent teardown (makes access an error)
```

`registry.set(layerAtom, newLayer)` is the lab's **primary axis pin mechanism** — it writes a new `Layer<Service>` value into the writable source-layer atom, causing `Atom.runtime` to rebuild its Effect Context and all downstream async atoms to re-run.

### 2e. AtomRegistry Construction (test / lab isolation)

```ts
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

// Fresh isolated registry — used in tests and for each mounted surface
const registry = AtomRegistry.make({
  initialValues: [
    [catalogFactsSourceLayerAtom, FixtureLayer],
    [launcherLayerAtom, InMemoryLauncherLayer],
  ],
  scheduleTask,       // custom React-aware scheduler (RegistryProvider uses this)
  defaultIdleTTL: 400 // ms before unobserved atoms are disposed
})
```

### 2f. Lab's Surface Registry Hub

`tools/theme-workshop/lab/model/lab-surface-registries.ts` is the **lab-side singleton** that maps mounted surface instances to their live `AtomRegistry`:

```ts
// When LabSurfaceMount mounts a surface:
unregisterRegistryRef.current = registerLabSurfaceRegistry({
  scopeId,              // canvas object id (scopes axis pins to one device)
  registry,             // the live AtomRegistry from onRegistry callback
  seed,                 // Map<Atom, value> of mount-time initial values
})

// An axis pin calls:
eachLabTargetRegistry(scopeId, ({ registry }) => {
  registry.set(layerAtom, newLayer)  // drives the real source atom in the live surface
})

// An axis release restores the seed value:
eachLabTargetRegistry(scopeId, ({ registry, seed }) => {
  const seedValue = seed.get(layerAtom)
  if (seedValue !== undefined) registry.set(layerAtom, seedValue)
})
```

The `seed` map is the surface's mount-time `initialValues`, enabling **restore-to-seed** semantics when an axis is released back to "Live".

### 2g. Effect v4 Layer Patterns

```ts
// Context.Service for service declarations
class Library extends Context.Service<Library, LibraryShape>()("Library") {}

// Layer.effect for production wiring
const LibraryLayerLive = Layer.effect(Library, Effect.gen(function*() {
  // ... acquire dependencies
  return { /* ServiceShape */ }
}))

// Layer.succeed for test/harness wiring
const LibraryLayerInMemory = Layer.succeed(Library, inMemoryImpl)

// Merging two layers (Effect v4 — use Layer.merge, not Layer.mergeAll for 2 layers)
const merged = Layer.merge(LayerA, LayerB)

// Scoped layers — Layer<R, E, Scope> acquired and released with scope
const LayerScoped = Layer.scoped(Service, Effect.acquireRelease(acquire, release))
```

---

## 3. Version-Specific Gotchas and Breaking Changes

### 3a. Effect v4 beta (4.0.0-beta.78)

1. **`effect/unstable/reactivity/` import path** — All atom/registry types live under this unstable subpath. The leading `unstable/` signals these APIs can change between beta builds. Current paths:
   - `effect/unstable/reactivity/Atom`
   - `effect/unstable/reactivity/AtomRegistry`
   - `effect/unstable/reactivity/AsyncResult`
   - `effect/unstable/reactivity/AtomRef`
   - `effect/unstable/reactivity/AtomRpc`
   - `effect/unstable/reactivity/Reactivity`

2. **`Atom.runtime` is `RuntimeFactory.__call__`, not a static constructor** — `runtime` exported from `effect/unstable/reactivity/Atom` is the module-level default `RuntimeFactory` instance. Call it directly:
   ```ts
   import * as Atom from "effect/unstable/reactivity/Atom"
   const myRuntime = Atom.runtime(get => get(myLayerAtom))
   // NOT: new AtomRuntime(...)
   // NOT: Atom.runtime.create(...)
   ```

3. **`Layer.mergeAll` → prefer `Layer.merge` for two layers** — the codebase uses `Layer.merge(a, b)`. `Layer.mergeAll` may also exist but `Layer.merge` is the idiomatic two-arg form in Effect v4.

4. **`AtomRuntime.layer` exposes the underlying layer atom** — the `AtomRuntime` returned by `Atom.runtime(fn)` has a `.layer` property that is the `Atom<Layer<R,E>>` it derives from. This is useful for reading or setting the layer atom from outside of a runtime.atom call.

5. **`Atom.make(initialValue)` returns `Writable<A>`** — calling `Atom.make` with a non-function value creates a writable state atom. Calling with a read function creates a derived atom. Calling with an `Effect` creates an `AsyncResult` atom. TypeScript overloads disambiguate.

6. **`useAtomInitialValues` is idempotent per atom per registry** — If you call it twice with the same atom in the same registry, the second call is a no-op. The `WeakSet<Atom>` tracker prevents double-seeding. This means you cannot use `useAtomInitialValues` to reset an atom's value mid-component-lifetime — use `registry.set` or `useAtomSet` instead.

7. **`RegistryProvider` options are frozen at construction** — `initialValues`, `scheduleTask`, `defaultIdleTTL` are only read when the internal `AtomRegistry` is first created (via `useRef<null>`). Changing these props later has no effect. Pass stable values.

8. **`Atom.runtime` shares `defaultMemoMap`** — all runtimes created with the module-level `Atom.runtime` factory share the same `Layer.MemoMap`, enabling layer memoization across runtimes. Use `Atom.context({ memoMap: Layer.unsafeMakeMemoMap() })` to create an isolated factory for tests.

9. **Effect v4 target vs current stack** — the project's lattice conventions say "Effect v4 is the target; new code is written so the path from any Provider/hook scaffolding to v4 atoms is mechanical." The `@effect/atom-react` package IS the v4 atoms API — this stack is already at the target.

### 3b. Vite 6.x

1. **`server.host: true` + `allowedHosts: true`** — The lab config exposes Vite on all interfaces (`host: true`) and accepts any host header (`allowedHosts: true`). This is intentional for on-device lab viewing but is a security consideration if ever exposed publicly.

2. **`resolve.dedupe: ["react", "react-dom"]` is mandatory** — When the lab renders `@product` surfaces that each carry their own `react` import paths, Vite can resolve multiple React instances. With two Reacts, the second tree's dispatcher is `null` and `useState` throws "Cannot read properties of null (reading 'useState')". The `dedupe` array forces a single React instance.

3. **`optimizeDeps.include` prevents mid-session reload crashes** — Without pre-bundling `effect`, `@effect/atom-react`, and `lucide-react`, Vite may trigger dep re-optimization when a surface with many transitive dependencies (e.g. a Shift page with icons) is first loaded. That re-optimization causes a full page reload while React is mid-render, leaving the dispatcher null. The `include` list pre-bundles them at startup.

4. **`server.watch.ignored: ["**/ai-takes/**"]`** — AI-generated part files are written at runtime by the lab's Vite middleware. Watching them would trigger a full dev-server HMR reload for every new AI part, wiping in-progress lab state. The ignore keeps HMR scoped to human-authored code.

5. **`LAB_DEVICE=1` env var gates the HMR keep-alive plugin** — On a physical device, backgrounding the browser tab drops the WebSocket, and Vite's client normally does `location.reload()` on reconnect. The `labDeviceHmrKeepAlivePlugin` transforms `vite/dist/client/client.mjs` to replace that `reload()` with a silent `transport.connect()` call. This is **post-transform, serve-only** and matches Vite's internal client by identifier, so it will break silently if Vite changes its reconnect logic (a warning is emitted when the pattern is not found).

6. **Custom Vite plugins use Node.js `child_process.spawn`** — `labDesignTakesPlugin` and `labGeneratePartsPlugin` spawn external shell scripts. These only run in dev-server mode, not in production builds.

7. **`publicDir: false`** — The lab has no static public assets directory. All assets come through module imports or runtime API calls.

8. **No `@tanstack/router-plugin` in the lab Vite config** — The portal uses TanStack's file-based router Vite plugin. The lab uses the **code-based** TanStack Router API exclusively (no `routeTree.gen.ts`, no codegen). Do NOT add the router plugin to the lab config.

### 3c. TanStack Router 1.168.26 (resolved from `^1.120.3`)

1. **Code-based router, not file-based** — The lab uses `createRootRoute`, `createRoute`, `createRouter` directly from `@tanstack/react-router`. No `@tanstack/router-plugin` or file-based codegen.

2. **Route pattern `/lab/$devices/$themeId/$`** — The trailing `$` is TanStack's "splat" parameter (captures everything after, including slashes). Accessed as `params._splat` or `params["*"]` (both are tried in the lab code due to TanStack Router version variation in the splat key name).

3. **`createMemoryHistory` for mounted surfaces** — Each surface mounted in `LabSurfaceMount` gets its own `createMemoryHistory({ initialEntries: [path] })` from `@tanstack/history`. The surface's router navigates this in-memory history; the lab's outer `router.history` reflects the selected surface path in the URL. The subscribe/suppress pattern (`suppressPathRef`) prevents feedback loops.

4. **`useParams({ strict: false })`** — The lab uses `strict: false` to read route params outside the exact matched route component. Required because `LabRoute` reads params inside a component that IS the route component, but with `strict: false` for forward-compatibility.

5. **Version drift risk** — bun.lock resolved `1.168.26` against the `^1.120.3` range. TanStack Router has historically had minor breaking changes in minor versions. If `bun.lock` is refreshed and the resolved version jumps significantly, test the splat param key name (`_splat` vs `*`).

### 3d. Tailwind v4.2.4

1. **No `tailwind.config.js`** — Tailwind v4 is configured entirely through CSS. The project's theme lives in `product/platform/react/primitives/theme/styles.css`. The `@theme {}` block replaces `theme: { extend: {} }` from v3.

2. **`@source` directives replace `content` config** — Tailwind v4 scans automatically from the CSS file's location, but `@source` is used explicitly to cover surfaces outside the lab's Vite root:
   ```css
   @source "../../../../apps/**/*.{ts,tsx,html}";
   @source "../../../../surfaces/web/**/*.{ts,tsx}";
   @source "../../../../platform/**/*.{ts,tsx}";
   ```
   If new surfaces are added outside these globs, their Tailwind classes will not be generated in the lab's build.

3. **`@custom-variant dark (&:is(.dark *))` — v4 variant syntax** — Replaces v3's `darkMode: "class"`. Dark mode applies when a `.dark` ancestor exists.

4. **Fluid `--spacing` via `cqi`** — The base spacing unit is `clamp(0.09375rem, calc(0.0625rem + 0.156cqi), 0.3125rem)`. This uses `cqi` (container query inline-size unit), which falls back to the viewport when no `container-type` ancestor exists. Lab device frames must declare `container-type: inline-size` (or `size`) for the fluid scale to calibrate correctly relative to the device frame, not the browser viewport.

5. **`text-xs` is `initial` (removed)** — The project deliberately removes the smallest type step. Any component using `text-xs` will get the browser default font size, not a design token. Use `text-sm` as the minimum.

6. **`@effect/atom-react` marks files `"use client"`** — In RSC environments, the atom hooks module is client-only. In the lab (a pure SPA), this directive is irrelevant but present in the source.

---

## 4. Architecture: How the Lab Avoids Remounting

The key insight is that the lab never re-renders product surfaces from props. Instead it reaches directly into each mounted surface's live `AtomRegistry` and writes to the writable layer atoms.

### Mount pipeline
```
LabSurfaceMount
 └─ adapter.mountSurface(host, { initialValues, history, onRegistry })
     └─ mountShift(host, { data, navigation, dualScreen, onRegistry })
         └─ createRoot(host).render(
               <RegistryProvider>
                 <ShiftSurfaceApp
                   initialValues={initialValues}  ← seeds layers at startup
                   onRegistry={onRegistry}         ← reports the registry upward
                 />
               </RegistryProvider>
            )
             └─ useAtomInitialValues(initialValues)  ← once per atom per registry
             └─ <ShiftRegistryBridge onRegistry={onRegistry} />
                 └─ useContext(RegistryContext)
                 └─ useEffect(() => onRegistry(registry), [registry])
                     └─ registerLabSurfaceRegistry({ scopeId, registry, seed })
```

After mount, `LabSurfaceRegistries` holds a reference to the live `AtomRegistry`. When a state-axis pin is applied:

```ts
eachLabTargetRegistry(scopeId, ({ registry }) => {
  registry.set(foregroundSessionStatusLayerAtom, PinnedLayer)
  // ↑ This writes directly into the mounted surface's AtomRegistry.
  // The runtime's Effect Context rebuilds; every useAtomValue subscriber
  // in ShiftHomeRoute re-renders with the new state. No remount.
})
```

When released:
```ts
eachLabTargetRegistry(scopeId, ({ registry, seed }) => {
  registry.set(foregroundSessionStatusLayerAtom, seed.get(foregroundSessionStatusLayerAtom))
  // ↑ Restores the mount-time seed value.
})
```

---

## 5. Constraints for Adding New Axes/Surfaces/Canvas Restructuring

### Adding a new state axis

1. **Axis must be declared in the surface adapter** — `LabSurfaceAdapter.axesForScreen(screenPath)` returns `LabStateAxis[]`. Each `LabStateAxis` needs:
   - `id` — unique string key
   - `kind: "single" | "multi"` — whether only one or multiple states can be pinned
   - `states` — derived from the real state machine tags, never hand-authored
   - `pin(stateId, context)` — calls `registry.set(layerAtom, ...)` via `eachLabTargetRegistry`
   - `release(context)` — restores seed value
   - Optional `parent: { axisId, whenStates }` — for nested axes that only activate when a parent is in certain states

2. **Nested axis release cascade** — `useLabAxisController` automatically releases nested axes when their parent leaves the enabling state. The cascade runs until stable. Verify that a new nested axis's `parent.axisId` matches an existing axis id exactly.

3. **`captureCoordinate` must cover new axes** — If the surface implements `captureCoordinate(screenPath)`, it must return the new axis's current state in the `LabScreenCoordinate` map. Without this, the "Capture" button will silently not capture the new axis's live state.

4. **Axes are per-screen, not per-surface** — `axesForScreen` is called with the active screen path. If the new axis lives on a screen that is not the first-screens-with-axes path (computed in `useLabAxisController`), it will not appear. The controller uses the first screen that returns non-empty axes.

### Adding a new surface adapter

1. **Register in `LAB_SURFACE_ADAPTERS`** in `surface-registry.ts` — The array is the source of truth; `labSurfaceAdapters()` returns it, and `defaultLabSurfaceAdapterId()` returns `[0].id`.

2. **`mountSurface` must call `onRegistry`** — The `onRegistry` callback is the only channel through which the lab gets access to the surface's live `AtomRegistry`. If a surface skips it, axis pins will silently not drive any atoms. Pattern: create a `<SurfaceRegistryBridge onRegistry={onRegistry} />` component inside the `RegistryProvider`.

3. **`makeSeedInitialValues` must return `readonly [Atom, value][]`** — This is the `initialValues` shape that `useAtomInitialValues` and `seedMapFromInitialValues` expect. The seed map is also stored in `LabSurfaceRegistryEntry.seed` for axis-release restore.

4. **`resolve.dedupe` and `optimizeDeps.include`** — When a new surface brings new module graph paths to React/Effect, these Vite config arrays may need updating if the surface triggers a dep re-optimization mid-session.

### Adding a new axis kind or changing the registry pattern

1. **`eachLabTargetRegistry` is the canonical dispatch path** — All axis pins and events MUST go through `eachLabTargetRegistry(scopeId, fn)`. Bypassing it breaks scoped vs. global behavior.

2. **Test cleanup: `clearLabSurfaceRegistries()`** — `LabSurfaceRegistries` is a module-level `Set`. Tests that register entries must call `clearLabSurfaceRegistries()` in `afterEach` to prevent cross-test state leakage.

3. **`scopeId` is the canvas object's identity** — In a multi-device canvas, each device frame has a unique `scopeId`. Global controls (no scopeId) affect all mounted surfaces. Scoped controls affect only the target device. When adding new per-device controls, always thread `scopeId` through `LabSurfaceEventContext` and `LabSurfaceInputContext`.

### Restructuring the canvas (layout changes)

1. **`.lab-screen .shift-route-stage { height: 100% }` in `lab.css`** — Production surfaces typically size themselves to `100vh`. The lab overrides this for every known surface frame class. Adding new surfaces with custom stage selectors requires corresponding overrides in `lab.css`.

2. **`container-type` on device frames** — The fluid `cqi`-based theme tokens in `styles.css` calibrate to the device frame's container. If the device frame ancestor does not have `container-type: inline-size`, `cqi` falls back to the viewport width, and the surface's text/spacing scale reads as if it were full-screen regardless of the device frame size.

3. **`data-lab-surface-mount={adapter.id}`** — `LabSurfaceMount` renders `<div data-lab-surface-mount={adapter.id} ref={hostRef} />` as the imperative host element. The surface mounts into this div via `createRoot(host)`. This is also the attribute used by `startSpatialNavigation`'s scope selector in `main.tsx`. If the attribute name changes, spatial navigation scope breaks.

4. **`suppressPathRef` feedback loop guard** — `LabSurfaceMount` uses a ref to suppress echoing navigation events back to the lab router when the lab itself caused the navigation. This is fragile: if `normalizeSurfacePath` produces different strings between the lab URL and the surface history, paths can get out of sync or loop. Keep path normalization consistent.

---

## 6. Official Documentation References

| Subject | URL / Location |
|---|---|
| Effect v4 reactive atoms (Atom module) | `node_modules/effect/dist/unstable/reactivity/Atom.d.ts` (inline JSDoc) |
| AtomRegistry reference | `node_modules/effect/dist/unstable/reactivity/AtomRegistry.d.ts` |
| `@effect/atom-react` hooks | `node_modules/@effect/atom-react/src/Hooks.ts` (full source with JSDoc) |
| `@effect/atom-react` RegistryContext | `node_modules/@effect/atom-react/src/RegistryContext.ts` |
| Tailwind v4 theme configuration | https://tailwindcss.com/docs/v4-beta (v4 docs) |
| Tailwind v4 `@source` directive | https://tailwindcss.com/docs/detecting-classes-in-source-files |
| Tailwind v4 `@custom-variant` | https://tailwindcss.com/docs/adding-custom-styles#adding-custom-variants |
| TanStack Router code-based API | https://tanstack.com/router/latest/docs/framework/react/guide/code-based-routing |
| TanStack Router splat routes | https://tanstack.com/router/latest/docs/framework/react/guide/route-matching#splat-routes |
| TanStack `createMemoryHistory` | `node_modules/@tanstack/history` package |
| Vite `resolve.dedupe` | https://vitejs.dev/config/shared-options.html#resolve-dedupe |
| Vite `optimizeDeps.include` | https://vitejs.dev/config/dep-optimization-options.html#optimizedeps-include |
| CSS `cqi` container query units | https://developer.mozilla.org/en-US/docs/Web/CSS/length#container_query_length_units |

**In-repo source files critical to the lab:**

| File | Role |
|---|---|
| `tools/theme-workshop/lab/vite.config.mjs` | Lab-specific Vite config |
| `tools/theme-workshop/lab/main.tsx` | Entry point, spatial nav boot |
| `tools/theme-workshop/lab/lab-router.tsx` | Code-based TanStack Router setup |
| `tools/theme-workshop/lab/surface-registry.ts` | `LabSurfaceAdapter` contract |
| `tools/theme-workshop/lab/LabSurfaceMount.tsx` | Imperative surface mount + registry capture |
| `tools/theme-workshop/lab/model/lab-surface-registries.ts` | Lab-side registry hub |
| `tools/theme-workshop/lab/model/lab-state-axis.ts` | Axis model, pin/release helpers |
| `tools/theme-workshop/lab/useLabAxisController.ts` | Axis lifecycle, scope keys, mode toggle |
| `product/platform/react/catalog/catalog-atoms.ts` | Canonical `layerAtom` → `runtime` → `runtime.atom` pattern |
| `product/platform/react/primitives/theme/styles.css` | `@theme {}` with fluid `cqi` scale |
| `product/surfaces/web/shift/mount-shift.tsx` | `RegistryProvider` + `ShiftRegistryBridge` pattern |
| `product/surfaces/web/shift/mount-shift-part.tsx` | Part-scoped registry root pattern |
