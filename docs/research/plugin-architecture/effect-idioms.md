# Effect-TS Plugin Architecture Idioms

**Research value: high** — Substantial prior art directly in Effect's own ecosystem (`@effect/ai`, `@effect/rpc`), confirmed idioms from primary sources (effect.website docs, Layer.ts API reference, RPC README).

---

## Prior Art

**Effect AI (`@effect/ai` + provider packages)** is the canonical Effect plugin architecture in production. The base package declares abstract services (`LanguageModel`, `EmbeddingsModel`); each provider package (`@effect/ai-openai`, `@effect/ai-anthropic`, `@effect/ai-google`, `@effect/ai-amazon-bedrock`) ships a concrete `Layer` implementation. The host writes against the abstract interface; the provider is wired at the composition root. The host knows nothing about providers at compile time — it only requires `LanguageModel` in its `R` channel.

**`@effect/workflow`** uses `Layer.mergeAll(EmailWorkflowLayer, ...)` as a composition root for cluster entities, demonstrating the same "collect plugin layers, merge, provide" pattern.

---

## 1 · Layer Composition for Plugin Registration

A plugin is a `Layer<PluginService, E, PluginDeps>`. The host builds a final `Layer` by merging discovered plugin layers:

```ts
// Each plugin ships a Layer:
const GamingLibraryLayer: Layer.Layer<LibrarySource, never, FileSystem> = ...
const JellyfinLibraryLayer: Layer.Layer<LibrarySource, never, HttpClient> = ...

// Host merges at the composition root (known set):
const AppLayer = Layer.mergeAll(GamingLibraryLayer, JellyfinLibraryLayer, ...)

// Dynamic set discovered at runtime — unwrapEffect turns Effect<Layer> → Layer:
const PluginRegistryLayer: Layer.Layer<LibrarySources> = Layer.unwrapEffect(
  Effect.map(discoverPlugins(), (layers) => Layer.mergeAll(...layers))
)
```

Key combinators:
- `Layer.merge(a, b)` — two layers, concurrent, union of outputs
- `Layer.mergeAll(...layers)` — variadic, same semantics; type is `Layer<Union, Union, Union>`
- `Layer.provide(that)(self)` — feed `that`'s outputs into `self`'s inputs; leftover inputs pass through
- `Layer.provideMerge(that)(self)` — same but both layers' outputs are kept in the result
- `Layer.unwrapEffect(effect)` — lift a `Effect<Layer>` into a `Layer`; critical for runtime-discovered plugins
- `Layer.suspend(() => ...)` — lazy; avoids circular reference during construction

`Effect.Service` shorthand — the `Default` static property auto-includes the `dependencies` array:

```ts
export class JellyfinSource extends Effect.Service<JellyfinSource>()("JellyfinSource", {
  effect: Effect.gen(function* () { ... }),
  dependencies: [HttpClient.layer, ConfigLayer],
}) {}
// JellyfinSource.Default is the fully self-contained Layer
```

---

## 2 · Multi-Implementation Services (N plugins same shape)

Effect's `Context` maps one tag to one value. For N plugins answering the same shape, the idiomatic tag holds a *collection*:

```ts
// The host's contract: a tag whose value is an array of sources
class LibrarySources extends Context.Tag("LibrarySources")<
  LibrarySources,
  ReadonlyArray<LibrarySourceImpl>
>() {}

// A plugin contributes by providing this tag with a singleton array:
const GamingLayer = Layer.succeed(LibrarySources, [new GamingSource()])

// Host aggregates at the composition root:
const AllSourcesLayer = Layer.effect(LibrarySources, Effect.gen(function* () {
  const a = yield* GamingSource  // each plugin provides its own tag
  const b = yield* JellyfinSource
  return [a, b]
}))
```

Alternatively, `Effect.all([SourceA, SourceB, ...])` when the set is statically known:

```ts
const allSources = Effect.all([GamingSource, JellyfinSource, MusicSource])
  .pipe(Effect.map(([a, b, c]) => [a, b, c]))
```

---

## 3 · Schema as the Plugin Contract

Plugins declare inputs/outputs/errors with Schema. The host validates at the boundary and relies on `_tag` for discrimination:

```ts
// Plugin declares its error shape (extends Schema.TaggedError):
class LibraryNotFoundError extends Schema.TaggedError<LibraryNotFoundError>()(
  "LibraryNotFoundError", { id: Schema.String }
) {}

class NetworkError extends Schema.TaggedError<NetworkError>()(
  "NetworkError", { message: Schema.String }
) {}

// Union across all plugin errors the host may see:
const LibraryError = Schema.Union(LibraryNotFoundError, NetworkError)

// RPC contract uses Schema.TaggedRequest — wire schema IS the contract:
class GetLibraryItems extends Schema.TaggedRequest<GetLibraryItems>()(
  "GetLibraryItems",
  {
    payload: { sourceId: Schema.String },
    success: Schema.Array(LibraryItem),
    failure: LibraryError,
  }
) {}
```

`Schema.decode`/`Schema.encode` at the host boundary ensures a plugin payload that doesn't match the schema fails cleanly with a typed `ParseError`, not a runtime crash.

---

## 4 · Effect RPC and Plugin Groups

`RpcGroup` is the first-class composition unit. A plugin ships its own `RpcGroup`; the host mounts it under its server layer:

```ts
// Plugin declares its RPC group:
export class LibraryRpcs extends RpcGroup.make(
  Rpc.make("GetItems", { success: Schema.Array(LibraryItem), ... }),
  Rpc.make("Search",   { success: Schema.Array(LibraryItem), payload: { q: Schema.String } })
) {}

// Plugin implements handlers as a Layer:
export const LibraryRpcsLive: Layer.Layer<
  Rpc.Handler<"GetItems"> | Rpc.Handler<"Search">
> = LibraryRpcs.toLayer(
  Effect.gen(function* () {
    const src = yield* LibrarySource
    return {
      GetItems: () => src.listAll(),
      Search: ({ q }) => src.search(q),
    }
  })
).pipe(Layer.provide(LibrarySource.Default))

// Host wires all plugin groups into one server layer:
const RpcLayer = RpcServer.layer(LibraryRpcs).pipe(
  Layer.provide(LibraryRpcsLive)
)
```

Multiple groups are additive: provide each `RpcGroup`'s handler `Layer` to the same `RpcServer.layer`. No single host-owned union type is required.

RPC middleware (`RpcMiddleware.Tag`) is also composable: a plugin can require an `AuthMiddleware` context tag without knowing how the host implements it.

---

## 5 · Atom Registry and Plugins on the React Side

`@effect/atom-react` atoms are module-scoped constants — JS module identity prevents collision without any registry. The architecture: each plugin module exports its own atoms that use `Atom.runtime((get) => get(layerAtom))`, where `layerAtom` is a shared seam holding the current `Layer`:

```ts
// shared/layer-atom.ts — single shared seam across all plugins:
export const layerAtom = Atom.of(AppLayerLive)  // overridden in tests/stories

// plugin-gaming/atoms.ts — gaming plugin's atoms:
import { layerAtom } from "@shared/layer-atom"

export const gamingItemsAtom = Atom.runtime((get) => get(layerAtom)).atom(
  Effect.gen(function* () {
    const src = yield* GamingSource
    return yield* src.listAll()
  })
).pipe(Atom.swr({ staleTime: Duration.minutes(5) }))
```

Isolation is via module scoping: `gamingItemsAtom` and `jellyfinItemsAtom` are distinct references. No global registry or namespace prefix is needed. Naming convention (`gamingItemsAtom`, `jellyfinItemsAtom`) substitutes for collision avoidance.

---

## 6 · Capability Tokens / Permission Scoping

`@effect/platform` services are capability tokens. A plugin's `R` channel declares what it needs; the host controls whether to satisfy it:

```ts
// Plugin effect requires FileSystem:
const scanLocalLibrary: Effect.Effect<GameRecord[], ScanError, FileSystem.FileSystem> = ...

// Plugin requires HttpClient:
const fetchRemoteLibrary: Effect.Effect<GameRecord[], FetchError, HttpClient.HttpClient> = ...

// Host grants capabilities selectively at the composition root:
const PluginWithFs = scanLocalLibrary.pipe(
  Effect.provide(NodeFileSystem.layer)   // granted
)
const PluginWithoutNet = fetchRemoteLibrary // R still includes HttpClient — host can refuse
```

If the host omits `HttpClient.layer` from the composition, the effect's `R` channel is not fully satisfied and the program won't compile. The type system enforces the capability grant/deny at wiring time — not at runtime. Platform-specific layers (`NodeFileSystem.layer`, `BunContext.layer`, `FetchHttpClient.layer`) are the concrete grants.

---

## Sources

| URL | Description |
|-----|-------------|
| https://effect.website/docs/requirements-management/layers/ | Official Layer docs: `merge`, `mergeAll`, `provide`, `Effect.Service` with `dependencies` |
| https://effect-ts.github.io/effect/effect/Layer.ts.html | Full Layer API reference: `unwrapEffect`, `provideMerge`, `suspend`, `flatMap` signatures |
| https://github.com/Effect-TS/effect/blob/main/packages/rpc/README.md | RPC quickstart: `RpcGroup.make`, `toLayer`, `RpcServer.layer`, middleware pattern |
| https://effect.website/docs/ai/introduction/ | Effect AI architecture: abstract services + concrete provider layers as the plugin model |
| https://effect.website/docs/ai/getting-started/ | `Effect.provide(Model)` pattern — provider as a swap-in `Layer` |
| https://effect.website/docs/platform/introduction/ | `@effect/platform`: `FileSystem`, `HttpClient`, `Path` as capability tokens |
| https://www.typeonce.dev/course/effect-beginners-complete-getting-started/layers/extracting-default-layer-from-effect-service | `Effect.Service` `Default` + `dependencies` array; `Layer.mergeAll(PokeApi.Default)` pattern |
