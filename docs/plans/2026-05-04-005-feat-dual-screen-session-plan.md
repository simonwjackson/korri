---
title: "feat: Add durable dual-screen session support"
type: feat
status: active
date: 2026-05-04
---

# feat: Add durable dual-screen session support

## Overview

Promote the current dual-screen Storybook prototype into a reusable application seam: a typed dual-screen session, reusable Shift primary/companion surfaces, a Storybook harness that consumes the same seam, and app/desktop entry points that can run the two surfaces in separate windows.

The durable first behavior is intentionally narrow: the primary screen publishes the currently focused game, and the companion screen renders that game's companion view. Launch orchestration, secondary-screen controls, and cross-screen input transfer remain future work unless they are needed to prove the session seam.

## Problem Frame

The current dual-screen example works because `korri/shared/themes/shift/pages/ShiftDualScreen.stories.tsx` owns local React state and renders two surfaces stacked vertically. That is useful for visual exploration, but it is not a reusable app capability: product routes, desktop windows, tests, and future transports cannot share the same session contract.

To make the idea permanent, Korri needs one explicit contract for screen-to-screen state. Storybook should use an in-memory implementation of that contract; real app windows should use a browser/runtime transport such as `BroadcastChannel` first, with Electrobun IPC or a session daemon left as a later transport if needed.

## Requirements Trace

- R1. The dual-screen state contract is explicit, typed, and reusable outside Storybook.
- R2. The Storybook story keeps the approved visual shape: two screens stacked vertically with a gap, primary `16:9`, companion `8:7`, and non-essential chrome removed.
- R3. Primary home focus changes update the shared selected game without importing navigation-library internals into components.
- R4. The companion screen renders from shared selected-game state and fixture/RPC library data, not from story-local duplicated state.
- R5. Storybook and tests use an in-memory session implementation with no network calls or global fetch mocking.
- R6. Product routes can render a primary or companion screen role so separate browser/desktop windows can load the same app bundle.
- R7. Desktop window setup can open primary and companion windows with frames that preserve the intended screen ratios.
- R8. Existing single-screen `/` home behavior remains unchanged.

## Scope Boundaries

- **In scope:** selected-game sharing, reusable dual-screen session/provider, reusable Shift companion surface, Storybook harness, route composition, desktop window options, and deterministic tests.
- **Out:** bidirectional gameplay controls from the companion screen.
- **Out:** launching games from the companion screen.
- **Out:** cross-window focus transfer or active-screen input routing.
- **Out:** persistence across app restarts beyond whatever the selected transport naturally provides.
- **Out:** replacing the existing spatial navigation architecture.

### Deferred to Separate Tasks

- A richer dual-screen event protocol for launch status, media playback, or companion controls.
- Electrobun-specific typed IPC if `BroadcastChannel` proves insufficient on the target runtime.
- Device-specific placement for physical displays once target hardware constraints are known.

## Context & Research

### Relevant Code and Patterns

- `korri/shared/themes/shift/pages/ShiftDualScreen.stories.tsx` is the prototype to preserve visually while removing story-local architecture.
- `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx` shows the current primary home composition: `ShiftHomeRoot`, top bar, rail, caption, and bottom bar.
- `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx` owns focused game state today; the permanent primary surface should observe this via `useShiftHome()` rather than duplicating focus tracking.
- `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx` already tracks focus through delegated native `focusin` and stays decoupled from navigation internals.
- `korri/products/app/routes/+index.tsx` is the current composition root for the normal `/` home route and should remain unchanged except for shared extraction reuse if needed.
- `korri/products/app/features/home/HomeServerRoot.tsx` wires RPC-backed library/launcher layers and is the pattern for product routes choosing data strategy.
- `korri/deploy/desktop/main.ts` currently creates one `BrowserWindow`; `korri/deploy/desktop/window-options.ts` centralizes desktop window sizing and URL construction.
- `korri/shared/themes/shift/pages/ShiftHomePage.story.e2e.ts` shows the Storybook E2E pattern for loading an iframe story and asserting user-visible behavior.

### Institutional Learnings

- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` requires components to stay native HTML and avoid component-level navigation APIs. Dual-screen focus publication must read normal Shift home state rather than importing LRUD or reaching into `window.__korriSpatialNav`.
- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` supports keeping raw runtime state behind a domain-shaped seam and rendering explicit state components.
- `docs/solutions/best-practices/control-driven-storybook-coverage-for-combinatorial-components-2026-05-01.md` supports using Storybook as a deterministic consumer of real component contracts rather than a one-off mock environment.

### External References

- External web research was attempted for current `BroadcastChannel` guidance, but no web-search backend is configured in this environment. The plan uses the stable browser-platform shape of same-origin `BroadcastChannel` and keeps the transport replaceable behind the session contract.

## Key Technical Decisions

| Decision | Rationale | Tradeoff |
|---|---|---|
| Introduce a `DualScreenSession` seam before adding more UI | The story-local state works visually but cannot support routes, desktop windows, or future transports. | Adds a small shared module before the runtime transport is fully exercised. |
| Make selected-game sharing the first event only | This is the behavior already proven in Storybook and avoids inventing companion controls prematurely. | The event contract will grow later for launch/status/control use cases. |
| Use in-memory session for Storybook/tests | Keeps stories deterministic and compliant with the no-network visual harness rule. | It does not test real cross-window delivery by itself. |
| Use browser `BroadcastChannel` as the first real-window transport | It maps directly to same-origin app windows and requires no product backend or Electrobun-specific bridge. | Needs a fallback or alternate transport if a target runtime lacks reliable channel support. |
| Keep screen surfaces in shared Shift theme code; keep route/window selection in product/deploy code | Shared themes remain product-agnostic while product routes choose data and runtime wiring. | Some composition remains split across shared and product layers. |
| Preserve `/` as the single-screen home route | Avoids changing the current app behavior while adding opt-in dual-screen entry points. | Dual-screen startup needs explicit route/window selection. |

## Open Questions

### Resolved During Planning

- **Should the Storybook dual-screen layout remain the source of truth?** No. It remains a visual consumer, but the session contract and companion surface move into reusable modules.
- **Should the first permanent transport be backend/RPC-based?** No. The first behavior is local same-origin window state, so a browser transport is smaller and avoids backend coupling.
- **Should components import navigation or focus-engine APIs to publish selection?** No. The primary publisher reads `useShiftHome().focused`, preserving the decoupled navigation rule.

### Deferred to Implementation

- Exact route filename for the `/screen` entry should follow the TanStack Router generator's current file-route convention. The plan names the intended route path and composition target; implementation should validate the filename with `just validate-router`.
- Exact desktop frame positions should be tuned after seeing local/target monitor geometry. Tests should assert aspect ratio and URL role, not absolute placement aesthetics.
- Whether `BroadcastChannel` is reliable in the final Odin/Chromium runtime should be verified in device smoke before relying on it for richer events.

## Output Structure

```text
korri/shared/display/dual-screen/
  dual-screen-events.ts
  DualScreenSession.context.tsx
  DualScreenSessionRoot.tsx
  DualScreenBroadcastSessionRoot.tsx
  DualScreenPreviewFrame.tsx
  dual-screen-session.test.tsx
  dual-screen-broadcast-session.test.tsx
korri/shared/themes/shift/pages/
  ShiftPrimaryDualScreenSurface.tsx
  ShiftCompanionScreen.tsx
  ShiftDualScreen.stories.tsx
  ShiftDualScreen.story.e2e.ts
korri/products/app/features/dual-screen/
  DualScreenRouteRoot.tsx
  DualScreenRouteRoot.test.tsx
korri/products/app/routes/
  +screen.tsx
```

This tree shows the intended shape. The implementing agent may adjust file splits if implementation reveals a simpler local convention, but the session seam, reusable surfaces, Storybook harness, product route, and desktop wiring remain distinct responsibilities.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TB
    subgraph Storybook
      Story[ShiftDualScreen story]
      Memory[In-memory DualScreenSession]
    end

    subgraph Runtime
      PrimaryRoute[/screen?role=primary]
      CompanionRoute[/screen?role=companion]
      Channel[BroadcastChannel DualScreenSession]
    end

    subgraph SharedShift[Shared Shift surfaces]
      PrimarySurface[Primary dual-screen home surface]
      CompanionSurface[Companion screen]
    end

    Story --> Memory
    PrimaryRoute --> Channel
    CompanionRoute --> Channel
    Memory --> PrimarySurface
    Memory --> CompanionSurface
    Channel --> PrimarySurface
    Channel --> CompanionSurface
    PrimarySurface -- GameFocused --> Memory
    PrimarySurface -- GameFocused --> Channel
```

## Implementation Units

- [x] **Unit 1: Extract the dual-screen session contract**

**Goal:** Create the reusable typed session seam and in-memory implementation that Storybook/tests can use without network or browser globals.

**Requirements:** R1, R5.

**Dependencies:** None.

**Files:**
- Create: `korri/shared/display/dual-screen/dual-screen-events.ts`
- Create: `korri/shared/display/dual-screen/DualScreenSession.context.tsx`
- Create: `korri/shared/display/dual-screen/DualScreenSessionRoot.tsx`
- Test: `korri/shared/display/dual-screen/dual-screen-session.test.tsx`

**Approach:**
- Define a small event/state vocabulary centered on selected game: screen role, `GameFocused`, selected game id, and last source screen.
- Expose domain operations such as selecting/focusing a game rather than raw React setters.
- Keep the in-memory implementation deterministic and local to the provider.
- Do not export a barrel; consumers import the specific context/root/event files.

**Patterns to follow:**
- `korri/shared/themes/shift/templates/ShiftHome.context.tsx` for guarded context hooks and domain-shaped mutations.
- `korri/shared/library/library-list-state-root.tsx` for small state roots that hide raw conversion details from children.

**Test scenarios:**
- Happy path: rendering a consumer inside `DualScreenSessionRoot` with initial game `crystalline-drift`, then publishing `GameFocused` for `ember-circuit`, updates the selected id for all consumers.
- Happy path: publishing the same game id twice leaves selected game stable and does not require consumers to know event sequencing.
- Edge case: calling the hook outside the provider throws a clear provider-boundary error.
- Edge case: initializing without a selected game uses the configured fallback id rather than an undefined/null selected state.

**Verification:**
- The session contract is reusable from both stories and product code without importing Storybook, app routes, or transport-specific modules.

- [x] **Unit 2: Promote Shift dual-screen surfaces out of the story**

**Goal:** Move the primary publisher and companion view into reusable Shift page components so the story, route, and future desktop windows render the same surfaces.

**Requirements:** R3, R4, R8.

**Dependencies:** Unit 1.

**Files:**
- Create: `korri/shared/themes/shift/pages/ShiftPrimaryDualScreenSurface.tsx`
- Create: `korri/shared/themes/shift/pages/ShiftCompanionScreen.tsx`
- Test: `korri/shared/themes/shift/pages/ShiftPrimaryDualScreenSurface.test.tsx`
- Test: `korri/shared/themes/shift/pages/ShiftCompanionScreen.test.tsx`
- Modify: `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx` only if a small shared composition extraction avoids duplication without changing `/` behavior

**Approach:**
- Keep the primary surface visually equivalent to the current home composition: top bar, rail, caption, bottom bar.
- Add a tiny focus publisher inside the primary surface that reads `useShiftHome().focused` and publishes selected-game changes through `DualScreenSession`.
- Keep the companion surface presentational: it receives/resolves the selected `GameRecord` and renders the approved full-bleed art, bottom gradient, title, and developer treatment.
- Do not make the companion surface own launch behavior or input routing in this pass.

**Patterns to follow:**
- `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx` for page-level composition that reuses Shift atoms/molecules/organisms.
- `korri/shared/themes/shift/pages/ShiftDualScreen.stories.tsx` for the approved companion visual direction.
- `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md` for the rule that focus remains DOM/native and components avoid navigation internals.

**Test scenarios:**
- Happy path: rendering the primary surface with two games focuses/publishes the initial resume target to the dual-screen session.
- Happy path: focusing a different rail tile publishes that tile id to the session.
- Happy path: rendering the companion with selected `ember-circuit` shows `Ember Circuit` and its developer.
- Edge case: companion selected id is absent from the current game list -> renders the fallback/resume game rather than crashing.
- Edge case: selected game has no image -> renders the companion fallback surface and still shows title/developer text.

**Verification:**
- The current `/` home route still renders the existing single-screen home behavior.
- The reusable surfaces can render with fixture data in tests/story without app RPC imports.

- [x] **Unit 3: Rebuild the Storybook harness on the permanent seam**

**Goal:** Keep the approved visual dual-screen prototype while replacing story-local selected-game state with the reusable in-memory session.

**Requirements:** R2, R5.

**Dependencies:** Units 1 and 2.

**Files:**
- Create: `korri/shared/display/dual-screen/DualScreenPreviewFrame.tsx`
- Modify: `korri/shared/themes/shift/pages/ShiftDualScreen.stories.tsx`
- Test: `korri/shared/themes/shift/pages/ShiftDualScreen.story.e2e.ts`

**Approach:**
- Move the ratio/stacking frame into a small visual-harness component if doing so keeps the story clearer; otherwise keep ratio CSS story-local but make session state external.
- Preserve the current approved layout: vertical stack, gap, no labels/event log/shell cards, primary `16:9`, companion `8:7`.
- Storybook should use fixture games and the in-memory session root only.
- Add a Storybook E2E test that proves focus on the primary changes the companion content and that the surface ratios remain enforced.

**Patterns to follow:**
- `korri/shared/themes/shift/pages/ShiftHomePage.story.e2e.ts` for Storybook iframe E2E structure.
- `korri/shared/primitives/components/Tilegrid/Tilegrid.story.e2e.ts` for focus/navigation assertions against story content.

**Test scenarios:**
- Happy path: loading the story shows two screen surfaces stacked vertically.
- Happy path: primary surface bounding box ratio is approximately `16:9`; companion surface bounding box ratio is approximately `8:7`.
- Happy path: after moving focus from the first game to the second game, the companion title updates to the second game's display name.
- Edge case: resizing the Storybook viewport preserves both aspect ratios because child content is inset inside ratio boxes.

**Verification:**
- The story remains network-free and visually matches the latest approved prototype.

- [x] **Unit 4: Add app route composition for screen roles**

**Goal:** Allow the app bundle to render either primary or companion screen roles so real browser/desktop windows can load separate surfaces.

**Requirements:** R4, R6, R8.

**Dependencies:** Units 1 and 2.

**Files:**
- Create: `korri/shared/display/dual-screen/DualScreenBroadcastSessionRoot.tsx`
- Test: `korri/shared/display/dual-screen/dual-screen-broadcast-session.test.tsx`
- Create: `korri/products/app/features/dual-screen/DualScreenRouteRoot.tsx`
- Test: `korri/products/app/features/dual-screen/DualScreenRouteRoot.test.tsx`
- Create: `korri/products/app/routes/+screen.tsx`
- Modify: `korri/products/app/routes/__virtual.ts` only if the route generator requires virtual route metadata updates

**Approach:**
- Add an opt-in route such as `/screen?role=primary` and `/screen?role=companion`.
- Use `HomeServerRoot` in the route composition so both roles can resolve the real library list through the existing RPC layer.
- Add the broadcast-capable session root in shared display code, backed by same-origin `BroadcastChannel` and an injectable channel factory for deterministic tests.
- Use the broadcast-capable session implementation for real app windows, while route tests can override with the in-memory implementation.
- Keep `/` unchanged and still backed by `ShiftHomePage`.
- Treat invalid/missing role as a safe default or a small route-level error state; do not let a malformed URL crash the app shell.

**Patterns to follow:**
- `korri/products/app/routes/+index.tsx` for thin route shells that choose shared page composition.
- `korri/products/app/features/home/HomeServerRoot.tsx` for product-owned data strategy wiring.
- `korri/shared/library/library-list-state-root.tsx` for adapting loaded library state before rendering role-specific views.

**Test scenarios:**
- Happy path: `role=primary` renders the primary Shift surface and wires selected-game publishing.
- Happy path: `role=companion` renders the companion surface using the selected id from the session and library data from the route root.
- Edge case: missing role defaults to primary or renders a clear route-level fallback, as chosen during implementation.
- Edge case: selected id is not present in the loaded library -> companion falls back to the resume/first game.
- Integration: two broadcast session roots using the same configured channel name receive a selected-game update published by one root in the other root.
- Integration: route root uses `HomeServerRoot`/library atoms rather than importing RPC transport into shared theme components.

**Verification:**
- Existing `/` home route behavior and tests remain unchanged.
- New `/screen` route can be opened in two same-origin browser tabs/windows and share selected-game state through the chosen real-window transport.

- [x] **Unit 5: Wire desktop dual-window startup**

**Goal:** Make the desktop wrapper capable of opening both physical screen windows with the intended route roles and aspect ratios.

**Requirements:** R6, R7, R8.

**Dependencies:** Unit 4.

**Files:**
- Modify: `korri/deploy/desktop/window-options.ts`
- Test: `korri/deploy/desktop/window-options.test.ts`
- Modify: `korri/deploy/desktop/main.ts`
- Test: `korri/deploy/desktop/create-desktop-app.test.ts` if route/static forwarding needs coverage

**Approach:**
- Extend window option construction to produce named primary and companion window options rather than one generic window.
- Build URLs that target `/screen?role=primary` and `/screen?role=companion` on the local desktop server.
- Preserve the existing desktop server/Hono setup; only window creation and URL/frame selection change.
- Keep frame sizes ratio-correct in tests: primary `16:9`, companion `8:7`. Exact positions can be tuned after runtime visual review.
- If dual-window startup should be opt-in initially, gate it behind a desktop-only environment/config flag while leaving the single-window behavior as default.

**Patterns to follow:**
- `korri/deploy/desktop/window-options.ts` for pure URL/frame construction.
- `korri/deploy/desktop/window-options.test.ts` for deterministic tests around desktop options.
- `korri/deploy/desktop/main.ts` for the single place that owns `BrowserWindow` creation.

**Test scenarios:**
- Happy path: primary window options target the primary role URL and have a `16:9` frame.
- Happy path: companion window options target the companion role URL and have an `8:7` frame.
- Edge case: invalid desktop server port still throws through the existing `buildDesktopUrl` guard.
- Integration: desktop main creates both windows only after the local server has a bound port.

**Verification:**
- Desktop startup can create two windows without changing API/static asset serving.
- Single-window mode remains available if an opt-in flag is chosen.

## System-Wide Impact

- **Interaction graph:** Primary screen focus changes now publish through a shared session. Companion reads session state and library data. Normal `/` home remains isolated from dual-screen session unless intentionally wrapped by a dual-screen route/story.
- **Error propagation:** Missing/unknown selected ids should degrade to a known fallback game. Transport failure should leave each screen renderable rather than crashing the route.
- **State lifecycle risks:** Secondary windows may open before the primary has published a selection; the session needs an initial/fallback selected id. Broadcast messages may arrive more than once; selection updates must be idempotent.
- **API surface parity:** Storybook, product routes, and desktop windows should all consume the same session operations. Do not create a story-only API that diverges from runtime behavior.
- **Integration coverage:** Storybook E2E proves visual/session behavior; route tests prove product composition; desktop option tests prove window role/ratio URLs.
- **Unchanged invariants:** Shared themes must not import product routes or RPC transport. Components must remain native/focusable HTML and avoid navigation-library imports.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `BroadcastChannel` behaves differently in the final device/runtime | Keep transport behind `DualScreenSession`; start with in-memory + broadcast implementations and leave Electrobun IPC as a deferred transport. |
| The companion route opens before library data or selected id is ready | Use explicit loading/fallback states and default selected id resolution from the loaded game list. |
| Shared theme code accidentally imports product RPC or route modules | Keep data wiring in `korri/products/app/features/dual-screen/DualScreenRouteRoot.tsx`; shared surfaces accept data/session context only. |
| Storybook visual ratios regress when companion content changes | Add Storybook E2E bounding-box ratio assertions. |
| Desktop dual-window startup surprises current local users | Consider an opt-in desktop config flag for the first pass, or preserve single-window `/` as the default command while adding a dual-window recipe later. |

## Documentation / Operational Notes

- No product docs are required for the first implementation unless a new user-facing dual-screen mode is exposed beyond local development.
- If desktop dual-window startup is opt-in, document the flag or recipe in the relevant desktop/Odin development docs as part of the implementation unit that adds it.
- If `BroadcastChannel` fails in device smoke, record the finding under `docs/solutions/` only if explicitly requested or as part of a compounding workflow.

## Sources & References

- Related prototype: `korri/shared/themes/shift/pages/ShiftDualScreen.stories.tsx`
- Primary home composition: `korri/shared/themes/shift/pages/ShiftHomeReadyBody.tsx`
- Shift home state owner: `korri/shared/themes/shift/templates/ShiftHomeRoot.tsx`
- Product home route: `korri/products/app/routes/+index.tsx`
- Product data root: `korri/products/app/features/home/HomeServerRoot.tsx`
- Desktop window options: `korri/deploy/desktop/window-options.ts`
- Desktop entrypoint: `korri/deploy/desktop/main.ts`
- Spatial navigation guidance: `docs/solutions/best-practices/decoupled-spatial-navigation-2026-05-01.md`
