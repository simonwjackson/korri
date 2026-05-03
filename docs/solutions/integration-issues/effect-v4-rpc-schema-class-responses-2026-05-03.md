---
title: Effect v4 RPC Schema.Class handlers must return class instances
date: 2026-05-03
category: integration-issues
module: korri/shared/api/rpc + korri/products/app/api
problem_type: integration_issue
component: tooling
symptoms:
  - Real RPC-layer integration tests failed with "Expected ListLibraryResponse" even though handler tests passed.
  - Plain object handler returns decoded locally but failed after crossing the Effect v4 RPC transport.
  - The missing coverage only appeared after testing RPC-backed Effect layers against a real in-process server.
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [effect-rpc, effect-v4, schema-class, rpc, testing]
---

# Effect v4 RPC Schema.Class handlers must return class instances

## Problem

During the Effect v4 atom-layer migration, direct handler tests for `app.library.list` passed, but a new real RPC-layer integration test failed while decoding the same response through the production `RpcClientLive`. The server returned the right plain JSON shape, but Effect v4's RPC success schema expected a `Schema.Class` instance at the handler boundary.

## Symptoms

- `LibrarySourceLayerRpc` over `withRpcServer()` failed on `app.library.list` with:

  ```text
  Expected ListLibraryResponse, got {"games":[...]}
    at ["value"]
  ```

- Direct handler tests still passed because they asserted `response.games` on the in-process handler result.
- The launch RPC path worked because its success schema is a plain `Schema.Union` of `Schema.Struct` values, not a `Schema.Class` response.

## What Didn't Work

- Testing only `handleListLibrary({})` with `Effect.runPromise(...)` was too shallow. It proved the handler returned the expected TypeScript shape, but it did not exercise Effect RPC's server-side success encoder or the client-side decoder.
- Checking raw response shape would have hidden the same class of bug. The value looked like `{ games: [...] }`, but the v4 RPC schema contract cared that the value satisfied `ListLibraryResponse`.
- Treating the failure as an HTTP, URL, or layer-composition problem was misleading. The same in-process server and client successfully reached the route; the failure happened while decoding the RPC `Exit` value.

## Solution

Return constructed `Schema.Class` instances from RPC handlers whose success schema is a class.

Before:

```ts
export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    return { games }
  })
```

After:

```ts
import { type ListLibraryPayload, ListLibraryResponse } from "./list.rpc"

export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    return new ListLibraryResponse({ games })
  })
```

The same rule applies to other `Schema.Class` success responses:

```ts
export const handleGetHello = (payload: typeof GetHelloPayload.Type) =>
  Effect.succeed(
    new HelloResponse({
      message: `Hello, ${payload.name?.trim() || "template"}. Effect RPC is ready.`,
      timestamp: new Date().toISOString(),
    }),
  )
```

Then add a browser-equivalent RPC-layer test that exercises the production client and server together:

```ts
await using server = await withRpcServer()
await using lib = await seedLibrary()
pointWindowAt(server.url)
configureLibraryEnv(lib)

const games = await Effect.runPromise(
  Effect.gen(function* () {
    const source = yield* LibrarySource
    return yield* source.list()
  }).pipe(Effect.provide(LibrarySourceLayerRpc)),
)

expect(games.map(game => game.metadata?.name)).toEqual(["RPC Echo"])
```

## Why This Works

`Schema.Class` represents more than a structural object shape in the v4 RPC path. A direct handler call can consume a plain object because TypeScript and ordinary property access are structural, but the RPC server/client boundary runs the declared success schema. Constructing `new ListLibraryResponse({ games })` gives the RPC encoder the value shape the schema expects, and the client decoder receives the corresponding encoded representation.

The integration test matters because it covers all of the seams that direct handler tests skip:

1. The production Hono app mounted by `withRpcServer()`.
2. `RpcServer.toHttpEffect(appRpcGroup)` and the v4 serialization layer.
3. `RpcClientLive` using the same URL/header transforms as the browser.
4. The RPC-backed Effect layer (`LibrarySourceLayerRpc` / `LauncherLayerRpc`).
5. The declared success schema decode on the returned `Exit` value.

## Prevention

- When an RPC success schema is declared as `Schema.Class`, return `new ResponseClass(...)` from the handler rather than a plain object.
- Keep direct handler tests, but add at least one real RPC client/server test for each new production client layer. Direct tests prove business logic; RPC-layer tests prove wire/schema compatibility.
- If a direct handler test uses `response.games`, add a companion RPC test that decodes through the actual client before assuming the contract is safe.
- Plain `Schema.Struct` / `Schema.Union` response schemas do not require class construction, so do not cargo-cult `new` into every RPC handler. Apply this rule specifically when the success schema is a `Schema.Class`.

## Related Issues

- `docs/solutions/integration-issues/effect-rpc-json-dates-need-decodable-schemas-2026-05-03.md` — another Effect RPC failure where raw JSON shape looked correct but the real client decoder rejected the value.
- `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md` — setup required for browser-equivalent RPC tests that use relative `/api/rpc` URLs.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — why these tests should use real in-process servers and real clients rather than mocked transport.
