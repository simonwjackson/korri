---
title: "refactor: Align codebase with development standards"
type: refactor
status: completed
date: 2026-05-03
---

# refactor: Align codebase with development standards

## Overview

Bring the remaining obvious codebase drift in line with the new `docs/development/` standards without changing product behavior. The work focuses on four concrete gaps found by local scan: product-specific RPC composition living under `korri/shared`, legacy mock/fake/stub naming in test infrastructure, raw visual values that bypass the token system, and missing automated checks to keep these rules from drifting again.

## Problem Frame

Today's development docs establish stronger defaults: shared runtime code must be product-agnostic, stories/tests should use configured real implementations rather than mocks, frontend state should be ADT-shaped and Effect-layer-backed, and visual code should prefer tokens/container-aware values over raw inline styles. The current Effect atom home path mostly follows this, but some older infrastructure still predates the rules.

## Requirements Trace

- R1. Shared runtime code under `korri/shared/*` must not import product-specific `@app/*` APIs or handlers.
- R2. Production and test code should avoid `Mock*`, `Stub*`, and `Fake*` naming unless the word is part of an external fixture name that cannot be changed.
- R3. Runtime UI code should use theme variables, CSS classes, or documented dynamic-style exceptions instead of unexplained hardcoded pixels/hex values and inline `style` props.
- R4. Existing RPC behavior, desktop/dev HTTP behavior, Storybook behavior, and launch/library behavior must remain unchanged.
- R5. Add lightweight guard coverage so future changes catch the same classes of standards drift.

## Scope Boundaries

- This plan does not redesign the app's RPC contracts or Effect v4 architecture.
- This plan does not remove the approved Effect atom + `layerAtom` pattern.
- This plan does not do a full visual redesign of exploratory story files under `korri/shared/primitives/explorations/*`.
- This plan does not attempt to eliminate dynamic inline styles that are required for measured layout math; it requires that they be token-fed or explicitly justified.

### Deferred to Separate Tasks

- A stricter lint plugin for import boundaries and design-token enforcement can be added later if the lightweight test guard proves too weak.
- Broad cleanup of exploration-only Storybook prototypes can happen with the next visual-design pass.

## Context & Research

### Relevant Code and Patterns

- `docs/development/philosophy.md` — functional core underneath React, real implementations over mocks, visual harnesses as first-class consumers.
- `docs/development/standards.md` — shared/product boundaries, frontend Effect runtime stack, UI state modeling, testing posture, visual harness posture.
- `docs/development/style-guide.md` — Effect-flavored React pattern, no boolean state forests, no `Mock*` / `Stub*` / `Fake*` prefixes.
- `korri/shared/api/rpc/app-rpc-group.ts` and `korri/shared/api/rpc/handlers.ts` currently import `@app/*` and are the primary shared-boundary violation.
- `korri/shared/api/rpc/server.ts` currently composes app handlers, feature gates, serialization, and live library layers.
- `korri/shared/api/http/hono-app.ts` currently mounts the app RPC handler and media routes; callers include `tools/http/server.ts`, `tools/testing/library/with-rpc-server.ts`, and `korri/deploy/desktop/create-desktop-app.ts`.
- `korri/products/app/features/home/library-source-layer-rpc.ts` and `korri/products/app/features/home/launcher-layer-rpc.ts` are app-specific RPC-backed UI layers and should import app RPC contracts from product-owned files.
- `tools/testing/happydom.ts`, `tools/testing/setup-global.ts`, and `korri/shared/navigation/center-scroll.test.ts` contain legacy mock/fake/stub terminology.
- `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx`, `korri/shared/themes/shift/molecules/ShiftHomeCaption.tsx`, and Tilegrid roots contain the main non-story runtime inline style/raw value cases.

### Institutional Learnings

- `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md` — keep runtime primitives behind domain ADTs and state components.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — use configured real implementations and real in-process servers rather than mocks.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` — use fluid tokens and container queries; raw inline values bypass the theme.
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` — Tilegrid-style primitives legitimately need dynamic inline layout styles when they are driven by CSS-length tokens and measured sentinels.
- `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md` — real RPC client/server tests catch schema/wire problems that direct handler tests miss.

### External References

- Not used. The codebase now has direct standards and local patterns for the cleanup; external research would add little value.

## Key Technical Decisions

- Move app RPC group, handler registration, and app HTTP composition into `korri/products/app/api/*`: these files are product-specific by definition because they import app endpoints and choose app infrastructure.
- Keep reusable RPC primitives in `korri/shared/api/rpc/*`: serialization, typed errors, client construction, and generic helpers remain shared because they do not need product endpoint imports.
- Prefer configured-real renames over behavioral rewrites for test infrastructure: the naming cleanup should not make happy-dom or navigation tests less deterministic.
- Treat Tilegrid dynamic inline styles as justified exceptions when they are part of CSS-length sentinel measurement; clean or document them rather than forcing awkward class extraction.
- Add scan-style tests for high-signal standards that TypeScript/Biome do not enforce today, especially `@app/*` imports from `korri/shared/*`.

## Open Questions

### Resolved During Planning

- Should this be a behavioral feature or a refactor? Resolved as a refactor because the intended user-visible behavior is unchanged.
- Should old exploration stories be cleaned now? Resolved as mostly out of scope; runtime files and reusable primitives are higher priority.

### Deferred to Implementation

- Exact final names for moved app API composition files: choose names that fit local imports once the move is performed.
- Whether `korri/shared/logger/index.ts` should remain as an explicit module entrypoint exception or be replaced with direct imports: resolve while touching the standards guard, because existing project guidance currently says to use `@shared/logger`.
- Which inline styles can be fully moved to CSS classes versus kept as documented dynamic layout exceptions: decide file-by-file during the visual audit.

## Implementation Units

- [x] **Unit 1: Move app API composition out of shared**

**Goal:** Eliminate `@app/*` imports from `korri/shared/*` by relocating product-specific RPC group, handler registration, RPC server composition, and Hono app composition to product-owned API files.

**Requirements:** R1, R4

**Dependencies:** None

**Files:**
- Create: `korri/products/app/api/app-rpc-group.ts`
- Create: `korri/products/app/api/handlers.ts`
- Create: `korri/products/app/api/rpc-server.ts`
- Create: `korri/products/app/api/hono-app.ts`
- Modify: `korri/shared/api/rpc/app-rpc-group.ts`
- Modify: `korri/shared/api/rpc/handlers.ts`
- Modify: `korri/shared/api/rpc/server.ts`
- Modify: `korri/shared/api/http/hono-app.ts`
- Modify: `korri/products/app/api/library/list.rpc-handler.test.ts`
- Modify: `korri/products/app/api/library/launch.rpc-handler.test.ts`
- Modify: `korri/products/app/features/home/library-source-layer-rpc.ts`
- Modify: `korri/products/app/features/home/launcher-layer-rpc.ts`
- Modify: `tools/http/server.ts`
- Modify: `tools/testing/library/with-rpc-server.ts`
- Modify: `korri/deploy/desktop/create-desktop-app.ts`
- Test: `korri/products/app/features/home/library-rpc-layers.test.ts`
- Test: `tools/testing/library/with-rpc-server.test.ts`
- Test: `korri/deploy/desktop/create-desktop-app.test.ts`

**Approach:**
- Product files own the list of app RPCs, app handler mapping, and the live app layers needed to serve them.
- Shared RPC code remains limited to reusable transport pieces: errors, serialization, client layer construction, and any generic server helper that accepts a group/handler layer without importing product endpoints.
- Update dev server, desktop wrapper, and test server helpers to import the product Hono app rather than a shared app-specific Hono singleton.
- Delete or shrink the old shared app-composition files once all imports move. If compatibility shims are temporarily needed, they must not import `@app/*` from shared.

**Patterns to follow:**
- `korri/products/app/features/home/HomeServerRoot.tsx` as the product composition boundary for frontend data strategy.
- `korri/shared/api/rpc/client.ts` as reusable transport infrastructure that stays shared.
- `docs/development/standards.md` layering rule.

**Test scenarios:**
- Integration: `with-rpc-server()` starts the product Hono app and `LibrarySourceLayerRpc` can list seeded games through the real RPC server/client.
- Integration: `LauncherLayerRpc` launches through the real RPC server/client and preserves the configured exit-code behavior.
- Integration: desktop app forwards `/api/rpc` requests to the product Hono app and still serves static assets for non-API routes.
- Regression: direct library handler tests still exercise configured real `LibrarySource` / `Launcher` layers after import paths move.

**Verification:**
- No file under `korri/shared/*` imports `@app/*`.
- Existing RPC, desktop, and library integration tests pass without mocked transport.

- [x] **Unit 2: Add standards drift guard tests**

**Goal:** Add lightweight automated checks for the highest-signal standards that are not enforced by the typechecker or Biome.

**Requirements:** R1, R2, R5

**Dependencies:** Units 1 and 3. Add repository-wide guard scans only after the current violations are cleaned, or land the guard and cleanup in the same changeset.

**Files:**
- Create: `tools/testing/standards/import-boundaries.test.ts`
- Create: `tools/testing/standards/naming-conventions.test.ts`
- Modify: `tools/testing/runners/diff-test-runner.ts` only if test discovery requires an explicit include
- Test: `tools/testing/standards/import-boundaries.test.ts`
- Test: `tools/testing/standards/naming-conventions.test.ts`

**Approach:**
- Add repository-scan tests with narrow, stable rules rather than a broad custom linter.
- Import-boundary guard: fail if non-test files under `korri/shared/*` import `@app/*`.
- Legacy-query guard: fail if runtime code references deleted query helpers such as `useRpcQuery`, `runRpc`, or `rpcQueryStore`, excluding historical docs and explanatory comments where appropriate.
- Naming guard: fail on new `Mock*`, `Stub*`, or `Fake*` identifiers in `korri/**` and `tools/**`, with a tiny allowlist only for unavoidable external fixture names such as the existing `tools/testing/fake-game.sh` environment convention.
- Keep the guards readable and easy to update; they are project standards tests, not a general AST framework.

**Patterns to follow:**
- Existing Bun tests that inspect generated artifacts, such as BDD/feature-map validation tests.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` for naming intent.

**Test scenarios:**
- Happy path: current compliant files pass the scan.
- Error path: a fixture or inline sample containing `import ... from "@app/..."` under a simulated `korri/shared` path is rejected by the boundary matcher.
- Error path: a simulated `MockThing` / `StubThing` / `FakeThing` identifier is rejected unless it is in the explicit allowlist.
- Edge case: docs and generated output are ignored so historical examples do not fail runtime standards tests.

**Verification:**
- Fixture-level negative cases prove the guards detect simulated violations.
- Repository-wide guard scans pass after the cleanup units land.

- [x] **Unit 3: Rename legacy mock/fake/stub test infrastructure terms**

**Goal:** Bring test helper terminology in line with configured-real standards without changing test behavior.

**Requirements:** R2, R4

**Dependencies:** Unit 1. The standards guard in Unit 2 should land after this rename cleanup or in the same changeset.

**Files:**
- Modify: `tools/testing/setup-global.ts`
- Modify: `tools/testing/happydom.ts`
- Modify: `korri/shared/navigation/center-scroll.test.ts`
- Test: `korri/shared/navigation/center-scroll.test.ts`
- Test: `tools/testing/standards/naming-conventions.test.ts`

**Approach:**
- Rename `mockLogger` to an intent-based name such as `recordingLogger` or `testLogger`.
- Rename `MockResizeObserver` to `ResizeObserverShim` or `ConfiguredResizeObserver`.
- Rename `stubRect` to `setElementRect` or `configureElementRect`.
- Rename `FakeClock` / `makeFakeClock` to `ControlledClock` / `makeControlledClock`.
- Keep `tools/testing/fake-game.sh` and `KORRI_FAKE_GAME_EXIT` as an intentional executable fixture name unless the implementation reveals a low-risk rename path through all docs, env vars, and tests.

**Patterns to follow:**
- `createInMemoryLauncher({ behavior: ... })` style names in library layer tests.
- `withTempLibrary()` and `withRpcServer()` as capability-oriented helper names.

**Test scenarios:**
- Happy path: center-scroll tests still use controlled geometry and controlled time to assert scroll behavior.
- Regression: global test setup still installs a logger sink and ResizeObserver-compatible shim for happy-dom.
- Standards: naming-conventions guard passes with no broad allowlist.

**Verification:**
- No avoidable `Mock*`, `Stub*`, or `Fake*` identifiers remain in source/test files.
- Existing navigation and setup-dependent tests continue to pass.

- [x] **Unit 4: Audit runtime visual raw values and inline styles**

**Goal:** Reduce or justify runtime style escapes so visual code follows token/container-query rules while preserving dynamic layout behavior.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Modify: `korri/shared/themes/shift/shift.css`
- Modify: `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx`
- Modify: `korri/shared/themes/shift/molecules/ShiftHomeCaption.tsx`
- Modify: `korri/shared/primitives/components/Tilegrid/TilegridRailRoot.tsx`
- Modify: `korri/shared/primitives/components/Tilegrid/TilegridScrollRoot.tsx`
- Modify: `korri/shared/primitives/components/Tilegrid/TilegridPagedRoot.tsx`
- Modify: `korri/shared/primitives/theme/styles.css`
- Test: `korri/shared/primitives/components/Tilegrid/TilegridRailRoot.test.tsx`
- Test: `korri/shared/primitives/components/Tilegrid/TilegridScrollRoot.test.tsx`
- Test: `korri/shared/primitives/components/Tilegrid/TilegridPagedRoot.test.tsx`
- Test: `korri/shared/themes/shift/organisms/ShiftHomeRail.test.tsx`
- Test: `korri/shared/themes/shift/molecules/ShiftHomeCaption.test.tsx`

**Approach:**
- Convert Shift home rail constants into named CSS/theme variables where possible, using Tilegrid's existing CSS-length support instead of numeric pixel props.
- Keep Tilegrid sentinel and grid-math inline styles when they are required to pass dynamic CSS lengths into DOM measurement/layout; add concise comments tying those exceptions to the sentinel-resolution pattern.
- Move static wrapper styling into classes or CSS variables where it does not depend on runtime measurement.
- For `ShiftHomeCaption`, keep the dynamic `transform` if it is truly runtime focus geometry, but ensure the value is the only inline escape and that spacing/color remain token-driven.
- Treat hardcoded hex values inside theme variable definitions as acceptable token declarations, not call-site violations; hardcoded fallback hex values outside token declarations should be removed or justified.

**Patterns to follow:**
- `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md` for legitimate sentinel inline styles.
- `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md` for token and container-query discipline.
- Existing Tilegrid tests that assert resolved CSS-length behavior.

**Test scenarios:**
- Happy path: Shift home rail renders with CSS-token-driven cell size/gap and still passes correct sizing into Tilegrid.
- Edge case: Tilegrid string CSS-length inputs still mount sentinels and calculate layout after measurement.
- Regression: numeric Tilegrid inputs remain zero-cost and do not require sentinels.
- Regression: caption still follows focused tile x-position while spacing/type/color remain token-driven.

**Verification:**
- Runtime non-story raw `px`/hex/inline-style scan is reduced to documented theme declarations or dynamic layout exceptions.
- Tilegrid and Shift home behavior remains visually and functionally unchanged.

- [x] **Unit 5: Resolve entrypoint and documentation consistency**

**Goal:** Make the standards and code agree on intentional exceptions such as logger module entrypoints and localStorage-backed feature-gate state.

**Requirements:** R4, R5

**Dependencies:** Units 1-4

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/development/standards.md`
- Modify: `docs/development/style-guide.md`
- Modify: `korri/shared/logger/index.ts` if the implementation chooses to remove the barrel-style entrypoint
- Modify: logger import call sites if the implementation chooses direct imports over the `@shared/logger` entrypoint
- Test: `tools/testing/standards/import-boundaries.test.ts`
- Test: `tools/testing/standards/naming-conventions.test.ts`

**Approach:**
- Decide whether `@shared/logger` is a sanctioned module entrypoint or whether all imports should use `@shared/logger/logger`.
- If sanctioned, update standards with a narrow exception: no barrel exports except explicit package/module entrypoints documented in project instructions.
- If removed, update `AGENTS.md` and all call sites so the instruction no longer tells agents to use a forbidden import shape.
- Confirm feature-gate `localStorage` usage is documented as non-sensitive local developer state rather than sensitive data storage; add a small clarifying comment only if it helps future reviewers.

**Patterns to follow:**
- Existing `AGENTS.md` split: project-specific instructions live there; cross-project rules live under `docs/development/`.
- `docs/development/standards.md` cross-cutting rules.

**Test scenarios:**
- Standards: guard tests still pass after any logger import normalization.
- Regression: runtime files still import logger through one consistent approved path.
- Documentation consistency: no instruction tells agents to use an import pattern that standards tests reject.

**Verification:**
- The final codebase has no contradiction between `AGENTS.md`, `docs/development/*`, and the guard tests.

## System-Wide Impact

- **Interaction graph:** Dev server, desktop wrapper, in-process RPC test server, and app RPC client layers all depend on the Hono/RPC app composition. Moving composition files must update all four surfaces together.
- **Error propagation:** RPC handler errors and launch failures must keep their existing typed paths; this refactor should only move ownership, not change error mapping.
- **State lifecycle risks:** No state lifecycle changes are intended. Atom `layerAtom` overrides and cleanup behavior should remain as implemented in the Effect v4 migration.
- **API surface parity:** `/api/rpc`, `/api/rpc/`, `/api/health`, `/api/media/*`, and desktop static fallback behavior must remain available through the same URLs.
- **Integration coverage:** Real RPC-layer tests and desktop app tests are required because import-boundary moves can compile while breaking runtime composition.
- **Unchanged invariants:** RPC tags, request/response schemas, feature-gate headers, launch behavior, library sorting, and Storybook no-network posture do not change.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Moving app composition breaks dev server or desktop API forwarding | Update all Hono callers in the same unit and cover with `withRpcServer` plus desktop app tests. |
| Guard tests become noisy and block legitimate exceptions | Keep rules narrow and maintain explicit, tiny allowlists with comments explaining each exception. |
| Visual cleanup accidentally removes necessary dynamic layout styles | Treat Tilegrid sentinel styles as justified exceptions and rely on existing Tilegrid layout tests. |
| Documentation update weakens standards instead of enforcing them | Only clarify true contradictions; do not broaden exceptions beyond documented module entrypoints. |
| Current uncommitted files get mixed into the refactor | Review `git status` before execution and keep this plan's changes separate from unrelated local edits. |

## Documentation / Operational Notes

- Update development docs only where the cleanup reveals a real contradiction or sanctioned exception.
- No release notes or user-facing documentation are needed; this is an internal architecture cleanup.
- If a standards guard is added, mention it in the relevant development docs so future agents know the convention is executable.

## Sources & References

- Development standards: `docs/development/philosophy.md`, `docs/development/standards.md`, `docs/development/style-guide.md`
- Effect atom pattern: `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`
- Real implementations: `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
- Visual tokens: `docs/solutions/best-practices/fluid-theme-tokens-and-container-queries-2026-05-01.md`
- CSS-length sentinel pattern: `docs/solutions/best-practices/css-length-props-with-sentinel-resolution-2026-05-01.md`
- RPC schema integration learning: `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md`
