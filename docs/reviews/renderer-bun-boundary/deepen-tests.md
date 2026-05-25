# Test-coverage review: `2026-05-24-004-refactor-renderer-bun-boundary-plan`

Scope: assess the plan's `Test expectation: none` declarations and the integration-coverage strategy that's meant to backfill the deleted unit tests. Find concrete gaps and migrations that the plan does not currently call out.

---

## 1. Is the `Test expectation: none` posture sound? — Mostly yes, with caveats

### Precedent in this repo

`rg "Test expectation: none" docs/plans/*.md` shows ~17 plans using the phrase. Every legitimate use follows the same shape: the unit has no exported behavior worth asserting in isolation, and the plan **explicitly names where coverage flows through**. Representative examples:

| Plan | Unit type | Stated coverage path |
|---|---|---|
| `2026-05-20-005-refactor-desktop-unwrapped-wrap-split-plan.md` U2 | Pure Nix derivation simplification | "Coverage flows through U3's portal-side tests and U8's end-to-end hardware verification." |
| `2026-05-20-005-…` U5/U6/U7 | Sub-derivations with no JS surface | "Coverage flows through U7 / U8 (nix-eval / build / device smoke)." |
| `2026-05-21-003-refactor-korri-kiosk-modules-plan.md` | Documentation-only | "Review should verify docs match the module names." |
| `2026-05-24-001-feat-game-assets-pipeline-plan.md` U1 | Ephemeral shell precursor depending on external API key | "Service tests in U2 validate the manifest contract." |
| `2026-05-20-003-…` | Downstream NixOS host config | "Validated through NixOS evaluation/build rather than Bun tests." |

The 004 plan follows that pattern — every `Test expectation: none` block points at another unit (U1 + U8, or `launcher-layer-bridge.test.ts`, or `just typecheck`) as the load-bearing coverage. So the *posture* is sound.

### What is **not** sound

The precedents above almost always either (a) carry zero exported behavior (Nix glue, docs) or (b) hand work off to a sibling unit that *does* have explicit assertions. The 004 plan has two units where the hand-off is weaker than it looks:

- **U3 (renderer reads inlined runtime-config).** Justified as "composition root with no exported behavior" — but U3 implicitly also keeps or rewrites the runtime-config *type guard* that validates `window.__korriRuntimeConfig`. The plan says `runtime-config-bridge.ts` may be "kept only as a type if still referenced" or deleted. If `isRuntimeConfigBridgeState` survives in any form, **its dedicated test file (`runtime-config-bridge.test.ts`, 5 cases) must survive too**. If it is replaced by a smaller inline guard, the inline guard needs equivalent coverage. The plan does not pin this.
- **U6 (delete bun-side push + slim preload).** `preload-runtime-bridge.test.ts` carries genuine cross-cutting coverage of `chainAcceptor` (handler-isolation under throws, install-order independence). U6 keeps `chainAcceptor` (input still uses it), but the only file that exercises its isolation property is the one being deleted. After U6, no test asserts that a throwing acceptor doesn't poison the chain — and the input bridge is the only consumer left, so the property is still load-bearing.

These are the two real `Test expectation: none` overreaches. Both are fixable without changing the plan's overall shape; they just need explicit migration callouts. See gaps **G1**, **G2**, **G5** below.

---

## 2. Is `desktop-smoke` strong enough to be the integration substrate? — The pattern is right; the surface needs more shape

### What `tools/desktop/desktop-smoke.ts` does today

The smoke harness is the right seam — it builds `createDesktopApp({ assetRoot, getUpstream })` against a temp asset root with configured-real accessors (`noUpstream = () => undefined`) and asserts `{ name, status, message }` per check. Three checks today: portal root, API forwarder mounted (503 expected), representative asset. Test file (`desktop-smoke.test.ts`) is correspondingly thin: 4 cases.

### Why it isn't yet sufficient

The current checks are *liveness*-oriented (status code, presence of mount). After this refactor, the smoke harness becomes the canonical integration coverage for **what the served HTML actually contains** — and that's a body-shape concern, not a liveness concern.

Specifically, the plan promises the smoke covers:

1. Waiting page served when disconnected — needs body to *contain* the parity copy ("Looking for a Korri server…", "Ethernet", help block).
2. React bundle served when connected — needs body to *contain* the inlined `window.__korriRuntimeConfig` script.
3. `GET /__korri/desktop/connection-status` returns current snapshot — needs JSON shape pinned (ISO-string `since` / `helpAfter`, `server.hostId`, `server.controlUrl`).
4. Inlined runtime-config reflects `getRuntimeConfig()` (both `desktopInput: true` and `desktopInput: false`).

None of those four are body-pinning checks today. Extending `desktop-smoke` to do this is mechanical — add new `SmokeCheck`s that assert via substring/JSON parse — but the plan currently only says "Assert `GET /` with `getConnectionState` returning `searching` produces the waiting-page body" without pinning what *content* counts as "the waiting-page body".

The pattern to mirror is `create-desktop-app.test.ts`, which uses one focused test per route × upstream-fixture cross-product:

```ts
test("uses SPA fallback for non-file routes", async () => {
  await writeFixture("index.html", "<html>Route Shell</html>")
  const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })
  const response = await app.fetch(request("/games/123"))
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("<html>Route Shell</html>")
})
```

The smoke check should adopt the same "real composition, configured-real accessor, pinned body assertion" shape. See gap **G3**.

---

## 3. Patterns in `create-desktop-app.test.ts` the plan should mirror but doesn't

`create-desktop-app.test.ts` has 6 tests covering the full cross-product of routes (`/`, `/api/*`, `/assets/*.js`, SPA fallback, missing assets, RPC POST) against a single configured-real `noUpstream`. The discipline is one test per (route, upstream-state) pair.

The plan adds two new accessors (`getConnectionState`, `getRuntimeConfig`). The same discipline applies: every relevant route × accessor-state combination needs a test. The plan's U1/U2 test scenarios list six concrete cases but **omits the cross-product cases that the existing file would suggest**:

| Route | `getConnectionState` | `getRuntimeConfig` | Listed in plan? |
|---|---|---|---|
| `/` | `connected` | `desktopInput: true` | ✅ (U2) |
| `/` | `connected` | `desktopInput: false` | ✅ (U2) |
| `/` | `searching` | _any_ | ✅ (U1) |
| `/` | `reconnecting` (named host) | _any_ | ✅ (U1) |
| `/games/123` (SPA fallback) | `searching` | — | ⚠️ flagged as "edge case", behavior left to implementation |
| `/games/123` (SPA fallback) | `connected` | `desktopInput: true` | ❌ — not listed, but the runtime-config inliner must apply here too |
| `/assets/app.js` | `searching` | — | ⚠️ same flag |
| `/api/*` | `searching` | — | ❌ — not listed. Does the forwarder still respond, or does the waiting branch short-circuit? |
| `/__korri/desktop/launch` | `searching` | — | ❌ — not listed. Probably must still work (the device launches things before/during reconnect cycles). |
| `/__korri/desktop/connection-status` | each of `connected` / `searching` / `reconnecting` | — | ✅ for one case in U1, but not the JSON-shape per status |

The "flagged as edge case, decided at implementation" cases in U1 are explicit punts. That's defensible for the SPA-fallback case (the chosen behavior is a one-line decision). It is **not** defensible for `/api/*` and `/__korri/desktop/launch` during disconnected state — those routes interact with the connection controller and have real risk of regressing. See gap **G4**.

---

## 4. Waiting-page polling script: needs unit coverage, not just smoke

The waiting page is a static HTML asset containing an inline `<script>` that:

1. `fetch('/__korri/desktop/connection-status')` on an interval (~750 ms).
2. Reads JSON `{ status, server?, helpAfter? }`.
3. If `status === "connected"`, `location.reload()`.
4. Otherwise schedules the next poll.
5. Possibly toggles a `helpAfter`-gated DOM element.

This is non-trivial behavior shipped as part of a packaged artifact, and **none of the planned tests exercise it**. The plan's U1 covers serving the page; U8 covers smoke-level integration. Neither asserts what happens when the polling script runs.

Repo precedent does support a happy-dom test here. `tools/testing/happydom.ts` is set up to register the DOM globally for bun tests; many adapter tests use it (e.g., `keyboard-adapter.test.ts`, `wheel-adapter.test.ts`). The `desktop-bridge-adapter.test.ts` pattern — load a real script, drive it with configured-real fetch / DOM, assert observable behavior — is the right shape.

A minimal happy-dom test would:

- Read the packaged `waiting.html` from disk into `document.documentElement.innerHTML`, *or* import the polling-script module if extracted from the inline `<script>` (see G6 below — extracting makes this easier).
- Replace `globalThis.fetch` with a configured-real that returns a queue of canned `Response` objects.
- Replace `globalThis.location.reload` with a recorder.
- Tick the polling timer with `setTimeout`/`setInterval`-aware test time (or fast-poll via the script's own scheduling).
- Assert: (a) the first poll targets `/__korri/desktop/connection-status`, (b) `reload()` is called exactly once when status flips to `connected`, (c) `reload()` is not called when status stays `searching`, (d) malformed JSON does not crash the loop, (e) `helpAfter`-gated DOM appears after that timestamp.

See gap **G6**.

---

## 5. Storybook coverage for the static waiting page? — No, not warranted

No precedent in this repo for a Storybook story of a non-React static asset. The 25 `.stories.tsx` files all live alongside React components/Roots (`korri/shared/themes/shift/**`, `korri/shared/primitives/**`). Storybook's harness — `@storybook/react-vite` — is React-only as configured here.

Two consequences:

- **Don't add a Storybook story** for `waiting.html`. There's no infrastructure for it and no convention to copy.
- **But the visual-content guarantees the old `SearchingState.test.tsx` covered are still load-bearing.** That file (3 tests) asserted: searching copy, reconnecting copy with named host, help-text visibility before/after `helpAfter`. Those assertions migrate either to:
  - The new `desktop-smoke` / `create-desktop-app` checks (substring assertions on served body), or
  - A happy-dom test of the rendered waiting page (per G6).

The plan currently says U1 will assert "the body contains the generic 'Looking for a Korri server…' title" and "the body contains `aka` in the title" — that covers cases 1 and 2 of the old `SearchingState.test.tsx`. **Case 3 (help-text visibility based on `helpAfter`) is not in the plan**. See gap **G7**.

---

## 6. Orphaned coverage that needs migration

| Test file deleted by plan | What it covers today | Where coverage must land after the refactor |
|---|---|---|
| `korri/deploy/desktop/preload-runtime-bridge.test.ts` (U6) | `installRuntimeBridge` behavior; `chainAcceptor` cross-bridge isolation; install-order independence | (a) Runtime-config validation moves to the renderer's inline guard — needs its own test (G1). (b) `chainAcceptor` isolation is still load-bearing for `installDesktopInputBridge`. The "throwing acceptor doesn't poison the chain" property has no remaining test after U6 (G2). |
| `korri/deploy/desktop/to-bridge-state.test.ts` (U7) | Date → ISO conversion across all three `ConnectionState` cases | Goes to `create-desktop-app.test.ts` U1 scenarios. Plan says "JSON matching the current snapshot" generically; should pin ISO-string shape per status (G4). |
| `korri/deploy/desktop/runtime-config-bridge.test.ts` (U7, optional) | `isRuntimeConfigBridgeState` type guard | If guard survives in any form, test must survive. If guard is replaced by an inline check in `portal/main.tsx`, that check needs its own test seam (G1). |
| `korri/products/app/features/connection/ConnectionGate.test.tsx` (U7) | Gate behavior across each bridge state; transition from searching → connected mounts children | Architecturally moot — gate is deleted. But the *system property* it asserted ("React never renders before connected") now lives in `create-desktop-app.test.ts` (waiting page served when disconnected) + the new happy-dom polling-script test (`reload()` only fires on `connected`). The plan should explicitly note the property migrates. |
| `korri/products/app/features/connection/SearchingState.test.tsx` (U7) | Visual content of searching copy, reconnecting copy with named host, help-text timing | Migrates to waiting-page assertions (server body substring or happy-dom render). Plan covers two of three cases; misses help-text timing (G7). |
| `korri/deploy/desktop/preload.test.ts` `installConnectionStateBridge` block (U6 deletes parts) | Connection-state push and type-guard tests | Type-guard tests are orphaned with the module. The same JSON shape is now produced by `/__korri/desktop/connection-status` and consumed by the waiting-page polling script. Validation-on-consumer side has no test (G6). |

---

## Concrete gaps to add to the plan

### G1. Pin the validation seam for inlined `window.__korriRuntimeConfig`

**Where:** U3.

**Why:** The plan says "delete `runtime-config-bridge.ts`" *or* "keep only the type". If the guard `isRuntimeConfigBridgeState` is kept (likely needed — `window.__korriRuntimeConfig` is untrusted-shape input from the page, even if the page is our own), its 5-case test file must be kept too. If the guard is rewritten inline in `portal/main.tsx`, that change needs an extracted, testable helper.

**Concrete fix to the plan:** Decide between two options in U3 and pin it:

- **Option A (preferred — minimal churn):** Keep `runtime-config-bridge.ts` and its test file. Remove the "bridge framing" doc comment, rename the file to `runtime-config-shape.ts` if its old name no longer fits. Test scenarios: unchanged 5 cases.
- **Option B:** Extract a small `readInlinedRuntimeConfig(target: Window): RuntimeConfig` helper next to `portal/main.tsx`. Add `read-inlined-runtime-config.test.ts` with cases: present-and-valid (returns it), absent (returns default), present-but-wrong-shape (returns default), `desktopInput` is wrong type (returns default).

Either way, the validation-on-consumer-side coverage from `runtime-config-bridge.test.ts` must not disappear.

### G2. Cover `chainAcceptor` isolation with the single remaining consumer

**Where:** U6.

**Why:** `chainAcceptor` (in `preload.ts`) survives U6 because the input bridge uses it. Its non-trivial property — "a throwing acceptor doesn't poison the chain for subsequent acceptors" — is currently only tested in `preload-runtime-bridge.test.ts`, which U6 deletes. Even with a single consumer (input), if any code path adds a second acceptor in the future, this property is load-bearing.

**Concrete fix:** Add to `preload-input-action-bridge.test.ts` (the surviving preload test file) at least one case that exercises the isolation property — e.g., install the input bridge twice, throw from one subscriber, assert the other still receives messages. Or add a tiny `chain-acceptor.test.ts` that exercises `chainAcceptor` directly with two synthetic acceptors. The latter is closer to the deleted file's intent and survives any future preload module reshuffle.

### G3. Body-shape assertions in `desktop-smoke`, not just status codes

**Where:** U8.

**Why:** The smoke check is the canonical integration surface for the new connection-aware serve. The plan says it will assert "the waiting-page body" and "an HTML body containing the inlined runtime-config script" but doesn't pin the substrings. The existing checks are status-code/empty-error checks; the new checks need to be content checks to actually catch regressions in the served body shape.

**Concrete fix:** Extend `runDesktopSmoke` (and its test) to add these explicit `SmokeCheck`s, each with a configured-real `getConnectionState`/`getRuntimeConfig`:

- `waiting page served when disconnected`: GET `/`, assert 200 + body contains `Looking for` (parity copy from `SearchingState`).
- `waiting page names remembered host when reconnecting`: GET `/` with `getConnectionState` returning a `reconnecting` snapshot, assert body contains the `hostId`.
- `connected serve inlines runtime-config — desktopInput true`: GET `/`, assert body matches `window.__korriRuntimeConfig\s*=\s*\{[^}]*desktopInput\s*:\s*true`.
- `connected serve inlines runtime-config — desktopInput false`: symmetrical.
- `connection-status endpoint returns ISO-string timestamps`: GET `/__korri/desktop/connection-status`, parse JSON, assert `status`, `since` and `helpAfter` are strings parseable by `Date.parse`, `server.hostId` / `server.controlUrl` present when expected.

The fixtures should follow `noUpstream = () => undefined` shape from `create-desktop-app.test.ts` — configured-real values, not `Mock*`.

### G4. Add explicit `create-desktop-app.test.ts` cases for the omitted (route × connection-state) combinations

**Where:** U1.

**Why:** The plan lists 4 happy paths and 2 edge cases, but the existing test file's discipline is to cover the full cross-product of (route, accessor-state). The omitted combinations cover real regression risk.

**Concrete fix:** Add to `create-desktop-app.test.ts`:

- `/api/health` while disconnected → forwarder still mounted, behaves identically to connected case (assuming no change is intended; the plan doesn't say it should change).
- `/__korri/desktop/launch` while disconnected → returns the same response as today (assuming no change). If the plan intends launches to be blocked while disconnected, that's a behavior change that must be pinned.
- `/games/123` (SPA fallback) while disconnected → returns waiting-page HTML *or* a 404. Pin the chosen behavior. The plan currently calls this out as "decided in implementation" — that's fine for the *answer*, but the *test* must pin whichever answer wins.
- `/assets/app.js` while disconnected → returns 404 (per the plan's working assumption) — pin it.
- `/__korri/desktop/connection-status` for each of `searching`, `reconnecting`, `connected` → JSON shape per status, including ISO-string `since`/`helpAfter` for the two non-connected cases (this carries over the deleted `to-bridge-state.test.ts` Date→ISO coverage).

### G5. Address the missing `selectLauncherLayer(runtime)` extraction in U4

**Where:** U4.

**Why:** The plan says launcher-layer selection moves to `portal/main.tsx` driven by `runtime.desktopInput`. It then declares `Test expectation: none` because `portal/main.tsx` is a composition root. But the *selection rule itself* — `desktopInput ? LauncherLayerBridge : LauncherLayerRpc` — is logic, not composition. Composition is `setLauncherLayer(layer)`. The selection rule deserves its own seam.

**Concrete fix:** Extract a tiny pure function next to `portal/main.tsx`:

```ts
// korri/deploy/portal/select-launcher-layer.ts
export function selectLauncherLayer(runtime: RuntimeConfig) {
  return runtime.desktopInput ? LauncherLayerBridge : LauncherLayerRpc
}
```

Add `select-launcher-layer.test.ts` with two cases: `desktopInput: true → Bridge`, `desktopInput: false → Rpc` (assert the layer identity, not its behavior — behavior is already covered by `launcher-layer-bridge.test.ts` and `library-rpc-layers.test.ts`).

This keeps `portal/main.tsx` as a true composition root (pure `setLauncherLayer(selectLauncherLayer(runtime))`) and lets the selection rule be tested without spinning up the React renderer.

### G6. Add a happy-dom test for the waiting-page polling script

**Where:** New file, e.g. `korri/deploy/desktop/waiting-page/polling-script.test.ts`.

**Why:** The inline polling script ships in the bundle and decides when the device transitions from waiting to React. If it polls the wrong endpoint, reloads on the wrong condition, or crashes on malformed JSON, neither typecheck nor any planned test catches it. The desktop-smoke check only exercises the *server* serving the page, not the *client* script executing on the page.

**Concrete fix:** Extract the polling logic from the inline `<script>` into a small module (`polling-loop.ts`) that takes injected `fetch`, `reload`, and `setInterval` — i.e., the same "configured-real over inverted dependencies" pattern the rest of the codebase uses. The inline `<script>` becomes a 2-line bootstrap; the module is unit-testable.

Test cases:

- Polls the configured URL (`/__korri/desktop/connection-status`) on the configured interval.
- Calls the provided `reload` exactly once when the response transitions to `status: "connected"`.
- Does not call `reload` while status stays `searching` or `reconnecting`.
- Continues polling after a failed fetch (network error, non-200, malformed JSON) — the loop must not die.
- Tears down cleanly when its disposer is called.

Fixture shape: `createPollingLoop({ fetch: queuedResponses([...]), reload: recorder, setInterval, clearInterval })`. No `vi.mock`; no `Mock*` prefix.

### G7. Add help-text-timing coverage for the waiting page

**Where:** Wherever the waiting page is rendered/served (server-side substring assertion is insufficient — the help block toggles after `helpAfter` elapses).

**Why:** The deleted `SearchingState.test.tsx` had a case for "shows help text immediately when `helpAfter` has already elapsed" — that's a load-bearing user-visible behavior (the device tells the user what to do after 30 s of being stuck). The plan asserts only the initial render shape.

**Concrete fix:** Two options, pick one:

- **Server-side:** Have the bun handler choose between two waiting-page templates (or insert/omit the help block) based on whether `Date.now() >= helpAfter` *at request time*. Then `create-desktop-app.test.ts` can assert: `getConnectionState` with `helpAfter` in the past → body contains help block; `helpAfter` in the future → body does not. **Simpler** if the polling cadence reloads the page often enough to make request-time decisions feel current.
- **Client-side:** The polling script toggles a `[data-help]` element when `Date.now() >= helpAfter`. Covered by the G6 happy-dom test with an additional case.

The plan should pick one and pin it.

### G8. Update verification commands to surface lingering symbols

**Where:** U7 verification block already says `rg 'ConnectionGate|useConnectionState|SearchingState|connection-state-bridge'`. Extend.

**Concrete fix:** Add `pushConnectionStateToWebviews`, `installConnectionStateBridge`, `installRuntimeBridge`, `__korriConnection`, `__korriRuntime`, `toBridgeState`, `attachInitialBridgePushes`, `installWebviewBridgeFallback` to the rg sweep. The current list misses 5 of the 8 symbols whose deletion U6 promises.

---

## Summary of plan amendments

The current plan's `Test expectation: none` posture is defensible — it matches every other refactor plan in the repo and has appropriate "coverage flows through…" pointers. The gaps are not in the *posture* but in **(a)** body-shape rather than liveness assertions for the new integration substrate, **(b)** explicit migration of three pieces of orphaned coverage (`to-bridge-state` Date→ISO, `chainAcceptor` isolation, `isRuntimeConfigBridgeState` validation), **(c)** unit coverage for the new polling script (currently untested at any layer), and **(d)** a small extracted-helper seam for launcher-layer selection so the rule has a test even though the composition root does not.

| Gap | Effort | Risk if ignored |
|---|---|---|
| G1 — runtime-config validation seam | XS | Renderer crashes if inlined config has unexpected shape; silent fallback masks bugs |
| G2 — `chainAcceptor` isolation regression | XS | A future second preload acceptor regresses silently |
| G3 — body-shape smoke assertions | S | Waiting page or inlined script regressions ship to device |
| G4 — route × connection-state cross-product | S | `/api/*`, `/__korri/desktop/launch`, asset behavior under disconnected state regresses silently |
| G5 — extract `selectLauncherLayer` | XS | Wrong launcher layer picked silently; only manual end-to-end catches it |
| G6 — polling-script happy-dom test | M | Device stuck on waiting page or reloads on wrong condition; only manual testing catches it |
| G7 — help-text timing | XS | Device shows no help after 30 s of stuck-state; user has no path forward |
| G8 — extended rg sweep | XS | Dead push-channel symbols linger in the tree |

Recommended posture for the next plan revision: keep every `Test expectation: none` block, but for U3, U4, U6, U7, U8, add an explicit "Migrated coverage" sub-bullet citing the deleted test file and naming the new file/case that absorbs its property. That matches how `2026-05-20-005` handed off Nix-derivation behavior to U7/U8 and is the established repo convention.
