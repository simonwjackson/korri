---
title: Prefer real implementations over mocks in unit, integration, and BDD tests
date: 2026-05-02
category: best-practices
module: testing
problem_type: best_practice
component: testing_framework
severity: medium
applies_when:
  - Writing unit, RPC handler, integration, or BDD tests
  - Testing code that crosses filesystem, process-spawn, or HTTP boundaries
  - Designing test seams or helper modules in production code
  - Reviewing a plan or PR that introduces stubs / spies / mocks
related_components:
  - tooling
  - development_workflow
tags:
  - testing
  - mocking
  - integration-tests
  - fixtures
  - bun-spawn
  - tmpdir
  - test-seams
---

# Prefer real implementations over mocks in unit, integration, and BDD tests

## Context

When wiring tests for a new vertical slice — adapters, RPC handlers, hooks that call RPC, BDD scenarios — the path of least resistance is to introduce stubs at every seam. `StubLibrarySource`, `StubLauncher`, `mockUseRpcQuery`, and so on. The result is a large test surface that proves the seams *can be wired*, but never proves the real wiring works. Refactors then ripple through dozens of stubs, and the tests start documenting how the interfaces were *imagined* rather than how they actually behave.

In codebases the size of an indie launcher (filesystem + process spawn + local HTTP RPC + a React renderer), almost every "I should mock this" instinct is wrong. The real thing is fast enough, deterministic enough, and far more honest.

## Guidance

**Posture: real implementations everywhere feasible. Substitute only where the real thing is genuinely impractical (slow, non-deterministic, externally controlled, or destructive to the dev machine).**

For each layer, here is the pattern to follow:

| Layer | Strategy |
|---|---|
| **Pure functions** (parsers, schemas, helpers) | Never substituted; tested with real inputs. |
| **Filesystem code** | Real, against tmpdir-based fixtures created by a `withTempLibrary`-style helper that writes the real on-disk shape. |
| **Process spawning** | Real `Bun.spawn`. In tests, the spawned program is `/bin/true` / `/bin/false` for trivial cases, or a tiny in-repo controllable script for realistic argv (`tools/testing/fake-game.sh`). The launcher code path is 100% real; only the *target binary* is a stand-in. |
| **RPC handlers** | Exercised through a real composition (real source over fixture files + real launcher over the controllable script). No `Stub*` in the codebase. |
| **React hooks that call RPC** | Exercised through a real HTTP roundtrip to a real in-process Hono server, or direct Effect-runtime invocation of the registered handlers. No mocking of `useRpcQuery` or `runRpc`. |
| **Pure presentational components** | Rendered with happy-dom; props passed directly. No mocks needed. |
| **BDD (Playwright)** | Runs against the real dev stack with the `LibrarySource` configured to a fixture dir and `LaunchSpec`s targeting the controllable script. No stubs anywhere in the stack. |

**The only legitimate substitutes:**

1. **The launch target binary.** Real emulators / shipped binaries are slow and require a real device. Replace with a 5-line in-repo script (`tools/testing/fake-game.sh`) that prints argv to stderr and exits with `${KORRI_FAKE_GAME_EXIT:-0}`. The `Launcher` code path is real; only the program being launched is a stand-in.
2. **Wall-clock time.** Only when an assertion needs deterministic relative-time formatting (e.g., "12m ago"). Solve by passing explicit `Date` inputs to the formatting helper — never by global clock mocking.

That is the entire substitution surface.

### Concrete patterns

**Test helpers live under `tools/testing/`, not in `korri/shared/`.** They are test infrastructure, not runtime code. Examples to introduce as needed:

- `tools/testing/library/with-temp-library.ts` — writes a real `es_systems.cfg` + per-system `gamelist.xml` into a `tmpdir`, returns `{ source, cleanup }` ready for use by tests.
- `tools/testing/library/with-rpc-server.ts` — spins up a real in-process Hono server on a random port, returns the URL, tears down on cleanup. Only needed if direct Effect-runtime invocation of a handler isn't enough.
- `tools/testing/fake-game.sh` — the controllable launch target. Committed executable, ~5 lines. Reused by handler tests, controller tests, and BDD.

**Name the seam by intent.** A function that injects test implementations should be named for what it does:

```ts
// ❌ Implies test fakes; tempts authors to write Stub* classes
export function setLibraryContextForTesting(ctx: { source: Stub; launcher: Stub }) {}

// ✅ Implies "configured real": the test caller passes a real RocknixSource
//    pointed at a tmpdir, and a real ShellLauncher pointed at fake-game.sh
export function configureLibraryContextForTesting(ctx: {
  source: LibrarySource
  launcher: Launcher
}) {}
```

**Make the configuration knob exist on the real type.** If the only difference between production and test is a path or a command string, hang it off the real implementation's config — don't fork into a separate test type:

```ts
interface RocknixConfig {
  gamelistRoots: readonly string[]
  esSystemsPath: string
  // Tests pass `tools/testing/fake-game.sh`; production defaults to runemu.sh
  launchCommand?: string
}
```

**Drop unit tests for thin composition wrappers.** A page that does `useRpcQuery(...)` and renders the result has no behavior worth mocking through. Cover loading / error / empty states in BDD against the real dev stack; cover rendering in molecule-level tests with props passed directly. A unit test would only assert that `useRpcQuery` was composed with the result — the BDD scenario proves that for real.

## Why This Matters

**1. Stubs document the imagined interface, not the real one.** A test that mocks `useRpcQuery` to return `{ games: [] }` proves the page handles that *shape*. It does not prove the actual RPC ever returns that shape, that the wire format matches, that the handler path even exists, or that an empty library produces an empty array. Real-stack tests catch all four kinds of drift; stub tests catch zero.

**2. Refactors ripple through stubs.** Renaming a method, restructuring a result shape, or tightening a type triggers compile errors in production code (good — that's the type system working) *and* in every stub that mimicked the old shape (bad — those tests had no business knowing the old shape that intimately). Real-stack tests usually only break when behavior actually changed.

**3. The substitution surface is genuinely tiny.** For a launcher app, filesystem ops are microseconds, `/bin/true` exits in microseconds, an in-process HTTP server binds to a random port in single-digit milliseconds. The "tests would be too slow" objection turns out to be untrue at this scale; total suite stays comfortably fast.

**4. BDD only earns its name if the underlying stack is real.** A "behavior-driven" test running against stubbed handlers describes the behavior of the stubs. The whole point of BDD is to prove integrated behavior; the moment a stub appears below the Playwright layer, the proof evaporates.

## When to Apply

- Any new test file that touches a seam introducing filesystem, process, HTTP, or RPC behavior.
- Any plan or design that proposes a `Stub*`, `Mock*`, or `Fake*` class as the test surface — push back and ask what the configured-real equivalent would look like.
- Any composition-wrapper component whose only behavior is "call hook X, render result with component Y." Skip the unit test; cover the wrapper in BDD instead.
- BDD test mode setup: prefer `configure...ForTesting(realImpl, realImpl)` over any kind of test-mode-only handler injection.

## Examples

**Before — stub-heavy RPC handler test:**

```ts
// ❌ Mocks the source; doesn't exercise the parser, sort, or launch resolution
it("returns games", async () => {
  setLibraryContextForTesting({
    source: new StubLibrarySource([{ id: "x", metadata: { name: "X" } }]),
    launcher: new StubLauncher({ status: "launched" }),
  })
  const result = await Effect.runPromise(handleListLibrary({}))
  expect(result.games).toHaveLength(1)
})
```

**After — real source + real launcher against fixtures:**

```ts
// ✅ Real RocknixSource parses real gamelist.xml from a tmpdir; real ShellLauncher
//    runs tools/testing/fake-game.sh with KORRI_FAKE_GAME_EXIT=0
it("returns games sorted by lastPlayed desc", async () => {
  using lib = await withTempLibrary({
    systems: [
      {
        name: "snes",
        defaultEmulator: "retroarch",
        defaultCore: "snes9x",
        games: [
          { path: "old.smc", name: "Old", lastPlayed: "20240101T000000" },
          { path: "new.smc", name: "New", lastPlayed: "20260101T000000" },
        ],
      },
    ],
    launchCommand: "tools/testing/fake-game.sh",
  })
  configureLibraryContextForTesting({
    source: lib.source,
    launcher: createShellLauncher(),
  })

  const result = await Effect.runPromise(handleListLibrary({}))

  expect(result.games.map(g => g.metadata?.name)).toEqual(["New", "Old"])
})
```

The "after" version exercises the parser, the sort, the schema, the launch-spec composer, and the handler glue — in one test, with no stubs. When any of those layers regresses, this test catches it.

**`tools/testing/fake-game.sh`:**

```bash
#!/usr/bin/env bash
# Controllable launch target for tests. Real ShellLauncher spawns this for real;
# argv is recorded to stderr, exit code controlled by env var.
echo "fake-game launched with: $*" 1>&2
exit "${KORRI_FAKE_GAME_EXIT:-0}"
```

That is the entire test double for "launching a game." A real `ShellLauncher` runs it, awaits it, captures its stderr, returns its exit code — exactly the same code path that runs `runemu.sh` in production.

## Related

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — same Hono `/api/rpc` semantics in dev and desktop, which is what makes "real in-process server" testing trivially feasible.
- `docs/brainstorms/2026-05-02-personal-mvp-scope-requirements.md` — the brainstorm that prompted the testing-strategy decision.
- `docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md` — the plan whose Testing Strategy section codifies this posture for the personal MVP work.
