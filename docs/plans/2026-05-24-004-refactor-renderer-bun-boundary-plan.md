---
title: "refactor: Move connection state and runtime config out of the React renderer"
type: refactor
status: completed
date: 2026-05-24
deepened: 2026-05-24
verify_command: "just typecheck && just test-unit && just lint"
---

## Summary

Strip everything from the React renderer that doesn't need to be there. The bun process serves a static "waiting for server" page while disconnected and only serves the React bundle once connected, with runtime-config inlined into the served `index.html`. The renderer always boots into a connected world. `preload.ts`, `window.__korriConnection` / `window.__korriRuntime`, the `executeJavaScript` push path, and the polling workarounds it forced all go away. The input bridge (`window.__korriInput`) is unchanged.

---

## Problem Frame

The desktop bun process pushes connection-state and runtime-config to the renderer via electrobun's `executeJavaScript` IPC, with `preload.ts` installing `window.__korriConnection` / `window.__korriRuntime` globals that React subscribes to. The push is fire-and-forget JS injection with no delivery guarantee. On slow cold boots — when the network associates after the renderer has mounted — the renderer catches the initial `reconnecting` state but the subsequent `searching` and `connected` pushes don't reliably land. The device gets stuck on "Looking for aka…" forever even though bun has long since reached `connected`.

This is a recurring bug. The patch surface is broad: a 100 ms `setInterval` polling fallback in `portal/main.tsx` for runtime-config, a fallback IIFE in `main.ts` that injects a parallel bridge in case the preload didn't run, a chained `receiveMessageFromBun` acceptor in `preload.ts`. None of it is reliable; all of it is compensation for a transport that was the wrong choice in this context. The renderer is loaded from `http://127.0.0.1:<port>/` — that URL is the bun process's own Hono server. Everything bun wants to tell the renderer can go through that server, which gives delivery semantics, ordering, retry, and a clear contract for free.

---

## Requirements

- R1. The React renderer must not contain connection-state UI (no `ConnectionGate`, no `SearchingState`, no `useConnectionState`). React boots into a world where it can always talk to `/api/*`.
- R2. The "waiting for server" experience must be preserved end-user-visibly during disconnected/reconnecting states (parity with today's `SearchingState`: title naming the remembered host when known, generic fallback otherwise, help text appearing after a delay).
- R3. Runtime-config (currently `{ desktopInput: boolean }`) must be available to the renderer synchronously at boot — no polling, no `setInterval`, no `window.__korriRuntime` global.
- R4. Launch-layer selection (`LauncherLayerBridge` vs `LauncherLayerRpc`) must happen at the composition root, not inside `HomeServerRoot`.
- R5. The bun→webview `executeJavaScript` push path for connection-state and runtime-config must be deleted. `pushConnectionStateToWebviews`, `attachInitialBridgePushes`' connection-state push, `installWebviewBridgeFallback`'s connection + runtime branches, `toBridgeState`, and the connection/runtime preload installers all go.
- R6. The input bridge (`window.__korriInput`, the input preload installer, the input-broker push, `desktop-bridge-adapter.ts`) must continue to function unchanged.
- R7. The bun-side connection controller (`korri/deploy/desktop/connection.ts`) — mDNS, remembered-server probe, retry/backoff, `desktop.yaml` persistence — must be unchanged. Only its consumer surface to the renderer changes.
- R8. The portal deploy (`nix/korri-portal.nix`) must continue to work. It serves the React bundle statically with no bun process; it has no waiting page (the portal *is* the server) and no inlined runtime-config (defaults are correct for the portal case).
- R9. The packaged Electrobun bundle layout under `Resources/app/views/mainview/` must remain valid. The four critical artifacts called out in `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` must remain present; any new asset added to that tree must be added to the Nix postcondition guards in `nix/korri-desktop/unwrapped.nix`.
- R10. The recurring "stuck on Looking for aka…" symptom must no longer be reachable by construction — the React renderer cannot be loaded before bun has reached `connected`.

---

## Scope Boundaries

- Electrobun itself stays; the desktop continues to embed it.
- The input bridge transport (preload-installed `window.__korriInput`, bun-side input broker, inputd WebSocket) is unchanged for this plan. It has its own polling workaround in `desktop-bridge-adapter.ts`; that workaround can stay until input transport is revisited separately.
- The connection controller's discovery and probe logic is unchanged.
- The `POST /__korri/desktop/launch` contract and the launch-bridge bun-side internals are unchanged.
- The `/api/*` RPC forwarding through `api-forwarder.ts` is unchanged.
- Kiosk Nix/sway orchestration (`nix/korri-desktop/wrap.nix`, the kiosk service unit) is unchanged.
- No visual redesign of the waiting page beyond achieving parity with today's `SearchingState`. Fonts and theme tokens are reused.

### Deferred to Follow-Up Work

- Auditing whether `window.__korriInput` has the same push-shape exposure as the connection bridges, and if so, reworking the input transport on the same principle. Flagged by `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — out of scope here because the user explicitly named input as out-of-bounds for this plan, but worth a follow-up.
- Capturing this refactor in `docs/solutions/` via `/se-compound` once it lands. The institutional gap on preload bridges, `executeJavaScript` races, and the pre-React boot screen is real.

---

## Context & Research

### Relevant Code and Patterns

- `korri/deploy/desktop/create-desktop-app.ts` — Hono router. Today: `/__korri/native-input-diagnostic`, `/__korri/desktop/launch`, `/api`, `/api/*`, `*` → static asset. Adds the connection-aware serve branch and the runtime-config inliner here. The existing "thin, additive" composition discipline from `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` applies — branch inside the existing handler, do not introduce a new middleware layer.
- `korri/deploy/desktop/static-assets.ts` — file-system asset serve with SPA fallback. The connection branch and runtime-config templating live here or in a thin caller wrapper.
- `korri/deploy/desktop/connection.ts` — `SubscriptionRef<ConnectionState>` and the controller. `getConnection` / `getUpstream` are already passed into `createDesktopApp`. A `getConnectionState` accessor in the same shape gives the static-asset handler what it needs to decide which response to serve.
- `korri/deploy/desktop/main.ts` — currently constructs both `getUpstream` and `getConnection` from the controller's `SubscriptionRef`. Extends to also pass a `getConnectionState` that returns the full snapshot. Deletes `pushConnectionStateToWebviews`, the connection-state branches of `attachInitialBridgePushes` / `installWebviewBridgeFallback`, and (eventually) `toBridgeState`.
- `korri/deploy/desktop/preload.ts` and `preload-entry.ts` — preload script. Reduces to input-only. `installConnectionStateBridge`, `installRuntimeBridge`, and their tests are deleted.
- `korri/products/app/features/connection/*` — entire directory deleted (`ConnectionGate.tsx`, `ConnectionGate.test.tsx`, `SearchingState.tsx`, `SearchingState.test.tsx`, `use-connection-state.ts`).
- `korri/products/app/routes/+__root.tsx` — drops the `<ConnectionGate>` wrapper.
- `korri/deploy/portal/main.tsx` — reads runtime-config from a synchronously-available global (set by an inline `<script>` in the served `index.html`); deletes the `setInterval` polling fallback and the `__korriRuntime` subscription path.
- `korri/products/app/features/home/HomeServerRoot.tsx` — stops choosing the launcher layer. Either becomes a thin pass-through that just renders `children`, or is deleted with route components updated to compose directly. The chosen layer is set once by the composition root.
- `korri/products/app/features/home/launcher-layer-bridge.ts` and `launcher-layer-rpc.ts` — unchanged; only the call site moves.
- `tools/desktop/desktop-smoke.ts` and `tools/desktop/desktop-smoke.test.ts` — already smoke-test the desktop Hono composition without launching electrobun. Extended with assertions for the new connection-aware serve and the inlined runtime-config script.
- `nix/korri-desktop/unwrapped.nix` — Nix derivation that bundles the preload, copies the four critical artifacts, and asserts their presence. The preload build step continues (input bridge needs it). Any new packaged asset (e.g., a waiting-page HTML / CSS pair) gets added to the existing postcondition guard list.
- `electrobun.config.ts` — `copy` map. Adds entries for any new packaged asset (e.g., `waiting.html`, `waiting.css`) so dev builds match Nix builds.

### Institutional Learnings

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — establishes the desktop loopback Hono composition. The plan extends it; nothing about that architecture changes. The smoke seam at `tools/desktop/desktop-smoke.ts` is the right place to cover the new serve contract.
- `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md` — governs where the launcher-layer selection ends up. The composition root that picks the layer must live under `korri/deploy/desktop/` or `korri/products/app/` — never `korri/shared/`.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — the waiting page is a full-screen UI surface and must use named theme tokens (no inline `style={{…}}`, no raw px). Defaults to mid-scale type and generous padding; this is a hero state, not status bar copy.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — after the refactor, the React app's contract is "always boots into the connected state". Any leftover JSX that branches on a connection-status boolean becomes dead code and gets removed.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — new tests run against the real Hono composition with a configured-real connection-state accessor (`() => ({ status: "reconnecting", server: {...}, ... })`), not a `MockConnectionController`. The existing `noUpstream = () => undefined` pattern in `create-desktop-app.test.ts` is the established shape.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` — the four critical packaged artifacts under `Resources/app/`. Adding a waiting-page asset means extending both `electrobun.config.ts`'s `copy` map and the Nix postcondition asserts in `unwrapped.nix`. The bun entrypoint must remain at `korri/deploy/desktop/index.ts`.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` — flags that `window.__korriInput` should be re-validated for push-shape exposure. Out of scope here but noted in deferred follow-up.

### External References

- None. Local patterns and institutional learnings cover this work.

---

## Key Technical Decisions

- **Move connection-state out of React entirely rather than fixing the push channel.** The push transport was the wrong shape; replacing it with EventSource or WebSocket would fix the symptom but leave the architectural mistake (the renderer being responsible for a state the bun process owns). Removing the responsibility from the renderer is the right way.
- **Bun serves a static waiting page while disconnected and the React bundle once connected — single Hono router, branched response.** The branch lives inside the existing static-asset handler. No new middleware layer, no new server. This honors the "thin, additive composition" discipline of the loopback wrapper.
- **The waiting page polls a small bun endpoint for connection status and reloads when it flips to `connected`.** Polling at ~750 ms is simple, has no transport-race exposure (the renderer initiates each request, by definition the connection exists at the moment the renderer cares), and avoids EventSource/WebSocket scaffolding for a page that only needs to know one bit. The first React load happens when bun has actually reached `connected` — by construction, the renderer cannot get stuck waiting for a state it already passed.
- **Inline runtime-config into the served `index.html` at request time, not build time.** Request-time templating keeps a single packaged artifact (`Resources/app/views/mainview/index.html`) and lets the inlined values reflect live bun state. Build-time inlining freezes the config to whatever existed during `nix build`.
- **The renderer reads the inlined config from a synchronously-available global (e.g., `window.__korriRuntimeConfig`).** Set by an inline `<script>` in the served `index.html`, so it's present before any module script runs. The shape is identical to today's `RuntimeConfigBridgeState`; only the delivery channel changes.
- **Launcher-layer selection happens at the React composition root via `<RegistryProvider initialValues=[…]>`.** `portal/main.tsx` reads the inlined runtime-config, calls a tested pure function `selectLauncherLayer(runtime)` that maps `desktopInput: true → LauncherLayerBridge` and `false → LauncherLayerRpc`, then wraps `<RouterProvider/>` in `<RegistryProvider initialValues=[[launcherLayerAtom, layer], [librarySourceLayerAtom, LibrarySourceLayerRpc]]>`. This is the documented `@effect/atom-react` (v4.0.0-beta.60) pattern for seeding atom values before the React tree mounts: the provider builds an `AtomRegistry` synchronously in its own render, pre-populates it from `initialValues` before any child renders, and pins the registry identity for the tree's lifetime. `HomeServerRoot`'s `useLayoutEffect` + `layersReady` flag becomes unnecessary and `HomeServerRoot` is deleted; `/` and `/screen` route components render their pages directly. Storybook/test atom overrides (which run inside their own provider scopes) are untouched.
- **The default module-level registry exposed by `@effect/atom-react` is not used.** Writing to it from outside React would be silent if it's not the same registry the tree reads. `<RegistryProvider initialValues={…}>` is the only sanctioned path.
- **Atoms-of-layers shape stays.** `librarySourceLayerAtom` and `launcherLayerAtom` remain `Atom.make(…)` writables so that Storybook stories and existing tests can swap layers via `useAtomSet`. The refactor changes *who* writes to them at boot (composition root, not `HomeServerRoot`), not the seam shape.
- **`getConnectionState` is the new accessor passed into `createDesktopApp`.** `getUpstream` and `getConnection` already exist; adding a third accessor follows the established shape. The accessor returns the full snapshot so the waiting page can name the remembered host.
- **The connection-status polling endpoint lives under `/__korri/desktop/`.** Naming follows the existing convention (`/__korri/desktop/launch`, `/__korri/native-input-diagnostic`). Concrete path: `GET /__korri/desktop/connection-status` returning JSON.
- **Only the catch-all `GET *` handler branches on connection state.** `/api/*` already returns 503 from `api-forwarder.ts` when `getUpstream() === undefined`; `/__korri/desktop/launch` already returns 503 when the launch bridge has no upstream. Neither needs new disconnected-state handling. The new branch lives strictly in the static-asset path.
- **Extension-bearing requests never receive the waiting-page HTML.** While disconnected, the catch-all serves the waiting page only for HTML-shaped routes (`/`, route-like SPA paths). Asset requests (`/assets/app.js`, `/waiting.css`) are served from disk if present, else 404 — never an HTML body. This avoids the browser receiving HTML where it expected JS or CSS, which would otherwise corrupt a stale-cached page.
- **The waiting page renders the help block based on a request-time decision, not a client-side timer.** The bun handler compares `Date.now()` against `helpAfter` when rendering the page; the help block is included or omitted in the HTML body. The polling reload (~750 ms cadence) means a transition from "help-hidden" to "help-visible" lands on the device within one poll. This keeps the static page truly static — no client-side timer — and lets `create-desktop-app.test.ts` assert help visibility from the rendered HTML.
- **Theme parity uses a dedicated `waiting.css`, not the Tailwind-compiled portal stylesheet.** The portal CSS is fingerprinted (`/assets/index-<hash>.css`) and rebuilt on every Vite build; cross-linking from a static asset would couple the waiting page to a moving filename. Instead, the waiting page ships a small co-located `waiting.css` with `clamp()` formulas mirroring the same fluid-token calibration in `korri/shared/primitives/theme/styles.css` (`--text-base`, `--text-2xl`, `--spacing`). Same calibration discipline, independent compile path. No raw px values in the `<style>` / CSS — only `clamp()` formulas matching the theme tokens, per `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`.
- **`index.html` served with `cache-control: no-store`.** Its body now varies by runtime-config; aggressive caching would serve a stale inlined `<script>`. Hash-named assets under `/assets/` remain cacheable as today.
- **Mid-session disconnect (connected → searching) is an accepted gap.** When bun's upstream goes away after the React app has loaded, the React app stays loaded and `/api/*` calls fail with 503. The existing RPC error path surfaces the failure to the user. The renderer does *not* automatically re-enter the waiting page (that would require a push channel, which this plan deletes by design). If recovery UX becomes important later, the renderer can detect a streak of 503s and call `location.reload()` itself — single line, opt-in, no architectural change. Flagged in Risks & Dependencies.

---

## Open Questions

### Resolved During Planning

- Should the waiting page be one HTML file with inline CSS, or split into HTML + linked CSS? — Co-located `waiting.css` with `clamp()` formulas mirroring the theme tokens. Independent of the Tailwind-compiled portal CSS (which is fingerprinted and would couple the waiting page to a moving filename).
- Should the renderer use SSE/WebSocket to learn about connection state instead of being gated entirely on the bun side? — No. Removing the state from the renderer entirely is simpler and eliminates the race by construction. SSE would still need the renderer to model "not yet connected".
- Should runtime-config be inlined at build time or request time? — Request time. Keeps one packaged artifact; matches the existing serve discipline.
- Where does launcher-layer selection live? — At the React composition root via `<RegistryProvider initialValues={…}>` in `portal/main.tsx`. The selection rule is a pure `selectLauncherLayer(runtime)` function with its own unit test.
- How does the waiting page handle help-text timing? — Request-time decision in the bun handler. Body either includes or omits the help block based on `Date.now() ≥ helpAfter`. Reloads catch transitions within one polling tick. No client-side timer.
- Should the waiting page polling script be inline `<script>` or an extracted module? — Extracted module (`waiting-page/polling-loop.ts`) with injected `fetch` / `reload` / `setInterval`; inline `<script>` is a 2-line bootstrap that imports and starts the module. Lets the polling logic be unit-tested under happy-dom with configured-real fetch.
- Does `/api/*` change behavior during disconnected state? — No. `api-forwarder.ts` already returns 503 when `getUpstream() === undefined`. The new connection-aware branch only affects the catch-all static-asset path.
- Does `/__korri/desktop/launch` change behavior during disconnected state? — No. The launch bridge already returns 503 when no upstream is connected.
- What do extension-bearing requests return during disconnected state? — They return the asset from disk if present, 404 otherwise. Never the waiting-page HTML body.
- Should the React renderer recover from mid-session disconnect (connected → searching) by re-entering the waiting page? — Not in this plan. Accepted gap; existing RPC error handling applies. Opt-in `location.reload()` on 503 streaks is a future option.

### Deferred to Implementation

- Polling interval for the waiting page's status check (working assumption: 750 ms). May tune during implementation against perceived flicker / load.
- Cache-control header strategy for the templated `index.html` (working assumption: `no-store`). Tune if measured latency matters.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
                         ┌──────────────────────────────┐
                         │   bun process (electrobun)   │
                         │                              │
                         │  connection.ts               │
                         │   SubscriptionRef<           │
                         │     ConnectionState>         │
                         │       │                      │
                         │       ▼                      │
                         │  create-desktop-app.ts       │
                         │   (Hono router)              │
                         │                              │
                         │   GET /__korri/desktop/      │
                         │     connection-status        │
                         │       → JSON {status,server} │
                         │                              │
                         │   GET *  (static asset)      │
                         │     if status === connected  │
                         │       → index.html           │
                         │           + inlined          │
                         │             runtime-config   │
                         │     else                     │
                         │       → waiting.html         │
                         │           (knows hostId)     │
                         └──────────────┬───────────────┘
                                        │  HTTP (localhost)
                ┌───────────────────────┴──────────────────────┐
                │                                              │
        ┌───────▼────────┐                            ┌────────▼────────┐
        │  waiting.html  │                            │   React bundle  │
        │  (no React)    │                            │   (portal/      │
        │                │                            │    main.tsx)    │
        │  polls         │                            │                 │
        │   /__korri/    │                            │  window.__korri │
        │    desktop/    │                            │    RuntimeConfig│
        │    connection- │                            │   (synchronously│
        │    status      │                            │     present)    │
        │  reloads when  │                            │                 │
        │   connected    │                            │  picks launcher │
        │                │                            │   layer once    │
        └────────────────┘                            └─────────────────┘
```

The renderer never observes `searching` or `reconnecting`. The only state transitions it experiences are "page loaded" (already connected) and (only via crash/network drop) page reload.

---

## Implementation Units

### U1. Add `getConnectionState` accessor and connection-aware serve branch

**Goal:** Pass the connection-state snapshot into `createDesktopApp`. Branch the catch-all serve handler so that while disconnected, the bun process serves a static waiting page that names the remembered host (when known) and polls a status endpoint; while connected, it serves the React bundle as today.

**Requirements:** R1, R2, R7, R10.

**Dependencies:** None.

**Files:**
- Modify: `korri/deploy/desktop/create-desktop-app.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Modify: `korri/deploy/desktop/static-assets.ts` (templating-aware variant or a thin caller in `create-desktop-app.ts`)
- Create: `korri/deploy/desktop/waiting-page/render-waiting-page.ts` (pure function: snapshot + `now` → HTML body string)
- Create: `korri/deploy/desktop/waiting-page/render-waiting-page.test.ts`
- Create: `korri/deploy/desktop/waiting-page/polling-loop.ts` (extracted polling logic with injected `fetch` / `reload` / `setInterval`)
- Create: `korri/deploy/desktop/waiting-page/polling-loop.test.ts` (happy-dom unit test)
- Create: `korri/deploy/desktop/waiting-page/waiting.html` (small static template; loads `waiting.css`; inline `<script>` is a 2-line bootstrap that imports + starts `polling-loop`)
- Create: `korri/deploy/desktop/waiting-page/waiting.css` (co-located fluid-token CSS using `clamp()` formulas mirroring `korri/shared/primitives/theme/styles.css`)
- Modify: `electrobun.config.ts` (add `copy` entries for `waiting.html`, `waiting.css`, the bundled polling-loop output)
- Test: `korri/deploy/desktop/create-desktop-app.test.ts` (extend with the route × connection-state cross-product)

**Approach:**
- Add `getConnectionState: () => ConnectionStateSnapshot` to `CreateDesktopAppOptions`. Snapshot carries `status`, `server` (when applicable), `helpAfter` (`Date` or ISO string — match what the controller already produces). `main.ts` constructs it from the existing `SubscriptionRef.getUnsafe(...)`.
- Add `GET /__korri/desktop/connection-status` returning JSON `{ status, server?, since?, helpAfter? }` (ISO-string timestamps, matching today's `toBridgeState` output shape). Registered before the catch-all.
- The catch-all `app.get("*")` reads the snapshot once per request, then:
  - For HTML-shaped routes (`/` or extensionless route-like paths) while disconnected: call `renderWaitingPage(snapshot, Date.now())`, return its HTML body. Pure function so it's directly testable.
  - For extension-bearing routes (`.js`, `.css`, `.html`, `.svg`, …) while disconnected: serve from disk if present (so `/waiting.css` and the bundled polling-loop script resolve), else 404. Never serve HTML.
  - While connected: delegate to `serveStaticAsset` as today (with U2's runtime-config inliner stacked on top).
- `renderWaitingPage(snapshot, now)`:
  - Title: `Looking for ${hostId}…` (when `status === "reconnecting"`) or `Looking for a Korri server…` (when `searching`).
  - Body line: parity copy from today's `SearchingState`.
  - Help block: included when `now ≥ Date.parse(helpAfter)`, omitted otherwise. Server-side decision; no client timer.
  - Loads `<link rel="stylesheet" href="/waiting.css">` and `<script type="module" src="/waiting-polling-loop.js">` (or whatever the bundled output filename is — pinned at electrobun-config wiring time).
- `polling-loop.ts` exports `createPollingLoop({ fetch, reload, setInterval, clearInterval, url, intervalMs })` → `{ start(): void; dispose(): void }`. On each tick: `fetch(url)`, parse JSON, if `status === "connected"` call `reload()` else schedule next tick. Catches all errors per tick so a transient failure doesn't kill the loop.
- The 2-line bootstrap `<script>` in `waiting.html` imports the bundled `polling-loop`, constructs it with `globalThis.fetch`, `() => window.location.reload()`, `setInterval`, `clearInterval`, the status URL, and the chosen interval, then calls `start()`.
- `waiting.css`: `clamp()` formulas matching `--text-2xl` / `--text-base` / `--spacing` from `korri/shared/primitives/theme/styles.css` (don't import — duplicate the calibration); declares `container-type: inline-size` on `body`; defaults to mid-scale type and generous padding per the institutional learning. No raw px values; only `clamp()` and theme-color hexes consistent with today's `bg-slate-950` / `text-slate-100` (or equivalent token-named values).

**Patterns to follow:**
- Existing `getUpstream` / `getConnection` accessors in `CreateDesktopAppOptions`.
- Existing route registration order (`/__korri/*` before `/api/*` before `*`).
- Existing `noUpstream = () => undefined` fixture shape in `create-desktop-app.test.ts` — extend with `disconnectedSnapshot()` / `connectedSnapshot(hostId)` helpers.
- Visual conventions in `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`.
- Inverted-dependencies test pattern from `shared/input/native-adapter.test.ts` and `shared/input/desktop-bridge-adapter.test.ts` (configured-real `fetch` / `setInterval` injection).

**Test scenarios:**

*Render (`render-waiting-page.test.ts` — pure-function unit tests):*
- Happy path: `status: "searching"` → body contains `Looking for a Korri server…`, contains Ethernet hint line.
- Happy path: `status: "reconnecting", server: { hostId: "aka" }` → body title contains `aka`.
- Edge case: `now < helpAfter` → body does not contain the help block markup.
- Edge case: `now ≥ helpAfter` → body contains the help block markup with the parity copy.
- Edge case: `helpAfter` is an unparseable ISO string → help block treated as immediately visible (matches today's `parseHelpAfter` fallback to 0).

*Polling loop (`polling-loop.test.ts` — happy-dom unit tests with configured-real injections):*
- Happy path: first tick calls `fetch(url)`.
- Happy path: response with `status: "connected"` triggers `reload()` exactly once.
- Edge case: response with `status: "searching"` does not call `reload()`; loop schedules next tick.
- Edge case: `fetch` rejects (network error) → loop logs nothing visible and schedules next tick; `reload()` not called.
- Edge case: response body is malformed JSON → loop continues; `reload()` not called.
- Edge case: response is HTTP 5xx → loop continues; `reload()` not called.
- Lifecycle: `dispose()` clears the interval; no further `fetch` calls.

*Composition (`create-desktop-app.test.ts` — extend with the full cross-product against the real Hono app):*
- Happy path: `getConnectionState` returns `connected` → `GET /` returns the packaged `index.html` body.
- Happy path: `getConnectionState` returns `searching` → `GET /` returns the waiting-page body; body contains `Looking for a Korri server…`.
- Happy path: `getConnectionState` returns `reconnecting` with hostId `aka` → `GET /` body contains `aka`.
- Happy path: `GET /__korri/desktop/connection-status` while `searching` returns JSON `{ status: "searching", since, helpAfter }` with ISO-string timestamps.
- Happy path: `GET /__korri/desktop/connection-status` while `reconnecting` returns JSON with `server.hostId`, `server.controlUrl`, ISO-string timestamps.
- Happy path: `GET /__korri/desktop/connection-status` while `connected` returns JSON `{ status: "connected", server: {…} }` without timestamps (matching today's wire shape).
- Edge case: `GET /games/123` (extensionless route-like path) while `searching` → returns waiting-page body (same as `/`).
- Edge case: `GET /assets/app.js` while `searching` → returns the asset from disk if present, 404 otherwise. Body is never the waiting-page HTML.
- Edge case: `GET /waiting.css` while `searching` → returns the CSS body (so the page can style itself).
- Edge case: `GET /api/health` while `searching` → returns 503 from the existing forwarder; the new branch does not interfere.
- Edge case: `POST /__korri/desktop/launch` while `searching` → returns the launch bridge's existing 503 response; the new branch does not interfere.
- Edge case: `getConnectionState` returns `searching` with `helpAfter` in the past → response body includes the help block.
- Edge case: same with `helpAfter` in the future → response body omits the help block.

**Verification:**
- `just test-unit` passes the new test scenarios (~25 new cases across three test files: ~5 render, ~7 polling-loop, ~13 composition).
- Manual: with a fresh Sobo boot, the device shows the bun-served waiting page until bun's connection controller reaches `connected`; after the polling cycle, it loads the React app and stays connected. The "Looking for aka…" stuck state is not reproducible.

---

### U2. Inline runtime-config into the served `index.html` at request time

**Goal:** When the catch-all serve path returns the React bundle's `index.html`, it injects a `<script>` tag setting `window.__korriRuntimeConfig` before any module script runs. The renderer can read runtime-config synchronously at boot.

**Requirements:** R3, R8.

**Dependencies:** U1 (the connection-aware branch in the catch-all).

**Files:**
- Modify: `korri/deploy/desktop/static-assets.ts` (or the new branching helper from U1)
- Modify: `korri/deploy/desktop/create-desktop-app.ts` (add `getRuntimeConfig: () => RuntimeConfig` to options)
- Modify: `korri/deploy/desktop/main.ts` (wire `getRuntimeConfig` from the existing `runtimeConfig` value)
- Test: `korri/deploy/desktop/create-desktop-app.test.ts` (extend) or `korri/deploy/desktop/static-assets.test.ts` (extend)

**Approach:**
- When serving `index.html`, read the file, inject `<script>window.__korriRuntimeConfig = {…}</script>` immediately before the closing `</head>` (or before the first module script), and return the rewritten body.
- `getRuntimeConfig` returns the same `{ desktopInput: boolean }` shape `readRuntimeConfigFromEnv` produces today.
- Portal deploy does not pass through this code path (portal is served by nginx/static), so its `index.html` has no inlined script. Portal renderer must continue to work when `window.__korriRuntimeConfig` is absent.
- Caching: serve a small in-memory cache of the rewritten body keyed by the runtime-config JSON, or re-read each request — runtime-config is set-once so the first form is fine. Decided in implementation; either is correct.

**Patterns to follow:**
- Existing `serveStaticAsset` file-read + Response shape.
- Existing `getUpstream` / `getConnection` / (new) `getConnectionState` accessor pattern.

**Test scenarios:**
- Happy path: serving `index.html` with `getRuntimeConfig` returning `{ desktopInput: true }` produces an HTML body containing `window.__korriRuntimeConfig` with `desktopInput: true`.
- Happy path: serving with `{ desktopInput: false }` produces a body with that value.
- Edge case: assets without `.html` extensions are not rewritten (`.js`, `.css`, `.svg` bodies are byte-identical to disk).
- Edge case: serving when `index.html` is missing returns 404 (existing behavior preserved).

**Verification:**
- `just test-unit` passes the new scenarios.
- Manual: the served `/index.html` body contains a `<script>` setting the runtime-config global; the React renderer (with U3 landed) reads it without polling.

---

### U3. Renderer reads inlined runtime-config; remove polling

**Goal:** `portal/main.tsx` reads runtime-config from `window.__korriRuntimeConfig` synchronously at boot via a tested helper. The `setInterval` polling loop and the `window.__korriRuntime` subscription path are deleted. Portal deploy continues to work with sensible defaults when the global is absent.

**Requirements:** R3, R6, R8.

**Dependencies:** U2 (the inlined script must be served before this consumer is shipped, but they can land together if preferred).

**Files:**
- Modify: `korri/deploy/portal/main.tsx`
- Create: `korri/deploy/portal/read-inlined-runtime-config.ts` (small pure helper: `(target: Window) => RuntimeConfig`)
- Create: `korri/deploy/portal/read-inlined-runtime-config.test.ts`
- Rename: `korri/deploy/desktop/runtime-config-bridge.ts` → `korri/deploy/desktop/runtime-config-shape.ts`. Keep the `RuntimeConfig` type and `isRuntimeConfigBridgeState` guard (renamed `isRuntimeConfig` to drop the bridge framing) — both sides of the inline `<script>` boundary need this validation. A standalone shape module (rather than folding into `runtime-config.ts`) keeps the env-reader / wire-shape concerns separate.
- Modify: `korri/deploy/desktop/runtime-config-bridge.test.ts` — rename and update to match the new module name; keep the 5 type-guard cases.

**Approach:**
- Extract `readInlinedRuntimeConfig(target: Window): RuntimeConfig` into its own module. Implementation: read `target.__korriRuntimeConfig`, validate with `isRuntimeConfig`, return validated value or `{ desktopInput: false }` default. Pure, no React, no Effect — directly unit-testable.
- `portal/main.tsx` calls `readInlinedRuntimeConfig(window)` once at boot, before any React work.
- Delete `subscribeRuntimeConfigChanges` and its `setInterval` loop entirely. Runtime-config is set-once at boot; there is no subscription path.
- Delete the `KorriRuntimeBridge` import / interface / `window.__korriRuntime` global declaration in `portal/main.tsx`.
- The renamed shape module keeps the type guard alive as a single source of truth for `isRuntimeConfig`. The Phase-1 institutional finding (`docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`) governs the placement: the shape module stays under `korri/deploy/` because both `deploy/desktop` (serves the inlined script) and `deploy/portal` (reads it) own this contract.

**Patterns to follow:**
- Existing `readControllerInputProfile` guard pattern in `portal/main.tsx`.
- Existing `isRuntimeConfigBridgeState` type guard (carried forward under the new name).

**Test scenarios:**

*`read-inlined-runtime-config.test.ts`:*
- Happy path: `target.__korriRuntimeConfig = { desktopInput: true }` → returns `{ desktopInput: true }`.
- Happy path: `target.__korriRuntimeConfig = { desktopInput: false }` → returns `{ desktopInput: false }`.
- Edge case: global absent → returns `{ desktopInput: false }` default.
- Edge case: global present but wrong shape (`{ desktopInput: "true" }`, `{}`, `null`, string) → returns default. (Mirrors the surviving `isRuntimeConfig` cases.)
- Forward-compat: extra unknown fields tolerated (`{ desktopInput: true, futureField: 42 }` → returns `{ desktopInput: true }` ignoring extras).

*`portal/main.tsx`:*
- Test expectation: none — composition root with no exported behavior. Selection-rule coverage lives in U4's `select-launcher-layer.test.ts`; per-bridge-state serve coverage lives in U1's `create-desktop-app.test.ts` and U8's desktop-smoke. End-to-end "renderer boots with the right launcher layer" comes from the same U8 checks.

**Verification:**
- `just typecheck` passes (no dangling `__korriRuntime` types).
- `just test-unit` passes (the 5 type-guard cases and the 5 helper cases).
- Manual: the device boots without the polling loop ever firing; the controller-profile-driven spatial navigation comes up with the desktop input adapter when running on the desktop deploy.

---

### U4. Lift launcher-layer selection to the composition root via `<RegistryProvider initialValues>`

**Goal:** Launcher-layer selection moves from `HomeServerRoot` (React `useLayoutEffect`) to `portal/main.tsx` (React composition root), driven by inlined runtime-config and seeded into the atom registry before the React tree mounts. `HomeServerRoot` is deleted; `/` and `/screen` route components compose their pages directly.

**Requirements:** R4, R6.

**Dependencies:** U3 (the inlined runtime-config is the signal that decides the layer).

**Files:**
- Modify: `korri/deploy/portal/main.tsx` (wrap `<RouterProvider/>` in `<RegistryProvider initialValues={…}>`)
- Create: `korri/deploy/portal/select-launcher-layer.ts` (pure function: `RuntimeConfig → Layer`)
- Create: `korri/deploy/portal/select-launcher-layer.test.ts`
- Delete: `korri/products/app/features/home/HomeServerRoot.tsx`
- Modify: `korri/products/app/routes/+index.tsx` (render `<ShiftHomePage/>` directly)
- Modify: `korri/products/app/routes/+screen.tsx` (render `<DualScreenRouteRoot/>` directly)
- Modify: `korri/products/app/features/home/launcher-layer-bridge.ts` — update the stale comment block referencing `HomeServerRoot`.
- Modify: any test that mounts `<HomeServerRoot>` directly (search with `rg "HomeServerRoot"`); replace with a `<RegistryProvider initialValues={…}>` wrapper using the same atoms.

**Approach:**
- Add `selectLauncherLayer(runtime: RuntimeConfig)`: returns `LauncherLayerBridge` when `runtime.desktopInput`, else `LauncherLayerRpc`. Pure, two-case function with its own unit test (per the institutional learning that selection rules deserve their own seam even when composition roots don't).
- In `portal/main.tsx`:
  - After `readInlinedRuntimeConfig(window)` (from U3), build `initialValues` as `[[librarySourceLayerAtom, LibrarySourceLayerRpc], [launcherLayerAtom, selectLauncherLayer(runtime)]] as const`.
  - Wrap `<RouterProvider router={router}/>` in `<RegistryProvider initialValues={initialValues}>` from `@effect/atom-react`.
  - This causes the provider to construct an `AtomRegistry` (via `AtomRegistry.make({ initialValues })`) during its own render, pre-seed both atom values before any child renders, and pin the registry for the tree's lifetime. The first `useAtomValue(libraryRuntime)` in the tree sees the seeded layers, not the `loadingForeverLibrarySourceLayer` placeholder.
  - `LibrarySourceLayerRpc` is the only library source in the codebase today; seeded unconditionally.
- Delete `HomeServerRoot` entirely. Route components render their pages directly. The `layersReady` flag and the `null` first-render-before-effect become unnecessary.
- The default module-level registry exposed by `@effect/atom-react` is **not** used. Writing to it from outside React would be a silent no-op because there's no guarantee the React tree reads from the same registry instance.
- Storybook stories (`ShiftHomePage.stories.tsx`) and existing tests (`DualScreenRouteRoot.test.tsx`, `use-library-launch-controller.test.tsx`) that swap layers via `useAtomSet` continue to work — they run inside their own provider scopes and the `Atom.make(…)` writable shape is preserved.

**Patterns to follow:**
- Canonical `<RegistryProvider initialValues={…}>` shape from `@effect/atom-react@4.0.0-beta.60` (see `node_modules/@effect/atom-react/dist/RegistryContext.d.ts`).
- `library-atoms.ts` shape — atoms-of-layers — is preserved as the harness seam.
- Pure-helper-with-test pattern: small `selectXxx(input) → output` next to the composition root, tested in isolation.

**Technical design:** *(optional directional sketch — not implementation specification)*

```ts
// korri/deploy/portal/main.tsx (shape only; not literal)
const runtime = readInlinedRuntimeConfig(window)
const initialValues = [
  [librarySourceLayerAtom, LibrarySourceLayerRpc],
  [launcherLayerAtom,      selectLauncherLayer(runtime)],
] as const

ReactDOM.createRoot(rootElement).render(
  <RegistryProvider initialValues={initialValues}>
    <RouterProvider router={router} />
  </RegistryProvider>,
)
```

**Test scenarios:**

*`select-launcher-layer.test.ts`:*
- Happy path: `{ desktopInput: true }` → returns the `LauncherLayerBridge` identity.
- Happy path: `{ desktopInput: false }` → returns the `LauncherLayerRpc` identity.
- (Assert layer identity, not behavior. Layer behavior is already covered by `launcher-layer-bridge.test.ts` and `library-rpc-layers.test.ts`.)

*`portal/main.tsx`:*
- Test expectation: none — composition root. End-to-end "correct launcher layer wired given the inlined runtime-config" is covered by U8's desktop-smoke checks (manual deploy verifies live behavior).

*Updated tests:*
- Any `<HomeServerRoot>`-mounting test wraps its render in `<RegistryProvider initialValues={…}>` instead. Behavior assertions unchanged.

**Verification:**
- `just typecheck` passes.
- `just test-unit` passes (`select-launcher-layer.test.ts` + any updated mount tests).
- Manual: launching a game on Sobo (`POST /__korri/desktop/launch`-backed flow) continues to work; launching on the portal deploy (RPC-backed flow) continues to work.

---

### U5. Drop `ConnectionGate` from the route root

**Goal:** The React renderer no longer wraps the route tree in `ConnectionGate`. The renderer boots assuming it can always talk to `/api/*`.

**Requirements:** R1, R10.

**Dependencies:** U1 (the bun side must already be gating the React load on connected state before the gate is removed from the renderer).

**Files:**
- Modify: `korri/products/app/routes/+__root.tsx` (drop `<ConnectionGate>` wrapper; keep `<Suspense>` and `<Outlet>`)

**Approach:**
- Remove the `<ConnectionGate>` wrapper and its import.
- The `useInputAction("back", …)` and focus-restore behaviors stay.

**Patterns to follow:**
- Existing root-route structure; the change is purely subtractive.

**Test scenarios:**
- Test expectation: none — the change is a one-line subtraction. The behavior it removes is covered (by deletion) in U7. Coverage that the renderer "boots into a connected state" comes from U1 + U8.

**Verification:**
- `just typecheck` passes (no dangling `ConnectionGate` import).
- The dev portal (`just dev-web`) renders the home screen with no connection gate.

---

### U6. Delete bun-side push machinery; slim preload to input-only; preserve `chainAcceptor` isolation coverage

**Goal:** `pushConnectionStateToWebviews`, the connection-state push in `attachInitialBridgePushes`, the connection + runtime branches of `installWebviewBridgeFallback`, `toBridgeState`, and the connection / runtime preload installers are all deleted. The preload still installs the input bridge. `chainAcceptor`'s isolation property (a throwing acceptor doesn't poison the chain) — currently only tested in the to-be-deleted `preload-runtime-bridge.test.ts` — migrates to a surviving test file.

**Requirements:** R5, R6.

**Dependencies:** U1, U2, U3, U5 (nothing in either process consumes the push channel anymore).

**Files:**
- Modify: `korri/deploy/desktop/main.ts` (delete `pushConnectionStateToWebviews`; delete `attachInitialBridgePushes` entirely — runtime-config is now inlined and connection state is no longer pushed to the renderer, so it has no remaining job; reduce `installWebviewBridgeFallback` to input-only or delete it entirely)
- Modify: `korri/deploy/desktop/preload.ts` (delete `installConnectionStateBridge` and `installRuntimeBridge`; keep `installDesktopInputBridge` and `chainAcceptor`)
- Modify: `korri/deploy/desktop/preload-entry.ts` (call only `installDesktopInputBridge`)
- Delete: `korri/deploy/desktop/preload-runtime-bridge.test.ts`
- Modify: `korri/deploy/desktop/preload.test.ts` (delete the `installConnectionStateBridge` describe block; keep `chainAcceptor` cross-bridge isolation cases by absorbing them into this file or `preload-input-action-bridge.test.ts`)
- Modify: `korri/deploy/desktop/preload-input-action-bridge.test.ts` (existing tests still apply; if `chainAcceptor` isolation cases land here instead, add them)
- Delete: `korri/deploy/desktop/to-bridge-state.ts`
- Delete: `korri/deploy/desktop/to-bridge-state.test.ts` (the Date→ISO conversion property migrates into U1's `create-desktop-app.test.ts` cases on the `connection-status` endpoint)

**Approach:**
- Remove the deleted symbols and all call sites in `main.ts`. Walk through the file post-edit to confirm no orphaned imports or comments remain.
- `installWebviewBridgeFallback` was added to guard against the preload failing to install. Now that connection + runtime are out of band, the only bridge that needs the fallback is input. The input bridge's existing polling fallback in `desktop-bridge-adapter.ts` covers the same need — delete `installWebviewBridgeFallback` entirely.
- Update inline comments in `main.ts` that reference the deleted push channel.
- Migrate `chainAcceptor` isolation cases from `preload-runtime-bridge.test.ts` into a surviving file (preferred: `preload.test.ts` since `chainAcceptor` lives in `preload.ts`). The two load-bearing cases to preserve: (a) a throwing acceptor does not poison subsequent acceptors in the chain; (b) install order is independent for the surviving bridge.

**Patterns to follow:**
- Existing modular shape of the three `install*Bridge` functions in `preload.ts`. Input-only is just two of three deleted.
- The deleted file's test shape — synthetic acceptors against a chained `__electrobun.receiveMessageFromBun` — translates directly.

**Test scenarios:**

*Migrated to `preload.test.ts` (from the deleted `preload-runtime-bridge.test.ts`):*
- A `chainAcceptor` whose acceptor function throws does not prevent the previously-chained acceptor from receiving the next message.
- Installing the input bridge twice (idempotency / install-order) does not double-deliver actions.

*Unchanged:*
- All existing `installDesktopInputBridge` cases in `preload-input-action-bridge.test.ts` continue to pass without modification.

*Edge case:*
- A deployed webview that still has the old preload loading against a new bun (or vice versa, mid-upgrade): not a concern — the desktop bundle is shipped as a single Nix artifact; both sides update together.

**Verification:**
- `just typecheck` passes.
- `just test-unit` passes.
- Manual: the device boots, connects, and the input bridge still delivers gamepad actions to the React app.

---

### U7. Delete dead renderer files

**Goal:** All renderer-side files made dead by U1–U6 are deleted. The `korri/products/app/features/connection/` directory is removed entirely. `connection-state-bridge.ts`'s `ConnectionServerRecord` re-export is no longer needed because `main.ts` can import the equivalent `ServerRecord` directly from `connection.ts`.

**Requirements:** R1, R5.

**Dependencies:** U5, U6.

**Files:**
- Delete: `korri/products/app/features/connection/ConnectionGate.tsx`
- Delete: `korri/products/app/features/connection/ConnectionGate.test.tsx`
- Delete: `korri/products/app/features/connection/SearchingState.tsx`
- Delete: `korri/products/app/features/connection/SearchingState.test.tsx`
- Delete: `korri/products/app/features/connection/use-connection-state.ts`
- Delete: `korri/deploy/desktop/connection-state-bridge.ts` (the wire-format type module — no longer needed; `ConnectionServerRecord` already lives in `connection.ts` as `ServerRecord`)

**Approach:**
- Pure deletion; preceding units already removed all consumers.
- The renamed `runtime-config-shape.ts` (from U3) survives — it carries `isRuntimeConfig` and the `RuntimeConfig` type. It is **not** deleted here.
- Confirm with `rg` that no remaining file imports the deleted modules or references the deleted symbols.

**Patterns to follow:**
- None; deletion only.

**Test scenarios:**
- Test expectation: none. Coverage gaps are caught by `just typecheck` (dangling imports), `just test-unit` (any test that still imported the deleted modules fails), and the `rg` sweep below.

**Verification:**
- `rg 'ConnectionGate|useConnectionState|SearchingState|connection-state-bridge|pushConnectionStateToWebviews|installConnectionStateBridge|installRuntimeBridge|__korriConnection|__korriRuntime|toBridgeState|attachInitialBridgePushes|installWebviewBridgeFallback'` returns no hits in `korri/` or `tools/`.
- `just typecheck`, `just test-unit`, `just lint` all pass.

---

### U8. Update Nix and Electrobun packaging; extend smoke tests with body-shape assertions

**Goal:** `nix/korri-desktop/unwrapped.nix` postcondition guards include the new packaged assets. `electrobun.config.ts` `copy` map mirrors the Nix layout for dev builds. `tools/desktop/desktop-smoke.ts` asserts body shape (not just liveness) for the new connection-aware serve, the inlined runtime-config, and the connection-status endpoint's JSON shape.

**Requirements:** R8, R9.

**Dependencies:** U1, U2.

**Files:**
- Modify: `nix/korri-desktop/unwrapped.nix` (add `waiting.html`, `waiting.css`, and the bundled polling-loop script to the asserted-present list; update the inline comment that references `window.__korriConnection`)
- Modify: `nix/korri-portal.nix` (refresh the inline comment that references `window.__korriRuntime`)
- Modify: `tools/desktop/desktop-smoke.ts` (replace liveness checks with body-shape checks for the new behaviors)
- Modify: `tools/desktop/desktop-smoke.test.ts` (matching coverage)

(The `electrobun.config.ts` `copy`-map edits are owned by U1 and not duplicated here.)

**Approach:**
- Mirror existing artifact-guard patterns. The Nix derivation already asserts four critical files; add the waiting-page artifacts to the same list. The preload bundle stays (input still needs it).
- Update inline comments in `nix/korri-portal.nix` and `nix/korri-desktop/unwrapped.nix` that reference `window.__korriConnection` / `window.__korriRuntime` to reflect the new architecture.
- `desktop-smoke.ts` already calls `createDesktopApp({…})` with a temp asset root. Extend with explicit body-pinning `SmokeCheck`s, each with configured-real `getConnectionState` / `getRuntimeConfig` fixtures (no `Mock*` / `Stub*` / `Fake*` prefixes):
  - `waiting page served when disconnected`: GET `/` with `getConnectionState` returning `searching`, assert 200 + body contains `Looking for` (parity copy).
  - `waiting page names remembered host when reconnecting`: GET `/` with `reconnecting` + `hostId: "aka"`, assert body contains `aka`.
  - `waiting page omits help block when helpAfter is future`: assert body does *not* contain the help block markup.
  - `waiting page includes help block when helpAfter is past`: assert body contains the help block markup.
  - `connected serve inlines runtime-config — desktopInput true`: GET `/` with `connected` + `getRuntimeConfig` returning `{ desktopInput: true }`, assert body matches a regex pinning `window.__korriRuntimeConfig\s*=\s*\{[^}]*"desktopInput"\s*:\s*true`.
  - `connected serve inlines runtime-config — desktopInput false`: symmetrical with `false`.
  - `connection-status endpoint returns ISO-string timestamps for non-connected states`: GET `/__korri/desktop/connection-status` for each of `searching` / `reconnecting`, parse JSON, assert `status` matches, `since` and `helpAfter` are strings parseable by `Date.parse`, and (for reconnecting) `server.hostId` / `server.controlUrl` are present.
  - `connection-status endpoint omits timestamps for connected state`: GET while `connected`, assert JSON contains `server.hostId` / `server.controlUrl` and no `since` / `helpAfter` (matches today's `toBridgeState` connected wire shape).
  - `disconnected serve does not interfere with /api/*`: GET `/api/health` while `searching`, assert 503 from the existing forwarder (unchanged behavior).
  - `disconnected serve does not interfere with /__korri/desktop/launch`: POST while `searching`, assert the launch bridge's existing 503 response.

**Patterns to follow:**
- Existing artifact-guard list in `nix/korri-desktop/unwrapped.nix`.
- Existing smoke-check shape in `desktop-smoke.ts` (`{ name, status, message }`).
- Configured-real fixture pattern in `create-desktop-app.test.ts` (`noUpstream = () => undefined`, extended here with `disconnectedSnapshot()` / `connectedSnapshot(hostId)` helpers).

**Test scenarios:**
- Happy path: `desktop-smoke` reports `pass` for all of the new body-shape checks against a real `createDesktopApp` instance with a temp asset root.
- Edge case: Nix build fails fast if any of the asserted artifacts is missing (existing pattern, exercised by the new guard entries).

**Verification:**
- `just test-unit` passes (smoke tests included).
- `just live-usb-smoke` or `nix build .#korri-desktop-unwrapped` succeeds and the bundle layout is intact.
- Manual: a Sobo build at this commit deploys, the device shows the waiting page on cold boot, then loads the React app once the controller connects.

---

## System-Wide Impact

- **Interaction graph:** The bun→webview push channel is removed for connection + runtime. The renderer now communicates with bun via two HTTP surfaces only: `/api/*` (RPC), `/__korri/desktop/*` (launch, status). The input bridge keeps its preload + push path. The waiting page communicates with bun via the new `connection-status` endpoint.
- **Error propagation:** A bun crash during disconnected state means the waiting page's poll fails; the page stays as it is and retries. A bun crash during connected state means the React app's `/api/*` calls fail; the existing RPC error path applies. Neither path involves the old IPC.
- **State lifecycle risks:** The connection-state `SubscriptionRef` and `desktop.yaml` persistence are unchanged. The only new persistence concern is whether the inlined runtime-config can drift mid-session — by design it cannot (set-once at boot; the renderer never sees a transition).
- **API surface parity:** `/__korri/desktop/connection-status` is a new endpoint; document its shape in `create-desktop-app.ts` comments alongside `/__korri/desktop/launch`. No other public surface changes.
- **Integration coverage:** `tools/desktop/desktop-smoke.ts` is the canonical integration surface and is extended in U8. The `desktop-smoke` checks run against the real Hono composition without electrobun, which matches the established testing posture.
- **Unchanged invariants:** `/api/*` forwarding, the connection controller's discovery/probe logic, `desktop.yaml`'s shape, the launch-bridge contract, the input bridge transport, the Nix build's four critical packaged artifacts, kiosk sway/Nix orchestration. None of these change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The waiting page's polling JS introduces its own startup race (it polls before bun is fully up). | The first request always comes from the renderer to bun on the same loopback origin; if bun isn't accepting connections, the page renders with no script effect and the browser's request will fail-and-retry on the next poll tick. No new race exposure relative to "the renderer talks to bun at all". |
| Inlining `<script>` into `index.html` collides with CSP if one is added later. | No CSP today; if added, the inlined script can use a nonce templated at the same point. Noted but not a current blocker. |
| Reading + rewriting `index.html` per request adds latency. | The file is small (~few hundred bytes) and the rewrite is a substring inject. Implementation can cache the rewritten body keyed by runtime-config JSON since runtime-config is set-once. `cache-control: no-store` on the served `index.html` ensures the browser does not serve a stale inlined script. |
| Removing `HomeServerRoot` breaks routes that other product surfaces depend on. | The only consumers are `+index.tsx` and `+screen.tsx`, both updated in U4. Confirmed by `rg "HomeServerRoot"`. |
| Mid-upgrade state where bun is new and the bundled React app is stale (or vice versa) leaves a renderer subscribed to `__korriConnection` waiting forever. | The desktop bundle is shipped as a single Nix artifact; both sides update atomically. Not a real risk. |
| The polling-based waiting page flickers on the transition to `connected`. | Polling interval is short enough (~750 ms) that the transition is fast. If perceptible, tune the interval down or fade the page out before reload. |
| Mid-session disconnect (`connected` → `searching`) leaves the React app loaded against a `/api/*` that's now returning 503. | Existing RPC error path surfaces failures to the user; renderer does not auto-recover. Acceptable gap for this plan. If recovery UX becomes important, the renderer can detect a streak of 503s and call `location.reload()` itself — opt-in, one-line, no architectural change. |
| `<RegistryProvider>` disposes its registry on unmount (500 ms grace), which would lose seeded layers if the provider were mounted around a sub-tree that can unmount. | The provider wraps the document-level `<RouterProvider/>`, so it lives for the document's lifetime. Not a real risk in this composition; flagged so future refactors don't move the provider inward. |
| Atom registry identity drift — code writing to atoms uses a different `AtomRegistry` than the React tree reads from, making writes silent. | `<RegistryProvider initialValues={…}>` is the only sanctioned write path in this plan; the registry it creates is the one its children read from by construction. The default module-level registry exposed by `@effect/atom-react` is explicitly not used. |

---

## Documentation / Operational Notes

- After this lands, capture the refactor via `/se-compound`. The institutional gap on preload bridges, `executeJavaScript` races, and the pre-React boot screen is real and worth documenting.
- Update `korri/deploy/desktop/`'s inline comments throughout to remove references to `window.__korriConnection` / `window.__korriRuntime` / push channels that no longer exist.
- No operational rollout concern: the desktop bundle is shipped as a single Nix artifact, deployed via the existing `nix-on-rocks` generation switch. The recurring "Looking for aka…" symptom resolves on the first boot after deploy.

---

## Sources & References

- Origin: live debugging session 2026-05-24; root cause traced to `executeJavaScript` push race; user requested "the right way" structural fix, not a transport patch.
- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`
- `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`
- Related code (touched or referenced):
  - `korri/deploy/desktop/main.ts`
  - `korri/deploy/desktop/create-desktop-app.ts`
  - `korri/deploy/desktop/static-assets.ts`
  - `korri/deploy/desktop/connection.ts`
  - `korri/deploy/desktop/preload.ts`
  - `korri/deploy/desktop/preload-entry.ts`
  - `korri/products/app/features/connection/*`
  - `korri/products/app/routes/+__root.tsx`
  - `korri/products/app/features/home/HomeServerRoot.tsx`
  - `korri/deploy/portal/main.tsx`
  - `nix/korri-desktop/unwrapped.nix`
  - `electrobun.config.ts`
  - `tools/desktop/desktop-smoke.ts`
