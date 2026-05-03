---
title: "\"Failed to send HTTP request\" in real-RPC tests means window.location.pathname is unset"
date: 2026-05-02
category: integration-issues
module: testing
problem_type: integration_issue
component: testing_framework
symptoms:
  - 'runRpc(...) rejects with RpcClientError "Failed to send HTTP request" in a test that uses withRpcServer'
  - 'A globalThis.fetch shim installed to debug it never gets called'
  - 'The harness URL is reachable via a direct fetch() in the same test environment'
  - 'Cause inspection at mapProtocolError shows RequestError: InvalidUrl (POST /api/rpc)'
root_cause: incomplete_setup
resolution_type: test_fix
severity: medium
related_components:
  - tooling
tags:
  - effect-rpc
  - happy-dom
  - bun-test
  - real-implementations
  - fetch
  - window-location
---

# "Failed to send HTTP request" in real-RPC tests means window.location.pathname is unset

## Problem

When writing a test that exercises a React hook (or any browser-side caller) through the real `runRpc` client against an in-process Hono server (`withRpcServer`), the test rejects with `RpcClientError: Failed to send HTTP request`. The error fires within milliseconds and never touches the network — but the message strongly implies a transport problem, sending the investigation in the wrong direction.

This shows up the moment you add the *third* test in the "prefer real implementations" testing posture for a renderer-side seam: the unit tests against handlers work fine because they call `Effect.runPromise(handler(...))` directly, but the hook test goes through the full `runRpc` → `RpcClient` → `HttpClientRequest` → `fetch` chain.

## Symptoms

- `runRpc(...)` rejects with `RpcClientError: Failed to send HTTP request`.
- A `globalThis.fetch` shim installed inside the test to log/intercept requests is **never called**.
- A direct `await fetch("/api")` in the same test process works (the harness is up and reachable).
- A direct `await runRpc(c => c.app["library.list"]({}))` from a non-React test works *if* the test sets `window.location.pathname`.
- Surfacing the wrapped cause via `mapProtocolError`'s `cause` field reveals: `RequestError: InvalidUrl error (POST /api/rpc)`.

## What Didn't Work

- **Overriding only `window.location.origin` and `window.location.href`** to point at the harness — left `pathname` undefined, so the URL build still failed.
- **Adding a `globalThis.fetch` shim** that rewrites `/api/rpc` to the absolute harness URL — useless, because the URL build happens *before* fetch and fails synchronously. The shim is never invoked.
- **Suspecting Bun fetch's relative-URL handling** — happy-dom installs its own `fetch` (`globalThis.fetch === window.fetch`) which *does* handle relative URLs once `window.location` is fully populated. Bun's bare fetch isn't the relevant code path in tests.
- **Suspecting a stale runtime cache in `runRpc`** — the runtime is module-lazy and built per process; the URL build is per-request. Not the cause.

Each of these eats roughly 5–10 minutes when the error message is "Failed to send HTTP request" and the only stack trace points at `client.ts:94` (the HTTP send-and-batch loop), which makes it look like a fetch/network problem.

## Solution

Override **three** `window.location` fields in the test setup, not two:

```ts
const harness = await withRpcServer()

Object.defineProperty(window.location, "origin", {
  value: harness.url,
  writable: true,
  configurable: true,
})
Object.defineProperty(window.location, "href", {
  value: `${harness.url}/`,
  writable: true,
  configurable: true,
})
Object.defineProperty(window.location, "pathname", {
  value: "/",
  writable: true,
  configurable: true,
})
```

That's the entire fix. No `fetch` shim, no custom `RpcClientLive`, no module-mocking. happy-dom's `fetch` correctly resolves relative URLs against the populated `window.location`, and the test exercises the full real RPC roundtrip — the production `runRpc` runtime, the production `RpcClientLive` layer, the production `prependUrl("/api/rpc")` transform, the real Hono handlers, the real source/launcher.

Restore the original location values in `afterEach` so other tests in the file (or other files) aren't poisoned.

## Why This Works

`@effect/platform/UrlParams.makeUrl` builds the request URL using:

```js
const baseUrl = () => {
  if ("location" in globalThis &&
      globalThis.location !== undefined &&
      globalThis.location.origin !== undefined &&
      globalThis.location.pathname !== undefined) {
    return location.origin + location.pathname
  }
  return undefined
}
const urlInstance = new URL(url, baseUrl())
```

The HttpClient's `prependUrl("/api/rpc")` produces a relative URL string (`"/api/rpc"`). When `globalThis.location.pathname` is `undefined`, `baseUrl()` returns `undefined`, and `new URL("/api/rpc", undefined)` throws a `TypeError`. Effect's `client.make(...)` catches that and converts it to `RequestError({ reason: "InvalidUrl" })`, which the RPC layer's `Effect.mapError(mapProtocolError)` then wraps as `RpcClientError({ reason: "Protocol", message: "Failed to send HTTP request" })`. The wrapping is what makes the message misleading — by the time it surfaces it looks like a transport failure.

happy-dom's `GlobalRegistrator.register()` populates `window.location.origin` and `window.location.href` to defaults (e.g., `"http://localhost:3000"`), but `pathname` may be left undefined or unset depending on registration order. The test suite's `tools/testing/happydom.ts` setup explicitly sets `origin` and `href` but not `pathname`. So the third field is the one that matters for Effect's URL-build path, and it's the one most easily missed because the symptom doesn't point at it.

## Prevention

- **In tests that exercise real RPC, set all three location fields together** — origin, href, **and** pathname — and restore them in afterEach. Treat them as a unit, not as separate overrides:

  ```ts
  function pointWindowAtHarness(harness: { url: string }) {
    const previous = {
      origin: window.location.origin,
      href: window.location.href,
      pathname: window.location.pathname,
    }
    Object.defineProperty(window.location, "origin", {
      value: harness.url, writable: true, configurable: true,
    })
    Object.defineProperty(window.location, "href", {
      value: `${harness.url}/`, writable: true, configurable: true,
    })
    Object.defineProperty(window.location, "pathname", {
      value: "/", writable: true, configurable: true,
    })
    return () => {
      Object.defineProperty(window.location, "origin", { ...previous, writable: true, configurable: true, value: previous.origin })
      Object.defineProperty(window.location, "href", { writable: true, configurable: true, value: previous.href })
      Object.defineProperty(window.location, "pathname", { writable: true, configurable: true, value: previous.pathname })
    }
  }
  ```

  Worth promoting into `tools/testing/library/with-rpc-server.ts` itself (e.g., `pointWindowAtRpcHarness(harness)`) the second time we write a hook test that needs it.

- **When a test suite reports "Failed to send HTTP request" and a `fetch` shim isn't called**, the failure is *upstream of fetch*. First debugging move: log the cause via `error.cause` rather than the wrapped message. Effect's `RpcClientError` swallows the original `RequestError` reason inside the cause chain, but it's there.

- **In `tools/testing/happydom.ts`**, consider setting a default `window.location.pathname = "/"` alongside the existing `origin` / `href` defaults. That would mean future tests that need only the default origin don't need to know about the gotcha at all. (Out of scope here because no current test relies on the absence; flagging as a candidate cleanup.)

## Related Issues

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — the testing posture that surfaced this gotcha. Tests that mock `runRpc` never hit the URL-build path, so this only bites code following the real-implementations rule.
- `tools/testing/library/with-rpc-server.ts` — the in-process Hono harness this gotcha applies to.
- `tools/testing/happydom.ts` — the registration site that already overrides `origin` / `href` and is the natural home for a pathname default.
