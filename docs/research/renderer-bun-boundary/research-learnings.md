# Institutional Learnings Search Results

## Search Context

- **Feature/Task**: Refactor Korri desktop to remove racy bun→webview `executeJavaScript` IPC for connection-state and runtime-config. Move "Looking for server" UX out of the React bundle into a bun-served pre-React waiting page; inline runtime-config into the served `index.html`; consolidate launch-layer selection at the composition root; keep `window.__korriInput` (preload bridge for input) as-is. Update tests accordingly.
- **Keywords used**: `electrobun`, `executeJavaScript`, `preload`, `webview`, `window.__korri*`, `IPC`, `bun→webview`, `connection`, `mDNS`, `aka`, `desktop.yaml`, `Looking for`, `searching`, `waiting`, `loading`, `boot`, `hono`, `index.html`, `inline runtime config`, `composition root`, `layering`, `shared/product`, `deploy`, `race`, `stale`, `stuck`, `push`, `startup`, `useConnectionState`, `SearchingState`.
- **Files Scanned**: 33 docs across `docs/solutions/{architecture-patterns,best-practices,build-errors,design-patterns,integration-issues,ui-bugs,workflow-issues}`.
- **Relevant Matches**: 8 directly applicable, plus 1 tangential boundary-condition reference.

### Critical Patterns

`docs/solutions/patterns/critical-patterns.md` does not exist in this repo — no must-know cross-cutting patterns file to honor. (The convention is optional; flagging the absence so future research callers know.)

### Explicit gaps — no prior learning exists for these areas

The following caller questions returned **nothing applicable** in `docs/solutions/`. The plan is breaking new institutional ground on each of them; capturing the outcome via `/se-compound` after it lands is worth doing.

- **electrobun preload bridges, `executeJavaScript`, or push-style bun→webview IPC.** The only `window.__korri*` precedent on file is `window.__korriSpatialNav` in the spatial-navigation doc, which is a renderer-internal singleton, not a bun→webview push channel. No documented post-mortem of the `executeJavaScript` race or of `window.__korriConnection` / `window.__korriRuntime` specifically.
- **The connection controller, mDNS discovery, remembered-server probes, or `desktop.yaml`.** These names appear nowhere in the solutions corpus. mDNS is mentioned only server-side in the boot-scoped control-plane pattern (deduplication / port binding), not in renderer or discovery contexts.
- **The "Looking for aka…" / Searching UX, `useConnectionState` hook, or SearchingState component.** No prior doc — the connection-gate UX is undocumented institutional knowledge.
- **How portal vs desktop deploys differ at boot.** Only the desktop loopback composition is documented; the portal boot path is not contrasted anywhere.
- **Full-screen waiting/loading visual conventions specifically.** General fluid-token + container-query guidance applies (see finding #7), but there is no dedicated learning about pre-React boot screens.
- **Prior post-mortems of the same "stuck on Looking for aka" bug or analogous race conditions** in the bun↔webview boundary. None.

## Relevant Learnings

### 1. Electrobun desktop wrappers should preserve web/API same-origin contracts

- **File**: `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`
- **Module**: `korri/deploy/desktop` + `tools/desktop`
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: This is the original architectural decision for the file the plan is editing (`korri/deploy/desktop/create-desktop-app.ts`). It establishes that the desktop boundary is a `127.0.0.1:<port>` loopback Hono app that:
  - delegates `/api`, `/api/*` to the shared `honoApp`
  - serves static portal files for non-API paths
  - falls back to `index.html` for route-like SPA paths
  - opens `BrowserWindow` at `http://127.0.0.1:<port>/`

  The plan's pre-React waiting page and inlined runtime-config sit exactly on top of this boundary — both extend the existing "Hono owns serving" composition rather than replacing it.
- **Key insights for the plan**:
  - Keep the composition thin and additive (this doc's literal wording). Do not duplicate RPC handlers, middleware, or health routes in the desktop layer. The new "connected/disconnected" branching belongs alongside the existing `app.get("*", c => serveStaticAsset(c.req.raw, options))` line, not inside a new layered abstraction.
  - SPA-fallback handling is already split: `/` and route-like misses get `index.html`; `/assets/missing.js` returns 404. The new "serve pre-React waiting page while disconnected" logic needs to compose with — not bypass — those rules. Most likely: the "what do we serve at `/` and route-like paths" decision branches on connection state; everything else is unchanged.
  - **Smoke test is non-native and lives at `tools/desktop/desktop-smoke.ts`.** This is the right seam to add coverage for the new "serves waiting page when disconnected; serves React app when connected" contract without needing Electrobun to launch.
  - Browser-side code uses relative URLs; do not introduce desktop-specific transports to ferry connection state. The inlined-config approach honors that — `index.html` reads the config in-process; nothing crosses an IPC boundary at runtime.

### 2. Product-owned composition keeps shared layers reusable

- **File**: `docs/solutions/best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`
- **Module**: `korri/shared` boundaries + `korri/products/app/api`
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: Directly governs the plan's "consolidate launch-layer selection at the composition root" move. The standing rule: files that choose a product's endpoints, handlers, live layers, or HTTP app routes are product-owned composition, even when they look like plumbing. `korri/deploy/desktop/create-desktop-app.ts` is a composition root in the sense this doc means — it picks the product Hono app and wires it to the desktop loopback origin. The new layer-selection logic belongs there, not in `korri/shared/*`.
- **Key insights for the plan**:
  - **Direction of imports**: `deploy/desktop` may import the product Hono app (`@app/api/hono-app`) and shared primitives. `korri/shared/**` MUST NOT import `@app/*` or relative paths into `korri/products/*`. The executable guard for this rule lives as a test (see this doc's "Add executable standards guards" section) — if the refactor touches `korri/shared/api/*` it will fail that scan if it picks up product-specific imports.
  - When deciding where to put the bun-side connection probe / layer-selector: if it chooses concrete app behavior (which RPC group, which live layer), it belongs under `korri/products/app/*` or `korri/deploy/desktop/*`. If it's a generic transport probe ("HTTP GET this URL, observe shape"), it can live in `korri/shared/*`. The plan should explicitly choose; the doc's standards-drift narrative is exactly the failure mode the refactor risks if launch-layer plumbing creeps into `korri/shared`.
  - **No barrel exports** beyond documented module entrypoints. The pre-React waiting page's runtime-config seam should not become an ad-hoc re-export hub.

### 3. React state components over async-state render props for Effect atoms

- **File**: `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- **Module**: `korri/frontend-runtime` + react-component-architecture
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: When connection-state UI leaves the React bundle, the React renderer's job simplifies: it boots only after bun has decided we're connected, so the React tree no longer needs `Loading | Searching | Connected` branching at the very top. If `useConnectionState` / `SearchingState` are removed and any of their remnants get re-applied to a different feature (a post-connect "library hydrating" or "RPC unavailable" panel), this is the documented pattern: convert async primitives into a domain ADT at the seam, then compose self-selecting state components — do not branch on raw `AsyncResult` in JSX.
- **Key insights for the plan**:
  - The plan should explicitly note: after the refactor, the React app's contract becomes "always boots into the connected state". Any leftover JSX that branches on a connection-status boolean is now dead. Removing it is part of the cleanup, not a follow-up.
  - If any of the existing connection-gate code converted RPC `Result` / `Exit` values into a connection ADT, that conversion logic is now bun-side, not React-side. The bun side has no React; the same FP-style pure conversion (described in this doc's section 1) still applies but lives in plain TypeScript modules.
  - **Do not introduce a generic `<ResultBoundary>{success => ...}</ResultBoundary>` to replace the connection gate.** This doc explicitly calls that out as the pattern to avoid.

### 4. Prefer real implementations over mocks in unit, integration, and BDD tests

- **File**: `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
- **Module**: testing
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: Direct guidance for "we will need to update tests" in the plan. Connection-controller tests should follow the same posture: real in-process Hono / real `Bun.spawn` / configured-real seam — never `MockConnectionController`, never a `__korriConnection`-style window swap inside tests.
- **Key insights for the plan**:
  - The substitution surface is *the launch target binary and wall-clock time only*. A test for "bun serves waiting page while connection probe pending, then serves React bundle once it succeeds" should drive a real in-process server with a configured-real probe (delay-controllable, outcome-controllable) — not a stubbed connection controller.
  - The configured-real shape is on the **real** type: e.g., `interface ConnectionProbeConfig { url: string; intervalMs: number; ... }`. Do not fork a `TestConnectionController` alongside the production one.
  - Naming: `configure...ForTesting(realImpl)`, not `set...ForTesting(stub)`. There is a guarded test in this repo (scan under `SCAN_ROOTS` per doc #2) that flags `Mock*` / `Stub*` / `Fake*` prefixes in source identifiers. New test infrastructure that triggers it will fail CI.
  - **Drop unit tests for thin composition wrappers.** A React component that consumed `useConnectionState` and rendered one of three states had no behavior worth testing past the underlying ADT. After the refactor, the equivalent test is BDD-against-real-stack ("desktop serves the waiting page until the local API is up, then serves the React app") plus a unit test for the bun-side probe's configured-real seam.

### 5. "Failed to send HTTP request" in real-RPC tests means `window.location.pathname` is unset

- **File**: `docs/solutions/integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md`
- **Module**: testing
- **Problem Type**: `integration_issue`
- **Severity**: medium
- **Relevance**: Only bites tests that exercise the real `runRpc` client under happy-dom (i.e., React-hook tests that go through `RpcClientLive` → `prependUrl("/api/rpc")` → `fetch`). If the refactor adds renderer-side tests that round-trip the new connection-aware boot through real RPC, they will hit this gotcha unless the harness sets `window.location.pathname` explicitly. The doc proposes promoting `pointWithRpcHarness(harness)` into `tools/testing/library/with-rpc-server.ts`. Worth verifying it's already there before writing new tests; otherwise reproduce the three `Object.defineProperty` calls (`origin`, `href`, **and** `pathname`).
- **Key insight**: If a test fails with `RpcClientError: Failed to send HTTP request` and a `fetch` shim is never called, the failure is upstream of fetch in URL construction — log `error.cause` to see the `RequestError: InvalidUrl` underneath, then check that all three location fields are set.

### 6. Electrobun Linux build emits an incomplete flat bundle inside Nix sandbox

- **File**: `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`
- **Module**: `korri/deploy/desktop` + `nix/korri-desktop.nix`
- **Problem Type**: `integration_issue`
- **Severity**: high
- **Relevance**: Establishes the on-disk layout of the packaged desktop bundle, which is exactly where the inlined-config `index.html` and any pre-React waiting page assets end up at runtime:

  ```
  Resources/app/bun/index.js                          # bun entrypoint
  Resources/app/views/mainview/index.html             # the React shell
  Resources/app/views/mainview/assets/...             # built portal assets
  Resources/version.json
  Resources/build.json
  ```

  The plan inlines runtime-config into the served `index.html`. There are two `index.html`s in play depending on viewing angle: the build-time artifact at `Resources/app/views/mainview/index.html` (what Electrobun packages) and the runtime-served document that bun's Hono app returns. The current architecture (doc #1) is that bun **serves static files from the packaged tree**, so any "inline runtime-config into index.html" implementation needs to either (a) inline at request time by reading the packaged file and templating, or (b) inline at build time, accepting that the same packaged index.html serves every connection state. Choice (a) is the natural one given the loopback architecture; the request handler in `serveStaticAsset` is the place where the connection-state branch already wants to live.
- **Key insights for the plan**:
  - **The four critical files** (`Resources/app/bun/index.js`, `Resources/app/views/mainview/index.html`, `Resources/version.json`, `Resources/build.json`) are guarded by both `electrobun.config.ts`'s `copy:` map and the Nix derivation's postcondition asserts. Adding a new pre-React waiting page asset means deciding whether it ships alongside `index.html` in `views/mainview/` (yes for clarity) and adding it to those guards if you want first-class artifact protection.
  - **The desktop entrypoint MUST be named `index.ts`.** Don't rename `korri/deploy/desktop/index.ts` during the refactor.

### 7. Fluid theme tokens and container queries for handheld-to-TV scaling

- **File**: `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
- **Module**: `korri/shared/primitives/theme` + AGENTS.md
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: The pre-React waiting page is a new full-screen UI surface; this is the standing visual-design discipline for any such surface in Korri. The page lives outside the React bundle but cannot live outside this convention — that would create a parallel visual language at boot time.
- **Key insights for the plan**:
  - **No inline `style={{...}}` / no raw pixel values in `<style>` blocks / no Tailwind arbitrary-value escapes.** Use named theme tokens via Tailwind utilities or CSS variables. The pre-React page is HTML+CSS only (no React) — that means a `<style>` block referencing the same `--text-*`, `--spacing`, and color tokens, not handwritten px values.
  - Declare `container-type: inline-size` on the root element so `cqi`-based tokens resolve correctly. Without a container declared, `cqi` falls back to viewport — usually fine, but cementing the container declaration is one fewer thing to drift later.
  - **"Default toward the middle of the scale"** (from `[LATTICE STACK]` Visual Design): a waiting page is a hero/feature surface, not fine print. Headline/status copy uses body-or-larger steps, not `text-sm`/floor. Padding lives at generous spacing steps.
  - This page must not import any React, theme provider, or atom — but it can `@import` (or `<link>` to) the same theme stylesheet to inherit the same tokens. Decide explicitly: a shared CSS file under `korri/shared/primitives/theme/` (currently `styles.css`) is exactly the kind of artifact that can be linked from both the React shell and a static boot page without creating a shared/product violation. Confirm during implementation.

### 8. Device-agnostic spatial navigation without coupling components (precedent for `window.__korri*` globals)

- **File**: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`
- **Module**: `shared/input` + `shared/navigation`
- **Problem Type**: `best_practice`
- **Severity**: medium
- **Relevance**: Establishes the *existing* `window.__korri*` precedent that the plan intentionally retains for `window.__korriInput`. The pattern: stash a disposable handle on `window`, dispose before re-init on HMR. The plan explicitly keeps `window.__korriInput` as-is — this doc explains *why* that pattern works (renderer-internal singleton, no cross-process push) and implicitly contrasts with the racy `window.__korriConnection` / `window.__korriRuntime` that the plan is removing (those crossed a process boundary via `executeJavaScript`, which is a fundamentally different shape from a renderer-side dispose-and-replace singleton).
- **Key insight**: Re-validate during the refactor that `window.__korriInput` is renderer-internal in this same sense — produced and consumed inside the webview, with no `executeJavaScript` push from bun. If it's actually push-shaped, it has the same race exposure as the connection globals and the plan's claim that it can stay "as-is" is shakier than it sounds.
- **Tangential note**: The doc's Storybook integration section (`window.__korriSpatialNav?.dispose(); window.__korriSpatialNav = startSpatialNavigation()`) is the canonical HMR-safe shape for a renderer-side global. Any new bun→webview seam that survives this refactor should be expressed in a form whose lifecycle is observable, not silently replaced.

### Tangential / context-only

- **`docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`** — Server-side (boot/session scope, `/run/<name>`, mDNS deduplication). Not about the desktop renderer or webview IPC. *Conceptually adjacent*: it documents replacing a process-push contract with a filesystem-shared, runner-pulls-at-startup substrate (`RuntimeDirectoryPreserve = "yes"` so intents outlive the producer). The plan's analogous move is replacing `executeJavaScript` push with an HTTP-served `index.html` whose contents the renderer pulls on every load. The general shape — "don't push state across a process boundary; let the consumer fetch a durable representation" — is the same. Cite only if a comparable framing helps the plan narrative.
- **`docs/solutions/integration-issues/2026-05-02-bdd-fixture-deferred.md`** — Documents a `globalSetup`-driven Playwright fixture pattern and a test-mode admin endpoint (gated on `KORRI_BDD_TEST_MODE=true`) for swapping library state mid-scenario. If new BDD coverage for the connection-gate refactor wants to exercise "API not yet up → API up" transitions, this is the existing playbook for delayed/state-driven test seams.

## Recommendations

1. **Land the connection branch inside `create-desktop-app.ts`'s existing static-asset handler, not as a new layer.** The same-origin loopback doc is explicit that the desktop composition stays thin and additive. The new code is a branch in `serveStaticAsset` (or its caller) that returns a pre-React waiting HTML response when disconnected and the packaged `index.html` (with inlined runtime-config) when connected — not a new module or middleware.

2. **Put the bun-side connection probe and layer-selection logic in `korri/deploy/desktop/` or `korri/products/app/`, never `korri/shared/`.** It chooses concrete product behavior. Run the executable shared/product boundary test (referenced in doc #2) after the refactor to confirm — that scan exists and will catch drift.

3. **Inline runtime-config at request time, not build time.** The desktop Hono app already reads `Resources/app/views/mainview/index.html` from disk. Templating it at request time keeps a single packaged artifact and lets the inlined config reflect the live bun state — connection target, capability flags, anything. Build-time inlining freezes the config to whatever existed during `nix build`.

4. **Audit `window.__korriInput` for push-shape exposure before declaring it "stays as-is".** The decoupled-spatial-navigation doc (#8) shows the existing `window.__korri*` precedent is renderer-internal, not cross-process. If `__korriInput` is actually written from bun via `executeJavaScript`, it has the same race-condition shape as the removed globals; either rewrite it the same way (preload-installs a handle that pulls from a bun-served endpoint) or document explicitly why the race is benign in this case.

5. **Write the pre-React waiting page against the existing fluid-token stylesheet.** Link `korri/shared/primitives/theme/styles.css` (or the equivalent built CSS) from the static HTML; do not handwrite px values. Declare `container-type: inline-size` on the root. Default to mid-scale type and generous padding — this is a hero state, not a status bar.

6. **Update tests against real implementations, not mocks.** New tests for the bun-side connection probe should be configured-real (probe URL, interval, outcome injected on the real type, not a `MockProbe`). New tests for "desktop serves waiting page when disconnected" should run against the real desktop Hono composition through `tools/desktop/desktop-smoke.ts` (which already exists for non-native HTTP composition checks). If any new test exercises the React app's RPC via happy-dom, set all three `window.location` fields per doc #5.

7. **Plan to capture this refactor with `/se-compound` after it lands.** The institutional gap on preload bridges, executeJavaScript races, the connection controller, and the pre-React boot screen is real — there is no prior learning that covers the actual failure mode the plan is fixing or the resulting architecture. This is exactly the shape of work worth documenting once the dust settles.
