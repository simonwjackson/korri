# Framework Documentation: Multi-User / Ownership Modeling
## Effect v4 (beta.78) + Effect RPC + Effect Schema + @effect/atom-react

> **Version pinned:** `effect@4.0.0-beta.78`, `@effect/atom-react@4.0.0-beta.78`, `@effect/platform-bun@4.0.0-beta.78`
> **Researched:** 2026-07-14 from installed type declarations, source, and migration docs.

---

## 1 · Summary

Korri's multi-user ambition means every service contract, RPC payload, and reactive
atom should be able to carry an owner/principal/account dimension. This document
covers the exact API surface in the installed versions of each library and the
patterns to follow, derived from:

- Installed type declarations under `node_modules/effect/dist/`
- `node_modules/@effect/atom-react/dist/`
- Existing codebase patterns in `product/platform/gates/middleware.ts` and
  `product/apps/portal/api/plugin-install/install-control-authorization.ts`
- Migration notes from the archived `effect-smol` repo (FiberRef → Reference)

---

## 2 · Version Information

| Package | Version |
|---|---|
| `effect` | `4.0.0-beta.78` |
| `@effect/atom-react` | `4.0.0-beta.78` |
| `@effect/platform-bun` | `4.0.0-beta.78` |

### ⚠️ Critical v4 breaking change: `FiberRef` is removed

`FiberRef`, `FiberRefs`, `FiberRefsPatch`, and `Differ` **do not exist** in v4.
Fiber-local mutable state is now handled by `Context.Reference` — the same
mechanism used for services with a default. Everything that was `FiberRef` in v3 is
now `Context.Reference<Shape>` in v4.

**Migration equivalents:**

| v3 | v4 |
|---|---|
| `FiberRef.get(myRef)` | `yield* myRef` (it's a service key now) |
| `Effect.locally(effect, ref, value)` | `Effect.provideService(effect, ref, value)` |
| `FiberRef.set(ref, value)` | `Effect.provideService(innerEffect, ref, value)` |

Source: [effect-smol/migration/fiberref.md](https://github.com/Effect-TS/effect-smol/blob/main/migration/fiberref.md)

---

## 3 · Key Concepts

### 3.1 Context.Service vs Context.Reference

```
Context.Service<Self, Shape>()("ID")
  → Required: callers must provide this service; no default.
  → Use for principals that MUST be set per-request (auth middleware).

Context.Reference<Shape>("ID", { defaultValue: () => ... })
  → Optional: has a default value when nothing overrides it.
  → Replaces FiberRef for ambient / opt-in state.
```

**Rule of thumb for ownership modeling:**

- Use `Context.Service` when the principal is **required** (server-side RPC, every
  authenticated call must fail clearly if the caller is unknown).
- Use `Context.Reference` when the principal is **ambient and optional** (e.g.,
  atoms that work in both single-user and multi-user registries, a guest/anonymous
  default is valid).

### 3.2 RpcMiddleware — how it works in v4

`RpcMiddleware.Service<Self, Config>()("ID")` produces a typed middleware class that:

1. Receives `(effect, { rpc, payload, headers, requestId, client })`.
2. Returns `Effect.provideService(effect, SomeService, derivedValue)`.
3. The `provides` config key **removes** the service from downstream handler
   requirements (handlers don't list it in their `R`).
4. The `requires` config key **adds** services the middleware itself needs.
5. An optional `error` schema lets middleware errors cross the wire as typed
   failures.

Middlewares are attached to an `RpcGroup` with `.middleware(MiddlewareClass)`.

*This is exactly how `FeatureGatesMiddleware` and `InstallControlMiddleware` work in
this codebase.*

### 3.3 @effect/atom-react — registry scoping

- `RegistryProvider` creates one `AtomRegistry` per React subtree.
- `useAtomInitialValues([...])` seeds layer atoms once per registry on mount.
- `Atom.runtime(get => layer)` builds an `AtomRuntime<R>` backed by the layer atom.
- `Atom.family(f)` memoizes atom creation by argument; same argument = same atom
  identity = single cache slot.
- `Atom.keepAlive` keeps atoms alive even without active subscribers (guards
  against the registry re-evaluating defaults mid-use).

---

## 4 · Implementation Guide

### 4.1 Defining a Principal / CurrentUser service

Two choices depending on whether an unauthenticated default is valid:

#### Option A — Required service (no default, middleware must inject it)

```ts
// product/platform/auth/current-principal.ts
import { Context, Schema } from "effect"

export interface PrincipalInfo {
  readonly id: string
  readonly displayName?: string
  // Extend as Korri grows: roles, accountId, sessionToken, etc.
}

// Declared with Context.Service — callers will fail to compile if they
// read CurrentPrincipal without the middleware in scope.
export class CurrentPrincipal extends Context.Service<
  CurrentPrincipal,
  PrincipalInfo
>()("CurrentPrincipal") {}
```

#### Option B — Ambient reference (has an anonymous default)

```ts
// product/platform/auth/current-principal.ts
import { Context } from "effect"

export interface PrincipalInfo {
  readonly id: string
  readonly kind: "authenticated" | "anonymous"
}

// Context.Reference — reads succeed even without explicit provision,
// returning the default. v4 equivalent of v3 FiberRef.
export const CurrentPrincipal = Context.Reference<PrincipalInfo>(
  "CurrentPrincipal",
  {
    defaultValue: () => ({ id: "anonymous", kind: "anonymous" }),
  },
)
```

Reading in either case (inside `Effect.gen`):

```ts
const principal = yield* CurrentPrincipal
// TypeScript knows the shape; no unsafe cast needed.
```

Overriding for a request scope:

```ts
// v4 — Effect.provideService replaces v3 Effect.locally
const scoped = Effect.provideService(
  myEffect,
  CurrentPrincipal,
  { id: "user-42", kind: "authenticated" },
)
```

### 4.2 RpcMiddleware carrying CurrentPrincipal

Follow the exact pattern used by `FeatureGatesMiddleware` and
`InstallControlMiddleware`:

```ts
// product/platform/auth/principal-middleware.ts
import { Context, Effect, Layer, Schema } from "effect"
import { RpcMiddleware } from "effect/unstable/rpc"
import { CurrentPrincipal, type PrincipalInfo } from "./current-principal"

// Typed error surfaced over the wire when auth fails.
// Schema.TaggedErrorClass puts _tag on the wire so clients can catchTag.
export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  {
    reason: Schema.Literals(["missing-token", "invalid-token", "unknown-owner"]),
    message: Schema.String,
  },
) {}

// The middleware class — Shape = the middleware fn itself.
// `provides: CurrentPrincipal` removes CurrentPrincipal from handler R.
export class PrincipalMiddleware extends RpcMiddleware.Service<
  PrincipalMiddleware,
  { provides: CurrentPrincipal; error: UnauthorizedError }
>()("PrincipalMiddleware", { error: UnauthorizedError }) {}

// Live implementation — inject the principal from HTTP headers.
export const PrincipalMiddlewareLive = Layer.succeed(PrincipalMiddleware)(
  (effect, { headers }) => {
    const token = headers["authorization"] as string | undefined
    const principal = resolveToken(token)

    if (!principal) {
      // Fail with the typed wire error — clients see UnauthorizedError.
      return Effect.fail(
        new UnauthorizedError({
          reason: "invalid-token",
          message: "Bearer token missing or invalid",
        }),
      )
    }

    // Inject the resolved principal into the handler's context.
    return Effect.provideService(effect, CurrentPrincipal, principal)
  },
)

// Harness / test implementation — always inject a fixture principal.
export function makePrincipalMiddlewareFixture(
  principal: PrincipalInfo,
): typeof PrincipalMiddlewareLive {
  return Layer.succeed(PrincipalMiddleware)(
    (effect, _opts) => Effect.provideService(effect, CurrentPrincipal, principal),
  )
}

function resolveToken(token: string | undefined): PrincipalInfo | undefined {
  // TODO: real JWT/session validation
  if (!token?.startsWith("Bearer ")) return undefined
  const raw = token.slice(7)
  // placeholder — replace with actual decode/verify
  return { id: raw, kind: "authenticated" }
}
```

#### Attaching the middleware to the RPC group

```ts
// product/apps/portal/api/server/rpc-group.ts  (example addition)
export const serverRpcGroup = RpcGroup.make(/* ... all rpcs ... */)
  .middleware(FeatureGatesMiddleware)
  .middleware(InstallControlMiddleware)
  .middleware(PrincipalMiddleware)  // ← add here; order matters (applied left to right)
```

#### Reading the principal in a handler

Because `PrincipalMiddleware.provides = CurrentPrincipal`, `CurrentPrincipal` is
already in the handler's context automatically — no explicit `Layer.provide` needed:

```ts
// product/apps/portal/api/library/launch.rpc-handler.ts  (sketch)
export const handleLaunchLibrary = (payload: typeof LaunchLibraryPayload.Type) =>
  Effect.gen(function* () {
    const principal = yield* CurrentPrincipal
    // principal.id, principal.kind — fully typed
    const source = yield* LibrarySource
    const spec = yield* source.launchSpecFor(payload.id, payload.releaseId)
    // ... ownership check against principal.id ...
  })
```

#### Typed unauthorized guard (reusable helper)

```ts
// product/platform/auth/require-authenticated.ts
import { Effect } from "effect"
import { CurrentPrincipal } from "./current-principal"
import { UnauthorizedError } from "./principal-middleware"

export const requireAuthenticated = Effect.gen(function* () {
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "authenticated") {
    return yield* Effect.fail(
      new UnauthorizedError({
        reason: "missing-token",
        message: "Authentication required",
      }),
    )
  }
  return principal
})
```

### 4.3 Forwarding the principal on the client side

`RpcMiddleware` also supports a `layerClient` for client-side header injection.
The existing pattern (`rpcProtocolHttpLayer`, `RpcClientLive`) applies — add the
auth header in `transformClient`:

```ts
// product/platform/api/rpc/client-layer.ts  (adaptation sketch)
import { RpcMiddleware } from "effect/unstable/rpc"
import { PrincipalMiddleware } from "@platform/auth/principal-middleware"

// Client-side companion: reads the current user token and injects it.
export const PrincipalMiddlewareClientLive = RpcMiddleware.layerClient(
  PrincipalMiddleware,
  ({ next, request }) => {
    const token = getSessionToken() // e.g., from a cookie or context
    const authedRequest = {
      ...request,
      headers: { ...request.headers, authorization: `Bearer ${token}` },
    }
    return next(authedRequest)
  },
)
```

> **Note:** `RpcMiddleware.layerClient` is available in the installed version
> (`node_modules/effect/dist/unstable/rpc/RpcMiddleware.d.ts`). The `requiredForClient`
> flag on the middleware class controls whether generated clients enforce this.

### 4.4 Effect Schema — modeling the owner/account field

#### Adding an `ownerId` field backward-compatibly

```ts
// product/platform/library/game-record.ts  (sketch)
import { Schema } from "effect"

// Phase 1: ownerId optional so old server/clients interoperate.
export class GameRecord extends Schema.Class<GameRecord>("GameRecord")({
  id: Schema.String,
  title: Schema.String,
  /**
   * Owner dimension. Optional now (single-user) — becomes required in
   * Phase 2 when multi-user is the deployment default.
   *
   * Schema.optionalKey = key can be absent in encoded form.
   * Schema.optional    = key OR undefined (wider; prefer optionalKey here).
   */
  ownerId: Schema.optionalKey(Schema.String),
}) {}

// Phase 2 (schema evolution): extend to require it.
// Schema.Class#extend creates a new class with merged fields —
// field overrides are allowed (optionalKey → required).
export class GameRecordV2 extends GameRecord.extend<GameRecordV2>("GameRecordV2")(
  {
    ownerId: Schema.String,  // now required — non-breaking if server populates it
  },
) {}
```

#### Typed errors for ownership failures

```ts
// product/platform/auth/ownership-errors.ts
import { Schema } from "effect"

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  {
    reason: Schema.Literals(["missing-token", "invalid-token", "unknown-owner"]),
    message: Schema.String,
  },
) {}

export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  {
    resource: Schema.String,
    ownerId: Schema.String,
    requestingId: Schema.String,
    message: Schema.String,
  },
) {}

// Combined ownership error union for RPC error schemas.
export const OwnershipError = Schema.Union([UnauthorizedError, ForbiddenError])
export type OwnershipError = UnauthorizedError | ForbiddenError
```

On RPC definitions, add to the `error` union:

```ts
import { ApiError } from "@platform/api/rpc/errors"
import { OwnershipError } from "@platform/auth/ownership-errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

// Combined error: existing ApiError + new OwnershipError
const RpcError = Schema.Union([ApiError, OwnershipError])

export const GetLibraryRpc = Rpc.make("app.library.get", {
  payload: GetLibraryPayload,
  success: LibraryResponse,
  error: RpcError,
})
```

> **Convention:** Follow existing `_tag` discipline from `product/platform/api/rpc/errors.ts`.
> Errors use `Schema.TaggedErrorClass` (not `Data.TaggedError`) so they are
> schema-backed and can cross the RPC wire with full type information.

### 4.5 @effect/atom-react — per-user runtime scoping

The key insight from the existing codebase (`library-atoms.ts`, `catalog-atoms.ts`,
`HomeRuntimeLayersRoot.tsx`): **the atom runtime is determined by a `layerAtom`**,
and the composition root (`useAtomInitialValues`) seeds it once per registry.

#### Option A — Single registry, user-aware layer atom

The simplest path: the layer atom itself carries the user. When the user changes, the
layer atom is updated, invalidating all atoms that depend on the runtime.

```ts
// product/platform/react/auth/auth-atoms.ts
import { Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { CurrentPrincipal } from "@platform/auth/current-principal"

// Writable atom holding the current principal layer.
// Default: anonymous. Composition root seeds the real user.
export const currentPrincipalLayerAtom = Atom.make(
  Layer.succeed(CurrentPrincipal, { id: "anonymous", kind: "anonymous" }),
).pipe(Atom.keepAlive)

// Runtime that provides CurrentPrincipal to all dependent atoms.
export const principalRuntime = Atom.runtime(get =>
  get(currentPrincipalLayerAtom),
)

// Example: an atom that requires the current principal
export const currentPrincipalAtom = principalRuntime.atom(
  Effect.gen(function* () {
    return yield* CurrentPrincipal
  }),
)
```

Composition root seeds it (e.g., in a route root or `HomeRuntimeLayersRoot`-style
component):

```ts
import { useAtomInitialValues } from "@effect/atom-react"
import { Layer } from "effect"
import { CurrentPrincipal } from "@platform/auth/current-principal"
import { currentPrincipalLayerAtom } from "@platform/react/auth/auth-atoms"

function AppRuntimeLayersRoot({ user, children }) {
  useAtomInitialValues([
    [
      currentPrincipalLayerAtom,
      Layer.succeed(CurrentPrincipal, {
        id: user.id,
        kind: "authenticated",
      }),
    ],
  ] as const)
  return <>{children}</>
}
```

Updating the layer when the user changes (e.g., sign-in/sign-out):

```ts
import { useAtomSet } from "@effect/atom-react"
import { Layer } from "effect"
import { currentPrincipalLayerAtom } from "@platform/react/auth/auth-atoms"
import { CurrentPrincipal } from "@platform/auth/current-principal"

function SignInButton({ userId }) {
  const setPrincipalLayer = useAtomSet(currentPrincipalLayerAtom)

  const handleSignIn = () => {
    setPrincipalLayer(
      Layer.succeed(CurrentPrincipal, {
        id: userId,
        kind: "authenticated",
      }),
    )
  }
  // ...
}
```

> **Warning:** Changing the layer atom invalidates the entire `principalRuntime`,
> which causes all derived atoms to reload. This is the correct behavior — atoms
> for user A should not be served to user B — but design around it by keeping the
> runtime narrow (user-scoped data only) and composing it with other layer atoms
> using `Layer.merge`.

#### Option B — Per-user atom families

`Atom.family` memoizes atom creation by argument. Same argument = same atom identity
= single cache slot in the registry.

```ts
// product/platform/react/library/user-library-atoms.ts
import * as Atom from "effect/unstable/reactivity/Atom"
import { Effect } from "effect"
import { LibrarySource } from "@platform/library/library-services"

// Each unique userId gets its own derived atom, cached by the registry.
export const userLibraryItemsAtomFamily = Atom.family((userId: string) =>
  libraryRuntime.atom(
    Effect.gen(function* () {
      const source = yield* LibrarySource
      return yield* source.listForOwner(userId)
    }),
  ),
)

// In a component:
// const items = useAtomValue(userLibraryItemsAtomFamily(currentUser.id))
```

`Atom.family` caches by structural equality (uses a `WeakMap`-like mechanism for
objects, reference equality for primitives), so a stable `userId` string works fine.

#### Option C — Nested RegistryProviders

For true multi-user isolation (e.g., split-screen or concurrent user views),
`RegistryProvider` can nest. Each subtree gets a wholly independent registry:

```ts
function UserView({ userId, layer }) {
  return (
    // A new AtomRegistry is created for this subtree.
    // useAtomInitialValues inside seeds the userId-specific layers.
    <RegistryProvider>
      <UserRuntimeRoot userId={userId} layer={layer}>
        {/* ... */}
      </UserRuntimeRoot>
    </RegistryProvider>
  )
}
```

> `RegistryProvider` creates a new `AtomRegistry` with `AtomRegistry.make()`. The
> seeding via `useAtomInitialValues` inside applies only to that registry; the outer
> registry is unaffected.

### 4.6 End-to-end contract sketch

```
Client (React)                  Server (Hono/Bun)
─────────────────────────────────────────────────────
currentPrincipalAtom            PrincipalMiddleware
  ↓ (atom reads user from         ↓ (reads Authorization header)
     principalRuntime layer)       ↓ (resolves PrincipalInfo)
                                   ↓ Effect.provideService(handler, CurrentPrincipal, p)
                                   ↓
rpcProtocolHttpLayer             handler: yield* CurrentPrincipal
  ↓ injects Authorization hdr     ↓ ownership check
  ↓ via PrincipalMiddlewareClientLive
```

---

## 5 · Best Practices

### 5.1 Declare the principal once; route adapters through it

Per lattice stack convention: *"When a capability crosses services, RPC handlers,
remote clients, and UI commands, define the command contract once and route adapters
through it."*

`CurrentPrincipal` is that single source of truth. Do not:

- Pass `userId` as an explicit RPC payload field *in addition to* the principal
  service — this creates two out-of-sync sources.
- Read the `Authorization` header in individual handlers — delegate to the
  middleware; handlers just `yield* CurrentPrincipal`.

### 5.2 Use `Context.Service` for required principals, `Context.Reference` for ambient ones

| Scenario | API |
|---|---|
| Server-side handler; every call must be authenticated | `Context.Service` (fails to compile if not provided by middleware) |
| Atoms with an anonymous fallback; works before login | `Context.Reference` with `{ defaultValue: () => anonymous }` |

### 5.3 Middleware error schema — always provide one for auth failures

`RpcMiddleware.Service` accepts an `error` option for a schema-backed typed failure
type. Without it, auth failures surface only as defects (non-typed). With it,
clients can `Effect.catchTag("UnauthorizedError", ...)` precisely.

```ts
export class PrincipalMiddleware extends RpcMiddleware.Service<
  PrincipalMiddleware,
  {
    provides: CurrentPrincipal
    error: UnauthorizedError   // ← typed; crosses wire with _tag
  }
>()("PrincipalMiddleware", { error: UnauthorizedError }) {}
```

### 5.4 Schema evolution: optional first, required later

Adding `ownerId` to existing payloads:

1. **Phase 1 (additive):** `Schema.optionalKey(Schema.String)` — old clients/servers
   interoperate; missing key decodes cleanly.
2. **Phase 2 (required):** Use `.extend()` on the class to override the field to
   `Schema.String`. Old senders break; only deploy when all callers are updated.

Do not use `Schema.optional` (= `T | undefined`) when you mean `Schema.optionalKey`
(= key may be absent from encoded form). The distinction matters for JSON serialization.

### 5.5 keepAlive on seeded layer atoms

The existing `library-atoms.ts` comment explains why:

> `keepAlive` on all seeded layer atoms: composition roots seed these ONCE via
> `useAtomInitialValues`; without `keepAlive` the registry disposes unsubscribed
> nodes and later reads silently fall back to the defaults.

**Always** pipe `.pipe(Atom.keepAlive)` on any layer atom seeded by a composition
root, including `currentPrincipalLayerAtom`.

### 5.6 Test layers — same pattern as the existing fixtures

The `install-control-authorization.ts` tests show the established pattern:

```ts
Effect.provide(
  handler(payload),
  Layer.succeed(CurrentInstallControl, { authorized: true }),
)
```

For principal tests:

```ts
Effect.provide(
  handlerUnderTest(payload),
  Layer.succeed(CurrentPrincipal, { id: "test-user", kind: "authenticated" }),
)
```

No `Mock*` / `Stub*` prefixes — just `Layer.succeed` with a fixed value, or a
configurable `makePrincipalMiddlewareFixture(principal)` helper.

---

## 6 · Common Issues

### 6.1 "Service not found" crash when reading CurrentPrincipal in a handler

**Symptom:** Handler compiles but crashes at runtime with a missing-service error.

**Cause:** `PrincipalMiddleware` is not attached to the RPC group (`.middleware(PrincipalMiddleware)`
not called), or the handler runs outside the middleware-provided scope.

**Fix:** Ensure every RPC group that exposes endpoints needing auth calls
`.middleware(PrincipalMiddleware)`. The middleware's `provides: CurrentPrincipal`
automatically satisfies the handler's `R` requirement at the type level — if types
check, the service is present at runtime.

### 6.2 Atom stale after user switch

**Symptom:** After updating `currentPrincipalLayerAtom`, a derived atom still
returns data for the old user.

**Cause:** The atom is observed via a non-reactive path, or `keepAlive` on the
derived atom is caching across the switch.

**Fix:**
- Layer atoms invalidate their runtime; all `libraryRuntime.atom(...)` atoms
  automatically go `Waiting → rebuild`. Components reading via `useAtomValue`
  will re-render.
- Derived atoms that cached user A's data but are not within the principal runtime
  are not automatically invalidated. Use `useAtomRefresh` explicitly, or model the
  atom inside the principal runtime so it rebuilds naturally.

### 6.3 `Context.Reference` default prevents fail-fast on missing auth

**Symptom:** Handler reads the principal but gets the anonymous default instead of
failing.

**Cause:** `Context.Reference` always succeeds (default is returned). If you need
to force failure when no real principal is injected, use `Context.Service` instead.

**Fix:** Switch to `Context.Service` for endpoints that must be authenticated.
Reserve `Context.Reference` for genuinely optional / anonymous-is-ok surfaces.

### 6.4 Schema.optionalKey vs Schema.optional mismatch on wire

**Symptom:** `ownerId` is `undefined` in the handler even though the client sent it.

**Cause:** Client payload class uses `Schema.optional` (which encodes `undefined`
values), while server class uses `Schema.optionalKey` (key must be absent). The two
schemas produce different encoded forms.

**Fix:** Both sides must agree. For a key that callers can simply omit, both sides
use `Schema.optionalKey`. Use `Schema.optional` only when you need to distinguish
"missing" from "explicitly undefined".

### 6.5 Middleware order and type inference

**Symptom:** TypeScript error says `CurrentPrincipal` is still in `R` after adding
the middleware.

**Cause:** Middleware is attached in the wrong order, or the wrong `provides` type
parameter is set.

**Fix:** Verify:
1. `class PrincipalMiddleware extends RpcMiddleware.Service<M, { provides: CurrentPrincipal }>()("...")`.
2. `.middleware(PrincipalMiddleware)` is on the correct `RpcGroup` (the one that
   wires the handlers with `CurrentPrincipal` in `R`).

---

## 7 · API Quick-Reference

### Context

```ts
import { Context, Effect } from "effect"

// Required service (no default)
class CurrentPrincipal extends Context.Service<CurrentPrincipal, PrincipalInfo>()(
  "CurrentPrincipal",
) {}

// Ambient service with default (v4 replacement for v3 FiberRef)
const CurrentPrincipal = Context.Reference<PrincipalInfo>("CurrentPrincipal", {
  defaultValue: () => ({ id: "anonymous", kind: "anonymous" }),
})

// Read (works for both)
const p = yield* CurrentPrincipal

// Override for a scope (replaces v3 Effect.locally)
Effect.provideService(innerEffect, CurrentPrincipal, { id: "user-1", kind: "authenticated" })
```

### RpcMiddleware

```ts
import { RpcMiddleware } from "effect/unstable/rpc"
import { Layer, Effect, Schema } from "effect"

class MyMiddleware extends RpcMiddleware.Service<
  MyMiddleware,
  {
    provides: SomeService         // removes SomeService from handler R
    requires: SomeDependency      // adds SomeDependency to middleware R
    error: MyErrorSchema          // typed wire error
  }
>()("MyMiddleware", { error: MyErrorSchema }) {}

// Server implementation
const MyMiddlewareLive = Layer.succeed(MyMiddleware)(
  (effect, { headers, rpc, payload }) =>
    Effect.provideService(effect, SomeService, derivedValue),
)

// Client implementation (header injection, retry, etc.)
const MyMiddlewareClientLive = RpcMiddleware.layerClient(
  MyMiddleware,
  ({ next, request }) => next({ ...request, headers: { ...request.headers, "x-my-header": value } }),
)

// Attach to group
rpcGroup.middleware(MyMiddleware)
```

### Atom.runtime and layer atoms

```ts
import * as Atom from "effect/unstable/reactivity/Atom"
import { Layer } from "effect"

// 1. Layer atom (writable, holds the current layer impl)
const myServiceLayerAtom = Atom.make(defaultLayer).pipe(Atom.keepAlive)

// 2. Runtime derived from the layer atom
const myRuntime = Atom.runtime(get => get(myServiceLayerAtom))

// 3. Atoms that run inside that runtime
const myDataAtom = myRuntime.atom(
  Effect.gen(function* () {
    const svc = yield* MyService
    return yield* svc.getData()
  }),
)

// 4. Function atoms (mutations)
const myMutationAtom = myRuntime.fn<InputType>()(input =>
  Effect.gen(function* () {
    const svc = yield* MyService
    return yield* svc.doThing(input)
  }),
)
```

### @effect/atom-react hooks

```ts
import { useAtomValue, useAtomSet, useAtomInitialValues, useAtomRefresh } from "@effect/atom-react"

// Seed layer atoms once per registry (composition root)
useAtomInitialValues([
  [myServiceLayerAtom, concreteLayer],
] as const)

// Read
const data = useAtomValue(myDataAtom)

// Write / mutate (promiseExit mode for full Exit inspection)
const run = useAtomSet(myMutationAtom, { mode: "promiseExit" })
const exit = await run(input)

// Refresh
const refresh = useAtomRefresh(myDataAtom)
```

### Schema error classes

```ts
import { Schema } from "effect"

class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  {
    reason: Schema.Literals(["missing-token", "invalid-token", "unknown-owner"]),
    message: Schema.String,
  },
) {}

// Use in RPC error union
const RpcError = Schema.Union([ApiError, UnauthorizedError])

// Catch by tag on client
Effect.catchTag("UnauthorizedError", (e) => handleAuth(e))
```

---

## 8 · References

| Resource | Path / URL |
|---|---|
| `RpcMiddleware` type declarations | `node_modules/effect/dist/unstable/rpc/RpcMiddleware.d.ts` |
| `RpcGroup` type declarations | `node_modules/effect/dist/unstable/rpc/RpcGroup.d.ts` |
| `Atom` type declarations | `node_modules/effect/dist/unstable/reactivity/Atom.d.ts` |
| `AtomRpc` (AtomRpcClient, query/mutation) | `node_modules/effect/dist/unstable/reactivity/AtomRpc.d.ts` |
| `@effect/atom-react` hooks | `node_modules/@effect/atom-react/dist/Hooks.d.ts` |
| `RegistryContext` / `RegistryProvider` | `node_modules/@effect/atom-react/dist/RegistryContext.d.ts` |
| `Context` (Service + Reference) | `node_modules/effect/dist/Context.d.ts` |
| `References` (v4 built-in references) | `node_modules/effect/dist/References.d.ts` |
| v4 FiberRef → Context.Reference migration | https://github.com/Effect-TS/effect-smol/blob/main/migration/fiberref.md |
| Existing middleware pattern (feature gates) | `product/platform/gates/middleware.ts` |
| Existing middleware pattern (install control) | `product/apps/portal/api/plugin-install/install-control-authorization.ts` |
| Existing RPC group assembly | `product/apps/portal/api/server/rpc-group.ts` |
| Existing layer atom + runtime pattern | `product/platform/react/library/library-atoms.ts` |
| Existing composition root pattern | `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` |
| Existing rpc protocol layer (client headers) | `product/platform/api/rpc/client-layer.ts` |
| Existing Schema.TaggedErrorClass usage | `product/platform/api/rpc/errors.ts` |
