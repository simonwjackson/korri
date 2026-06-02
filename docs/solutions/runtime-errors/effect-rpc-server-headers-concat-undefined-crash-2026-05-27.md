---
title: Effect-RPC RpcServer crashes when a client omits the wire `headers` field
date: 2026-05-27
category: runtime-errors
module: korri/shared/api/rpc + effect/unstable/rpc
problem_type: runtime_error
component: tooling
symptoms:
  - 'FATAL "BUG: RpcServer protocol crashed TypeError: undefined is not an object (evaluating ''const [k, v] of input'')"'
  - "Crash trace points at `fromInput2` (Headers.fromInput) called from `onSuccess` deep inside the Effect runtime"
  - "Whole `/api/rpc` pipeline returns 500/timeout for the lifetime of the bun process even though systemd shows the unit active"
  - "Crash reproduces from a perfectly normal `app.library.list` POST with `payload: {}` and no `headers` field"
root_cause: wrong_api
resolution_type: code_fix
severity: critical
tags: [effect-rpc, federation, korri-server, http, headers, protocol-crash]
---

# Effect-RPC RpcServer crashes when a client omits the wire `headers` field

## Problem

When a `/api/rpc` request body omits the optional `headers` field on a
`Request` frame, Effect's `RpcServer` (effect@4.0.0-beta.60 through
4.0.0-beta.71 at minimum) crashes with a FATAL protocol defect that
takes down the entire RPC pipeline for the lifetime of the bun process.
systemd still considers `korri-server` "active" because the bun runtime
is alive — it just cannot serve any RPC, so every subsequent request
500s or times out until the unit is restarted.

This was latent on `127.0.0.1:3001` deploys but became immediately
weaponizable when federation v1 flipped the default bind to
`0.0.0.0:3001` + mDNS-advertised: any LAN client (including a normal
Korri RPC client that does not happen to send `headers`) crashes the
server with a one-liner POST.

## Symptoms

```
FATAL (#6): BUG: RpcServer protocol crashed
  TypeError: undefined is not an object (evaluating 'const [k, v] of input')
      at fromInput2 (.../korri-server.js:66456:23)
      at onSuccess (.../korri-server.js:74528:34)
      at runLoop (...)
```

Reproduction (when `korri-server` is running, before this fix):

```bash
curl -sS --max-time 15 -X POST http://127.0.0.1:3001/api/rpc \
  -H 'content-type: application/json' \
  -d '{"_tag":"Request","id":"1","tag":"app.library.list","payload":{}}'
# → curl times out; journalctl shows the FATAL above.
```

## What Didn't Work

- **Upgrading Effect**: confirmed the bug is still present in the latest
  beta (`4.0.0-beta.71`) — same `RpcServer.js` code path, same
  unguarded call site. An upgrade alone does not fix it.
- **Defensive validation rejecting only obviously malformed envelopes**
  (e.g. `headers: [null]`) **was not sufficient**: a request that
  omits `headers` entirely is "valid" by every reasonable schema, yet
  still triggers the crash. The fix has to *normalize*, not just
  *validate*.
- **Replacing the HTTP framework** (Hono → bun.serve etc.) does not help
  — the bug is in Effect's own `RpcServer`, downstream of whatever
  webserver routes to it.

## Solution

A middleware (`korri/shared/api/rpc/envelope-guard.ts`) sits in front of
the `/api/rpc` Hono route. It does two things on every incoming
request:

1. Validates the envelope shape against the subset Effect actually
   consumes (single frame OR array of frames; each Request frame has
   string `_tag`/`id`/`tag`; `headers`, when present, is
   `Array<[string, string]>`). Malformed envelopes are rejected with
   400 + a forensic log including a body sample and remote hint.
2. **Normalizes** every Request frame so `headers` is always a concrete
   `[]` before reaching `RpcServer`. The body is then re-stringified
   and forwarded as a fresh `Request` to the real RPC handler.

Key normalization function:

```typescript
function normalizeFrame(frame: unknown): unknown {
  if (
    frame === null ||
    typeof frame !== "object" ||
    Array.isArray(frame) ||
    (frame as { _tag?: unknown })._tag !== "Request"
  ) {
    return frame
  }
  const req = frame as { readonly headers?: unknown }
  if (Array.isArray(req.headers)) return frame
  return { ...frame, headers: [] }
}
```

Wired in `korri/products/app/api/hono-app.ts` inside `handleRpc`:

```typescript
const guard = await guardRpcEnvelope(request, { logger })
if (guard.response) return guard.response
const forwarded = new Request(request.url, {
  method: request.method,
  headers: request.headers,
  body: guard.forwardableBody, // the normalized, re-stringified envelope
})
return selectedRpcHandler(forwarded)
```

## Why This Works

The root cause is one line inside Effect itself
(`node_modules/effect/dist/unstable/rpc/RpcServer.js:651`):

```js
message.headers = requestHeaders.concat(message.headers)
```

When the JSON body omits `headers`, `message.headers === undefined`.
JavaScript's `Array.prototype.concat` treats `undefined` as a
**single value** to append rather than as "nothing":

```js
[].concat(undefined) // → [undefined]   (NOT [])
```

That `[undefined]` is then handed to `Headers.fromInput(message.headers)`
at the `Symbol.iterator in input` branch. `for (const [k, v] of [undefined])`
yields `undefined`, tries to destructure `[k, v]` from `undefined`, and
throws the `TypeError`. The throw inside the Effect runtime is caught
as a protocol defect rather than scoped to the single request, which is
what kills the whole pipeline.

Pre-populating `headers: []` makes the concat a no-op
(`requestHeaders.concat([]) === requestHeaders`), so the crash path is
never entered. The validation half catches the *other* shape of this
bug (`headers: [null]` etc.) before it reaches the same iteration.

## Prevention

- **`korri/shared/api/rpc/envelope-guard.test.ts`** covers both the
  reject-malformed and inject-empty-headers paths (22 tests). The
  validator-only tests catch regressions of the original framing; the
  normalize tests catch regressions of the actual crash.
- **Upstream**: this is worth a bug report against Effect-RPC. The
  framework should default `message.headers` to `[]` before the
  concat, or `Headers.fromInput` should defensively skip undefined
  iterator yields. Confirmed present in beta.71.
- **Operational signal**: if a single FATAL `RpcServer protocol crashed`
  appears in journald, the unit cannot recover by itself — `systemctl
  restart korri-server` is required. The guard removes the trigger; an
  alert on this exact log line would have caught it within minutes
  before federation v1 made it routine.
- **Architectural rule of thumb**: every framework that hands you a
  protocol defect channel is a place to put a thin shape-validator in
  front. Trusting an upstream library's input validation is a habit
  worth breaking when the failure mode is "kill the pipeline forever."

## Related Issues

- `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md` —
  earlier Effect v4 RPC framing issue; same family of "RPC transport is
  finicky about shapes the schema doesn't catch."
- Commits: `d441e37` (validation + forensics), `d679e0e` (the actual
  normalization fix).
