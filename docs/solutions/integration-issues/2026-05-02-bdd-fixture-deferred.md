---
title: BDD-time ROCKNIX library fixture (deferred from personal-MVP plan)
date: 2026-05-02
category: integration-issues
module: testing
problem_type: deferred_work
component: bdd
severity: low
applies_when:
  - Re-enabling Playwright BDD scenarios for home or safe-game-resume
  - Adding a new BDD scenario that needs a configured library state
related_components:
  - bdd
  - testing-infrastructure
tags:
  - bdd
  - fixtures
  - rocknix
  - personal-mvp
---

# BDD-time ROCKNIX library fixture — deferred

## Status

Deferred from `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md` (Unit 12).

All `home.feature` and `safe-game-resume.feature` scenarios that depend on
a library being present are tagged `@fixme(MVP-bdd-fixture-deferred)`.
The multi-device SGR scenarios are separately tagged
`@fixme(MVP-deferred-multi-device)` because they remain out of scope for the
personal MVP.

## Why this is deferred

The personal-MVP plan ships a ROCKNIX library reader, two RPCs, a launch
controller, and a failure banner — every layer is exercised end-to-end by
unit, handler, and hook tests using the **real** implementations:

- `RocknixSource` runs against tmpdir-backed `withTempLibrary` fixtures.
- `ShellLauncher` spawns real `Bun.spawn` processes against
  `tools/testing/fake-game.sh`.
- `app.library.list` and `app.library.launch` handlers are tested through a
  real composition (real source + real launcher).
- `useGameLaunch` is tested through a real Hono in-process RPC server using
  the production `runRpc` client.
- `ShiftLaunchFailureBanner` is tested with happy-dom + real props.

What's missing for BDD parity is **fixture infrastructure** that runs
*before* the Playwright dev API server starts so the real `/api/library/list`
RPC has a known library to return. That infrastructure is purely test
plumbing — it exercises no production behavior the unit tests don't already
cover. Building it now would add ~200–300 lines of test-only code that
duplicates coverage; the next concrete verification step is the on-device
smoke test (Unit 13), which is what actually proves the personal MVP works.

## Out of scope (do not "fix")

- Multi-device sync, progress-risk confirmation, last-played-on-other-device
  scenarios. Those remain `@fixme(MVP-deferred-multi-device)` and are not
  part of the personal MVP.

## When to do this

Do this work when one of the following is true:

- A new behavior lands whose only verification path is an end-to-end
  Playwright scenario (i.e., not unit-testable at the layer it changes).
- A regression slips past unit tests that BDD would have caught.
- The product moves beyond the single-device personal MVP.

## What to build

1. **Pre-test fixture writer.** A `globalSetup` for `playwright.e2e.config.ts`
   that calls `withTempLibrary` to write a stable on-disk ROCKNIX library
   into a tmpdir, including the game names referenced by BDD
   (`Crystalline Drift`, `Ember Circuit`, `Hades`, plus any added later).
   Set `KORRI_ROCKNIX_GAMELIST_ROOTS` and `KORRI_ROCKNIX_ES_SYSTEMS` so the
   webServer-spawned API process inherits them.

2. **Per-scenario state swap.** The `Given the launcher has a previous game
   named X` step needs to make `X` the most-recently-played game in the
   library. Two reasonable shapes:

   - **Multiple pre-built fixtures** (one per game variant), with a
     test-only `POST /api/test/library/swap` admin endpoint (gated on
     `KORRI_BDD_TEST_MODE=true`) that re-reads from a different
     gamelist root and resets the cached `LibraryContext` via
     `clearLibraryContextCacheForTesting()`.
   - **Live gamelist rewrite + cache reset.** The step rewrites
     `gamelist.xml` on disk to promote `X` to the most-recent
     `<lastplayed>`, then hits the same admin endpoint to invalidate the
     cache.

   The second is simpler; the first scales better to richer scenarios.

3. **Argv recording.** `tools/testing/fake-game.sh` already echoes argv to
   stderr. To make `Then the launch command for X should run` an
   asserting step, point `fake-game.sh` at a known append-only log file
   via an env var (e.g., `KORRI_FAKE_GAME_LOG=/tmp/...`) so the step can
   read the file and assert on the recorded argv.

4. **`safe-game-resume.steps.ts`.** A new flat step file colocated with
   the feature, registering the bindings used by the SGR scenarios:
   `the launcher has a previous game named X`, `I open the launcher`,
   `X should be the primary continue action`, `I confirm X`,
   `the launch command for X should run`, `the launch command for X
   fails`, `I should see a launch failure banner for X`,
   `I retry from the failure banner`, `the launch command for X should
   run again`.

5. **Remove the `@fixme(MVP-bdd-fixture-deferred)` tags** from
   `home.feature` and `safe-game-resume.feature` once the above lands and
   the scenarios pass.

## Related

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
  — the testing posture this work would extend to BDD.
- `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md`
  Unit 12 — the original full-scope description.
- `tools/testing/library/with-temp-library.ts` — the fixture writer to
  reuse.
- `tools/testing/library/with-rpc-server.ts` — analogous in-process RPC
  harness pattern (used by hook tests).
