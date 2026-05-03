---
title: Effect RPC JSON date fields need encoded-side decoders in browser clients
date: 2026-05-03
category: integration-issues
module: korri/shared/fixtures/games + @shared/api/rpc
problem_type: integration_issue
component: tooling
symptoms:
  - Odin Chromium kiosk loaded the Korri shell but showed "Could not load library."
  - Direct curl to /api/rpc app.library.list succeeded, but the browser useRpcQuery path failed.
  - The smoke script passed while the real browser still failed because it only checked raw JSON shape.
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [effect-rpc, schema, json, dates, chromium, odin]
---

# Effect RPC JSON date fields need encoded-side decoders in browser clients

## Problem

When Korri was opened in Chromium kiosk mode on the Odin, the app shell loaded but the home page rendered `Could not load library.` The API was healthy and `app.library.list` returned games, so the failure was in the browser-side RPC decode path rather than the server handler.

## Symptoms

- The Odin screenshot showed the React error state: `Could not load library.`
- `curl http://127.0.0.1:3100/api/health` from the Odin returned `{"status":"ok"}`.
- A manual `POST /api/rpc` for `app.library.list` returned a successful Effect RPC `Exit` envelope with games.
- Chrome remote debugging showed the page was loaded correctly, but `useRpcQuery(client => client.app["library.list"]({}))` landed in the error branch.

## What Didn't Work

- Restarting Chromium did not fix it. The proxy and tunnel were already working; the page repeatedly failed after loading the same successful JSON response.
- Checking only the raw JSON `{ games: [...] }` shape in `tools/scripts/odin-smoke-rpc.ts` was not enough. That smoke passed while the real client failed because it did not run the same Effect Schema decoder as the browser RPC client.
- Treating the problem as a network/proxy issue was misleading. `/api/health` and `/api/rpc` both worked from the Odin through the same URL Chromium was using.

## Solution

Use a schema that can decode the JSON-encoded wire representation of the date field, not only in-memory `Date` objects.

Before:

```ts
export const GameUserData = Schema.Struct({
  lastPlayed: Schema.optional(Schema.DateFromSelf),
  playtime: Schema.optional(Schema.Number),
  favorite: Schema.optional(Schema.Boolean),
})
```

`Schema.DateFromSelf` accepts `Date` instances. Over Effect RPC's JSON transport, the server-side `Date` becomes an ISO string, so the browser receives:

```json
{
  "userData": {
    "lastPlayed": "2026-05-01T09:47:04.000Z"
  }
}
```

After:

```ts
export const GameUserData = Schema.Struct({
  lastPlayed: Schema.optional(
    Schema.Union(Schema.DateFromSelf, Schema.DateFromString),
  ),
  playtime: Schema.optional(Schema.Number),
  favorite: Schema.optional(Schema.Boolean),
})
```

This preserves support for local in-memory tests and helpers that pass `Date` objects while also allowing browser RPC responses to decode ISO strings back into `Date` values.

The smoke script was also tightened so it decodes the RPC value through the real response schema instead of checking only raw shape:

```ts
value = Schema.decodeUnknownSync(ListLibraryResponse)(exitEnvelope.exit.value)
```

That makes the smoke fail for the same class of schema/wire mismatch that broke Chromium.

## Why This Works

The failing path was:

1. `createRocknixSource()` parsed `lastPlayed` into a `Date`.
2. The API returned a `ListLibraryResponse` through Effect RPC's JSON transport.
3. JSON serialization encoded the `Date` as an ISO string.
4. The browser RPC client decoded the response using `GameRecord` / `GameUserData`.
5. `Schema.DateFromSelf` rejected the ISO string, so `runRpc()` surfaced an error and `useRpcQuery()` rendered the page's error state.

`Schema.DateFromString` is the correct encoded-side decoder for this transport boundary. Wrapping it in a union with `DateFromSelf` keeps existing direct decoder tests valid without pretending JSON can carry a `Date` instance.

## Prevention

- For schemas that cross JSON/RPC boundaries, prefer encoded-side decoders (`DateFromString` for ISO dates) over `DateFromSelf` unless the value is guaranteed to stay in-process.
- When a smoke test exercises Effect RPC, decode the `Exit` value with the same success schema the app uses. A raw `games` array assertion is too weak.
- Include at least one browser or browser-equivalent verification when validating RPC-backed UI. `curl` can prove the server works but cannot prove the client decoder accepts the wire shape.
- Keep direct schema tests for both local and wire forms when a shared schema is used in both contexts:

  ```ts
  expect(decodeGameRecord({ id: "x", userData: { lastPlayed: new Date() } })).toBeDefined()
  expect(decodeGameRecord({ id: "x", userData: { lastPlayed: "2026-05-01T09:47:04.000Z" } })).toBeDefined()
  ```

## Related Issues

- `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md` — another browser/client-side Effect RPC failure where the surfaced error looked like transport trouble but the root cause was client runtime setup.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — reinforces why smoke tests should exercise real schemas and real RPC wiring instead of mocked response shapes.
