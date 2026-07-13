---
title: "feat: Finish the unified plugin API (one capable HTTP surface, no bundled bypass)"
type: feat
status: active
date: 2026-07-12
origin: work/items/parking-lot/01KXC8EAAD647X5PBTYMP06T6E-enable-rom-site-downloads-via-plugin-http-capability-additio.md
verify_command: "bun test product/platform/plugin product/platform/acquisition product/plugins/itchio"
---

# feat: Finish the unified plugin API (one capable HTTP surface, no bundled bypass)

## Summary

Grow `context.services.http` from a GET-returning-string helper into a real HTTP client — method + body (POST), binary responses, response status/headers, and a per-provider cookie jar — so bundled, local, and future third-party plugins share one capable API. Then migrate itchio off its `fetchImpl ?? fetch` bypass so the reference bundled plugin proves the unified surface is sufficient. The ROM-site download gaps (wowroms POST form, cookie/referer-gated CDNs) are the acceptance driver, not a special-cased fix.

---

## Problem Frame

The plugin ecosystem work (see `work/items/active/20260703-plugin-ecosystem-api/plan.md`) established one `plugin -> contributes -> handlers -> operation -> run(context)` model for all plugin tiers. But acquisition downloads exposed a hole in that promise: local `.mjs` plugins can only reach `context.services.http.text/json` — GET that returns a string, no POST/body, no binary, no cookies, no status codes (`product/platform/plugin/services.ts:11-19`; runtime impl `product/platform/acquisition/plugin-runtime.ts:70-82`). The one plugin that performs hard, multi-step downloads — itchio — sidesteps the unified API entirely: its handler context is `{ clock, logger, env }` with **no `services`**, and it closes over the daemon's global `fetch` (`product/plugins/itchio/src/definition.ts:114` — `const fetchImpl = options.fetchImpl ?? fetch`). So "one unified API" is currently violated not by restricting local plugins but by letting the bundled plugin escape the API through its compile-time privilege. Operator-installed ROM-site plugins can't follow because the sandbox never exposes the same power (origin: 01KXC8EA).

---

## Requirements

- R1. `context.services.http` supports non-GET methods with a request body, so a plugin can submit a POST download form.
- R2. `context.services.http` can return raw binary bytes, response status, and response headers — not only decoded text/json.
- R3. A per-provider cookie jar persists `Set-Cookie` across sequential `http` calls within one provider's operation, and into the daemon's byte-fetch, so session/referer-gated CDNs work.
- R4. A resolve-download plugin can attach request headers to its `FinalDownload` that the daemon forwards when fetching bytes.
- R5. itchio performs search, details, resolve-download, and acquire through `context.services.http` — the `fetchImpl ?? fetch` bypass is removed (a test seam may remain, sourced from services).
- R6. Outbound URL safety validation (`validateOutboundHttpUrl`) and the existing size cap still apply to every capable-client request and the daemon byte-fetch.
- R7. The unified surface is identical for bundled and local plugins — no capability is reachable by one tier and not the other.
- R8. End-to-end proof: at least one operator ROM-site plugin (wowroms) downloads a real ROM via a self-managed `artifact.acquire` using only the unified API, verified on Bandai.

**Origin acceptance examples:** 01KXC8EA criteria — POST support (R1), cookie jar (R3), FinalDownload headers (R4), status visibility (R2), end-to-end ROM download (R8). `.7z` cart discovery from that item is routed to Deferred.

---

## Scope Boundaries

- Not redesigning the `plugin -> contributes -> handlers -> operation` model — only the `services.http` surface and itchio's consumption of it.
- Not adding a headless-browser / JS-execution capability — countdown timers and Cloudflare Rocket Loader challenges that require running page JS remain out of reach and out of scope.
- Not changing the claims/details/search contracts, the config-file plugin policy, or discovery.
- Not building a general retry/interstitial-following state machine in the daemon (NonFinal auto-chase) — noted as follow-up.

### Deferred to Follow-Up Work

- `.7z` (and other archive) cart discovery/extraction so coolrom downloads import — belongs with discovery/placement, not the HTTP API (origin 01KXC8EA). Separate item.
- Daemon interstitial auto-follow: a second `resolve-download` pass after fetching a `NonFinal("interstitial")` URL. Separate item.
- Provider health / `_WORKING`-style surface so broken sources report status instead of returning junk (yt-dlp pattern from the best-practices research). Separate item.
- Migrating the other bundled acquisition-capable plugins (if any beyond itchio) off any direct-`fetch` usage — audit and follow up if found.
- Porting the bazzar `.mjs` search fixes / self-managed acquires as first-party fixtures into the korri repo (the plugins live in the external `bazzar-plugins/` folder today).

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/plugin/services.ts` — `PluginHttpRequestOptions` (query/headers/timeoutMs), `PluginHttpServices` (`text`/`json` only), `createProviderScopedPluginServices` (merges caller-provided `http`).
- `product/platform/acquisition/plugin-runtime.ts:40-90` — `createAcquisitionPluginServices` builds `http.text/json` over global `fetch` with `withQuery` + `timeoutSignal`. This is the single place the real client lives.
- `product/platform/acquisition/product-plugin-adapter.ts:46-135,218` — maps `artifact.resolve-download` and `artifact.acquire` handler operations for discovery-loaded local plugins; injects `createProviderScopedPluginServices(...)`. Local plugins already *may* register `artifact.acquire`; they simply lack the HTTP power to implement it.
- `product/platform/acquisition/artifact-acquisition.ts` — `acquireViaResolvedDownload` fetches the `FinalDownload.url` with a bare `fetchImpl(resolution.url, { redirect: "follow" })` (no headers/cookies), then applies `validateOutboundHttpUrl`, the size cap, and `rejectNonArtifactPayload`.
- `product/platform/protocol/acquisition/download-resolution.ts:20-40` — `FinalDownloadResolution` (`url`, `filename?`, `contentType?`) and `NonFinalDownloadResolution` (`reason: interstitial | requires-user-action | unsupported`, `url?`, `choices?`).
- `product/plugins/itchio/index.ts` — handler context is `{ clock, logger, env }` (no `services`); every handler calls `definition.*(acquisitionContext(), input)`.
- `product/plugins/itchio/src/definition.ts:111-260` — `createItchioPluginDefinition({ fetchImpl })`, `const fetchImpl = options.fetchImpl ?? fetch`, threaded into `acquireItchioArtifact`, `publicPageDetails`, `fetchPublicGameData`. Uses full `RequestInit` (`FetchLike = (url, init?) => Promise<Response>`), including the butler CLI client for the authenticated path.

### Institutional Learnings

- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md` and the plugin-ecosystem-api plan established the single-API intent; this plan closes the last capability gap that forced a bypass.
- Session finding (this work's origin): live HTML inspection proved the ROM-site *searches* are correct after the bazzar fixes; the remaining blocker is strictly the HTTP capability, not scraping.

### External References

- Framework-docs audit (this session): capability matrix showing local-plugin `http` is text/GET-only; daemon byte-fetch sends no headers/cookies; `NonFinal` is always terminal.
- yt-dlp extractor model (best-practices research): informs the deferred provider-health surface, not this plan's core.

---

## Key Technical Decisions

- **Grow one `request()` method rather than overload `text`/`json`:** add a single capable `http.request(url, options)` returning `{ status, ok, headers, text(), bytes() }`; keep `text`/`json` as thin sugar over it so existing plugins are untouched. Rationale: additive, back-compatible, one code path to secure.
- **Cookie jar is provider-scoped and operation-lifetime:** the jar is created per provider-scoped services instance (same boundary as `createProviderScopedPluginServices`) so a plugin's multi-hop flow shares cookies, but providers can't read each other's sessions. Rationale: matches the existing trust boundary; avoids a global ambient jar.
- **Daemon byte-fetch reuses the provider client / forwarded headers:** rather than a second bespoke cookie mechanism, the `FinalDownload` may carry `requestHeaders`, and the daemon fetch sends them; when a cookie jar exists for the provider, its cookies are applied too. Rationale: one session model end-to-end, satisfies R3/R4 together.
- **itchio keeps a `fetchImpl` *test seam* but sources it from services, not global `fetch`:** delete the `?? fetch` default; the definition receives its fetch-equivalent from the unified `services.http`. Rationale: preserves itchio's unit tests while removing the privileged escape (R5).
- **Safety stays centralized:** `validateOutboundHttpUrl` + size cap run inside the capable client and the daemon fetch for every method, including POST and redirects. Rationale: a more powerful client must not widen the SSRF/exfil surface (R6).
- **No JS execution:** sites needing runtime JS (coolrom CF token refresh, wowroms countdown *rendering*) stay unsupported; wowroms works because its file POST is reconstructable from static form fields. Rationale: keep the sandbox declarative.

---

## Open Questions

### Resolved During Planning

- *Do local plugins need a different API than bundled ones?* No — they share `run(context).services`. The gap is the surface's thinness plus itchio's bypass. (Confirmed from `itchio/index.ts` context shape and `product-plugin-adapter.ts:218`.)
- *Where does the capable client live?* One place: `createAcquisitionPluginServices` in `plugin-runtime.ts`, consumed by both the local-plugin adapter and (after U4) itchio.
- *Can local plugins already register `artifact.acquire`?* Yes (`product-plugin-adapter.ts:50`) — so no adapter change is needed to let a bazzar plugin self-manage a download once the HTTP power exists.

### Deferred to Implementation

- Exact response object shape (`bytes()` returning `Uint8Array` vs `ArrayBuffer`; header access as `Headers` vs plain record) — settle against the itchio migration's real needs in U4.
- Cookie-jar storage detail (in-memory `Map` keyed by domain/path) and whether redirects within one `request()` must carry cookies — verify against wowroms/CDN behavior during U2/U5.
- Whether `FinalDownload.requestHeaders` or a provider-session handle is the cleaner daemon-forward mechanism — decide in U3 once the jar exists.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

Unified HTTP contract (additive — `text`/`json` become sugar):

```text
PluginHttpRequestOptions {
  method?    "GET" | "POST" | ...        // R1
  body?      string | Uint8Array | form  // R1
  query?     Record<...>                 // existing
  headers?   Record<string,string>       // existing
  timeoutMs? number                      // existing
}

PluginHttpServices {
  text(url, opts?)    -> string          // sugar over request().text()
  json(url, opts?)    -> T               // sugar over request().json()
  request(url, opts?) -> {               // NEW, capable — R2
    status, ok, headers,
    text(), json(), bytes()
  }
}
```

Session flow that must work end-to-end (wowroms-shaped, R3):

```text
plugin.artifact.acquire(context):
  page   = services.http.request(gameUrl)                    # sets cookie A
  form   = parse hidden fields from page.text()
  file   = services.http.request(postUrl, {                  # sends cookie A
             method:"POST", body: form, ... })
  return file.bytes()                                        # staged by daemon
        |
   validateOutboundHttpUrl + size cap applied inside request()   # R6
```

Before/after itchio (R5): today `definition.ts` closes over `fetchImpl ?? fetch` and its context omits `services`; after, itchio's context carries the unified `services.http` and the definition's fetch-equivalent is that service (test seam still injectable).

---

## Implementation Units

### U1. Extend the unified plugin HTTP contract (types + docs)

**Goal:** Add `method`/`body` to request options and a capable `request()` returning status/headers/text/bytes to the HTTP service interface, with `text`/`json` documented as sugar.

**Requirements:** R1, R2, R7

**Dependencies:** None

**Files:**
- Modify: `product/platform/plugin/services.ts`
- Test: `product/platform/plugin/services.test.ts`

**Approach:**
- Extend `PluginHttpRequestOptions` with optional `method` and `body` (string | Uint8Array | URLSearchParams/FormData-like).
- Add `request(url, options?)` to `PluginHttpServices` returning a small response type (`status`, `ok`, `headers`, `text()`, `json()`, `bytes()`).
- Keep `text`/`json` in the interface; document them as convenience wrappers. No behavioral code here beyond types + any shared response type declaration.

**Patterns to follow:**
- Existing optional-field style in `PluginHttpRequestOptions`; the `Readonly<Record<...>>` conventions already in the file.

**Test scenarios:**
- Happy path: a fixture implementation of `PluginHttpServices.request` type-checks and returns the response shape; `text`/`json` remain assignable (compile-level test / type assertion).
- Edge case: `body` accepts string and binary forms without widening to `any`.
- Test expectation: mostly type-surface; add a minimal runtime assertion that a hand-rolled `request` stub satisfies the interface.

**Verification:**
- `tsc` passes; existing `services.test.ts` still green; new response type is exported and referenced by U2.

---

### U2. Implement the capable HTTP client + per-provider cookie jar

**Goal:** Make the real client in `createAcquisitionPluginServices` support method/body, binary, status/headers, and a provider-scoped cookie jar — with URL safety and size cap enforced for every request.

**Requirements:** R1, R2, R3, R6, R7

**Dependencies:** U1

**Files:**
- Modify: `product/platform/acquisition/plugin-runtime.ts`
- Modify: `product/platform/plugin/services.ts` (wire `request` into `createProviderScopedPluginServices` merge if needed)
- Test: `product/platform/acquisition/plugin-runtime.test.ts` (create if absent)

**Approach:**
- Implement `request()` over `fetch` honoring `method`, `body`, `query`, `headers`, `timeoutMs`; expose `status`, `ok`, `headers`, and `text()/json()/bytes()` (bytes via `arrayBuffer` → `Uint8Array`).
- Reimplement `text`/`json` as thin wrappers over `request()`.
- Add an in-memory cookie jar created per services instance: capture `Set-Cookie` from responses, attach matching `Cookie` on subsequent requests (domain/path aware, minimal but correct for session cookies).
- Run `validateOutboundHttpUrl` before every request (initial URL and post-redirect target if manually following) and apply the existing max-bytes cap to `bytes()`/`text()`.

**Execution note:** Add a failing test for the POST + cookie round-trip (request 1 sets cookie, request 2 echoes it) before implementing the jar.

**Patterns to follow:**
- `withQuery` / `timeoutSignal` helpers already in `plugin-runtime.ts`; `validateOutboundHttpUrl` usage in `artifact-acquisition.ts`.

**Test scenarios:**
- Happy path: `request(url,{method:"POST",body})` sends the body and returns `status`/`bytes()`.
- Happy path: `bytes()` returns exact binary payload (e.g. PK-magic buffer) unmodified.
- Integration: request A returns `Set-Cookie: s=1`; request B to same host carries `Cookie: s=1`; request to a different host does not.
- Edge case: `text`/`json` sugar still return decoded values (back-compat with existing plugins).
- Error path: a blocked/unsafe outbound URL is rejected before fetch (SSRF guard) for GET and POST alike.
- Error path: a payload exceeding the size cap fails the same way it does today.

**Verification:**
- POST+cookie round-trip test passes; binary fidelity test passes; safety guard test passes; existing acquisition tests remain green.

---

### U3. Forward provider session/headers through the daemon byte-fetch

**Goal:** Let a `FinalDownload` carry request headers, and have the daemon's byte-fetch send them plus the provider's cookies, so cookie/referer-gated CDNs succeed via the resolve-download path.

**Requirements:** R3, R4, R6

**Dependencies:** U2

**Files:**
- Modify: `product/platform/protocol/acquisition/download-resolution.ts` (add optional `requestHeaders` to `FinalDownloadResolution`)
- Modify: `product/platform/acquisition/artifact-acquisition.ts` (forward headers + provider cookies in `acquireViaResolvedDownload`)
- Modify: `product/platform/plugin/services.ts` (downloads builder passes `requestHeaders` through, if the builder constructs `FinalDownload`)
- Test: `product/platform/acquisition/artifact-acquisition.test.ts`

**Approach:**
- Add optional `requestHeaders` to the `FinalDownload` schema; thread it through the `downloads.final(...)` builder.
- In `acquireViaResolvedDownload`, merge `requestHeaders` and any provider cookie-jar cookies into the byte-fetch; keep `redirect: "follow"`, `validateOutboundHttpUrl`, size cap, and `rejectNonArtifactPayload`.
- Preserve today's behavior when no headers/cookies are present (retrostic path unchanged).

**Patterns to follow:**
- Existing `acquireViaResolvedDownload` structure and guard ordering in `artifact-acquisition.ts`.

**Test scenarios:**
- Happy path: `FinalDownload` with `requestHeaders:{Referer}` → daemon fetch sends the Referer.
- Integration: a resolve-download plugin sets a cookie via `http.request`, returns `FinalDownload`; daemon byte-fetch carries that cookie.
- Edge case: `FinalDownload` without `requestHeaders` behaves exactly as today (regression guard for retrostic).
- Error path: HTML/ad-page payload still rejected by `rejectNonArtifactPayload` even when headers are forwarded.

**Verification:**
- New header/cookie-forward tests pass; the existing retrostic-style success and honest-failure tests remain green.

---

### U4. Migrate itchio onto the unified `services.http` (delete the bypass)

**Goal:** itchio uses `context.services.http` for search, details, resolve-download, and acquire; remove `const fetchImpl = options.fetchImpl ?? fetch`, keeping only an injectable test seam sourced from services.

**Requirements:** R5, R7

**Dependencies:** U2 (needs the capable client), U3 (for the authenticated CDN fetch path if applicable)

**Files:**
- Modify: `product/plugins/itchio/index.ts` (give the handler context the unified services; stop passing a global-fetch-backed definition)
- Modify: `product/plugins/itchio/src/definition.ts` (route `FetchLike` through `services.http.request`; drop the `?? fetch` default)
- Test: `product/plugins/itchio/src/definition.test.ts` (update seam injection)

**Approach:**
- Build itchio's acquisition context with `services` from `createAcquisitionPluginServices` (or the provider-scoped equivalent) so it consumes the same client local plugins do.
- Replace direct `fetchImpl` calls with `services.http.request` (mapping `RequestInit` usage to the capable options: method, body, headers, binary via `bytes()`).
- Keep the butler CLI path as-is (that's a separate capability, not HTTP); only the HTTP legs move.
- Remove the `?? fetch` fallback; tests inject a fake `services.http` instead of a fake global fetch.

**Execution note:** Characterize first — run the existing itchio definition tests, then refactor the fetch seam so the same assertions pass against the services-backed client.

**Patterns to follow:**
- The provider-scoped services construction in `product-plugin-adapter.ts:218`.

**Test scenarios:**
- Happy path: itchio public-page details resolve through a fake `services.http` (no global fetch reference remains).
- Happy path: itchio resolve-download / acquire produce the same artifact against the services-backed client as before the migration.
- Integration: itchio acquire exercises `request()` binary `bytes()` for the file leg.
- Regression: no code path in `definition.ts`/`index.ts` references global `fetch`; grep-level assertion in the test or a lint check.

**Verification:**
- itchio test suite green with the services-backed seam; `grep -n "?? fetch\|= fetch\b" product/plugins/itchio/src` returns nothing; itchio still functions in a manual acquire smoke.

---

### U5. Prove it end-to-end: self-managed `artifact.acquire` on a ROM-site plugin

**Goal:** Implement a self-managed `artifact.acquire` in the wowroms plugin that POSTs its download form via the unified API and stages a real ROM, verified on Bandai.

**Requirements:** R8, R1, R3

**Dependencies:** U2, U3

**Files:**
- Modify (external repo, not korri): `bazzar-plugins/wowroms/index.mjs` — register `artifact.acquire`, POST the `submitForm` fields (`emuid`, `id`, `file`) to the download endpoint, return the file bytes/URL.
- Modify (external repo): `bazzar-plugins/tests/parsers.test.mjs` — add an acquire-path fixture test.

**Approach:**
- Add an `artifact.acquire` handler that fetches the game page, extracts the hidden form fields, POSTs to the wowroms download endpoint via `context.services.http.request({ method:"POST", body })`, and returns the resulting bytes (or a `FinalDownload` with the session cookie forwarded per U3).
- Verify on Bandai: install the updated plugin, Get a SNES title, confirm it stages + imports (uses the existing zip discovery from prior work).

**Execution note:** This unit lives in the external `bazzar-plugins/` folder (not a git repo in-tree). Treat as validation of the korri-side API; capture the working `.mjs` as a fixture and note it for the deferred "port bazzar plugins into korri fixtures" item.

**Patterns to follow:**
- The existing wowroms search/resolve handlers; the itchio acquire shape (post-U4) as the reference for a services-backed self-managed download.

**Test scenarios:**
- Happy path (fixture): given the download page HTML, the acquire handler builds the correct POST body from the hidden fields.
- Integration (live, Bandai): wowroms Get of a SNES ROM → staged → imported → launchable, or an honest failure if the site adds a JS-only gate.
- Error path: a non-file POST response (HTML) is rejected by the daemon payload sniff (no junk on card).

**Verification:**
- Fixture acquire test passes; on Bandai a wowroms SNES Get completes end-to-end (or fails honestly with a clear message), demonstrating the unified API carries a real self-managed download.

---

## System-Wide Impact

- **Interaction graph:** `services.http` is consumed by every acquisition plugin (local `.mjs` + itchio) and — post-U4 — itchio. The daemon byte-fetch (`artifact-acquisition.ts`) is the shared sink. Changing the client touches all of them; back-compat via `text`/`json` sugar contains the blast radius.
- **Error propagation:** `AcquisitionError` reasons and `rejectNonArtifactPayload` honest-failure behavior must be preserved; new capabilities must not swallow or reshape existing failure messages.
- **State lifecycle risks:** cookie jar lifetime must not leak across providers or outlive an operation; ensure jars are created at the provider-scoped services boundary, not globally.
- **API surface parity:** this *is* the parity fix — after U4, no capability is bundled-only. A grep for direct `fetch(` in `product/plugins/*/src` should be empty for HTTP legs (butler CLI excepted).
- **Security surface:** a POST/binary/cookie-capable client widens SSRF/exfil potential; `validateOutboundHttpUrl` + size cap must gate every path including redirects and the daemon forward (R6).
- **Unchanged invariants:** claims/details/search contracts, discovery, config-file plugin policy, and the `plugin -> contributes -> handlers -> operation -> run(context)` shape are untouched. retrostic's working download path must behave identically.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| More powerful client widens SSRF / data-exfil surface | Enforce `validateOutboundHttpUrl` + size cap inside `request()` and the daemon forward for every method and redirect hop (R6); cover with an explicit unsafe-URL test |
| Cookie jar leaks sessions across providers | Create the jar at the provider-scoped services boundary; test that host-B requests don't carry host-A cookies |
| itchio migration regresses a working first-party download | Characterize-first (U4 execution note): keep existing itchio tests green against the services-backed seam before deleting the bypass |
| `text`/`json` sugar subtly changes decoding/back-compat | Re-implement as thin wrappers over `request()`; regression tests assert identical decoded output for existing callers |
| wowroms adds a JS-only gate that POST can't satisfy | Accept honest failure as a valid U5 outcome; the unified-API completion (U1–U4) stands regardless; JS execution stays explicitly out of scope |
| External `bazzar-plugins/` isn't in-tree | U5 validates the korri-side API; capture the `.mjs` as a fixture and track the port under Deferred |

---

## Documentation / Operational Notes

- Update plugin-authoring guidance (`product/plugins/AGENTS.md` or the plugin architecture doc) to document the capable `http.request` surface and that bundled plugins must consume it rather than importing `fetch` — codifying the "no bypass" rule so this doesn't regress.
- Note the cookie-jar/session semantics for plugin authors (provider-scoped, operation-lifetime).

---

## Sources & References

- **Origin item:** work/items/parking-lot/01KXC8EAAD647X5PBTYMP06T6E-enable-rom-site-downloads-via-plugin-http-capability-additio.md
- Prior art: work/items/active/20260703-plugin-ecosystem-api/plan.md
- Code: `product/platform/plugin/services.ts`, `product/platform/acquisition/plugin-runtime.ts`, `product/platform/acquisition/product-plugin-adapter.ts`, `product/platform/acquisition/artifact-acquisition.ts`, `product/platform/protocol/acquisition/download-resolution.ts`, `product/plugins/itchio/index.ts`, `product/plugins/itchio/src/definition.ts`
- Architecture: `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`
