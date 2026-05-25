# Progress

## Status
Complete — `docs/research/renderer-bun-boundary/research-learnings.md` written.

## Tasks
- [x] Enumerate docs/solutions/ subdirectories (7 subdirs, 33 files)
- [x] Run parallel grep across electrobun/IPC/connection/Hono/boot/layering/test keywords
- [x] Score candidates; full-read top 8
- [x] Confirm explicit gaps (preload bridges, connection controller, mDNS,
      desktop.yaml, useConnectionState, SearchingState, portal vs desktop boot,
      executeJavaScript race post-mortems — none documented)
- [x] Write `/home/simonwjackson/code/sandbox/korri/docs/research/renderer-bun-boundary/research-learnings.md`

## Files Changed
- progress.md
- `docs/research/renderer-bun-boundary/research-learnings.md` (new)

## Notes

### Directly applicable learnings (8)
1. `best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — the
   loopback Hono boundary that `create-desktop-app.ts` already embodies; the
   plan's pre-React waiting page + inlined runtime-config sit on top of it.
2. `best-practices/product-owned-composition-keeps-shared-layers-reusable-2026-05-03.md`
   — governs where the bun-side connection probe / layer-selector may live
   (deploy/desktop or products/app — never shared). Includes the executable
   scan that catches drift.
3. `best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
   — pattern that replaces any post-connect status branching in the React tree;
   warns against generic ResultBoundary abstractions.
4. `best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — test
   posture for new connection-probe tests; configured-real on the real type,
   no Mock*/Stub*/Fake*.
5. `integration-issues/effect-rpc-tests-need-window-location-pathname-2026-05-02.md`
   — happy-dom RPC-test gotcha (set origin + href + pathname).
6. `integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` — the
   packaged file layout (`Resources/app/views/mainview/index.html`) where
   inlined runtime-config and the waiting-page asset will live.
7. `best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` —
   visual conventions for the pre-React waiting page (fluid tokens, container
   queries, no inline px).
8. `best-practices/decoupled-spatial-navigation-2026-05-01.md` — existing
   `window.__korri*` precedent (renderer-internal singleton) — explains why
   `window.__korriInput` can stay if and only if it's not push-shaped.

### Tangential
- `architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
  — same conceptual move (replace process-push with a durable substrate the
  consumer reads at startup), but server-side.
- `integration-issues/2026-05-02-bdd-fixture-deferred.md` — playbook for
  globalSetup + test-mode admin endpoint if new BDD coverage wants to swap
  connection state mid-scenario.

### Explicit gaps (worth `/se-compound` after the refactor lands)
- electrobun preload bridges / executeJavaScript races / `window.__korriConnection` post-mortem
- connection controller, mDNS discovery, remembered-server probes, `desktop.yaml`
- "Looking for aka" UX, `useConnectionState`, `SearchingState`
- portal vs desktop boot-path contrast
- pre-React boot-screen visual conventions specifically (general fluid-token
  doc applies but is not boot-screen-targeted)
