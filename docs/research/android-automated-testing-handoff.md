# Handoff: automated testing for the Android client (emulator + Nix)

**Status:** completed 2026-08-05. See `docs/research/android-automated-testing.md` for the verified outcome.
**Owner:** retained as the source handoff for the completed investigation.
**Time box:** one day. Kill criteria below.

---

## The actual gap

Two facts, discovered by inspection:

1. `clients/portal/` already has **12 test files** run by `bun test` with
   happy-dom — including `src/bridge/launcher-bridge.test.ts`,
   `src/input/korri-native-adapter.test.ts`, and `src/korrid/client.test.ts`.
   The web layer is genuinely covered.
2. `clients/android/app/src/androidTest/` **does not exist.** There are no
   instrumented tests at all. The JVM/Robolectric tests under
   `app/src/test/` cover intent-override parsing and similar pure logic.

So the untested seam is specific and nameable: **the Kotlin side of the
bridge.**

`AGENTS.md` states the bridge treaty lives in `contracts/bridge/` and *"the
Kotlin implementation mirrors it by hand and cites it."* A hand-mirrored
contract is exactly the thing that silently drifts. The portal tests prove the
**JS** side honours the treaty against a fake; nothing proves the **Kotlin**
side still does.

That is the highest-value thing an emulator can buy here. Not "UI testing" in
general — contract conformance across a hand-maintained seam.

### Secondary motivation: real-device testing is flaky in ways that waste time

Observed repeatedly in recent sessions, all environment rather than logic:
tap coordinates missing because a page scrolled differently, Samsung DeX mode
producing black screencaps and bizarre lifecycle behaviour, wireless adb dying
on reboot, devices locked or asleep mid-run. An emulator gives fixed screen
geometry, no vendor shell, no DeX, and a clean boot per run.

---

## Where to work

Create a worktree — **do not work in the main checkout**:

```bash
cd ~/code/sandbox/korri
git worktree add .worktrees/spike/android-test-harness -b spike/android-test-harness
cd .worktrees/spike/android-test-harness
```

`.worktrees/` is the convention here (gitignored, branch-shaped subpaths — run
`git worktree list` to see existing ones). The main checkout is currently well
ahead of origin with uncommitted work; stay out of it.

---

## Read this before touching anything

From `AGENTS.md`:

- *"Read before you touch. Do exactly what was asked. No bonus refactors."*
- *"Bring in as little as possible per slice. If a slice doesn't need it, it
  doesn't come over."*
- *"`flake.nix` is an index: inputs + per-area composition only... Project
  tasks are Nix apps; discover them with `nix run .#help`."*

This slice is **test infrastructure only**. Do not refactor the bridge, the
portal, or korrid to make them more testable. If something is untestable
without a refactor, write that down as a finding instead of doing it.

---

## What already exists — do not rebuild

| Thing | Where | State |
|---|---|---|
| Android SDK composition | `clients/android/sdk.nix` | works; **emulator is switched off at lines 17–18** |
| Android devshell | `clients/android/devshell.nix` | works |
| Robolectric | `clients/android/robolectric.properties` + `app/src/test/` | configured, tests pass |
| Portal tests | `clients/portal/` — `bun test`, happy-dom, 12 files | covers bridge JS side, input adapters, korrid client |
| Nix task wiring | `nix/tasks.nix` (imports `clients/android/sdk.nix`) | tasks are Nix apps |

### The emulator is two lines away

`clients/android/sdk.nix` already reads:

```nix
includeEmulator = false;
includeSystemImages = false;
```

Flip both to `true` and add `systemImageTypes` (`google_apis`) plus
`abiVersions` (`x86_64`). Licenses are already accepted in the composition.
nixpkgs also provides `androidenv.emulateApp` if a fully-declarative
"boot an AVD and install this APK" derivation is wanted.

ABI note: the app already builds an `x86_64` split, so an emulator runs it
natively — no ARM translation needed.

---

## Do these in order. The order is the point.

The failure mode for this task is over-investing in the emulator because it is
the shiny part. It is the *middle* layer and the most expensive one.

**1. Extend the cheap layer first (hours, no Android).**
Before any emulator work, check what portal-level tests could cover that they
currently do not. `bun test` with the in-memory bridge runs in seconds. Any
behaviour testable there should never become an emulator test. Report what you
moved or could move down.

**2. Then the emulator, aimed at one target (the actual slice).**
Stand up an emulator through Nix and write **contract-conformance instrumented
tests**: for each method in `contracts/bridge/`, assert the real Kotlin
implementation matches the treaty the portal's fakes assume. Start with a
single method end-to-end to prove the harness, then decide whether to expand.

Deliverable shape: a Nix task (`nix run .#<something>`) that boots the
emulator, installs the debug APK, runs the instrumented tests, and exits
non-zero on failure — headless, no manual steps.

**3. Do not touch layer three.** Real-device testing stays manual for now.

---

## What the emulator provably cannot catch

State this in the findings so nobody mistakes green CI for device confidence:

| Missed | Why |
|---|---|
| Vendor GPU quirks | A Mali `textureGather` constant-index bug cost real debugging time in the streaming client; SwiftShader compiles it happily |
| Vendor driver crashes | RetroArch 1.22.2 segfaults on Mali with its default Vulkan driver — only reproducible on real silicon |
| Streaming end-to-end | Needs a real host, real network, real hardware decode |
| Controllers, thermals, latency, battery | Physical |

The emulator is a **regression net for the bridge and lifecycle**, never a
substitute for the device loop.

---

## Kill criteria

- **Emulator boot fights Nix for more than half a day** → stop, document the
  exact failure (which package, which error). "androidenv's emulator does not
  work headless on NixOS for reason X" is a perfectly good deliverable.
- **The bridge turns out untestable without refactoring** → stop, write down
  what would need to change. Do not refactor.
- **Layer 1 (portal tests) turns out to cover nearly everything** → that is a
  *success*: report it and skip the emulator entirely. Cheapest possible
  outcome.

---

## Deliverable

`docs/research/android-automated-testing.md` in your worktree:

1. **Verdict:** is an emulator layer worth maintaining here, or does the
   portal's in-memory bridge already cover enough?
2. What you got working, as a runnable Nix task.
3. Boot + run time for the emulator job (matters for whether it can gate CI).
4. Which bridge contract methods are now covered, and which are not.
5. Anything found untestable without refactoring — described, not fixed.
6. CI note: GitHub's Linux runners expose `/dev/kvm` for public repos, so an
   emulator job is viable there. Confirm or refute for this repo's setup.

Follow the shape of existing docs in `docs/research/`.

---

## Environment notes

- Android work runs under the Nix devshells; discover tasks with
  `nix run .#help`.
- There is a second Android SDK composition at
  `plugins/retroarch/android/sdk.nix` — leave it alone unless the emulator
  composition genuinely needs sharing, and say so before doing it.
- The `~/code/sandbox/artemis` checkout is a **different repo** and has an
  active agent session in it. Do not touch it.
- Emulator + system images are large binary blobs; note download/cache cost in
  findings, since it affects CI viability.

---

## Related context

- `AGENTS.md` — "Standing decisions" (bridge treaty, Nix layout, WebViews are
  hardware-blind)
- `contracts/bridge/` — the treaty under test
- `clients/portal/src/bridge/launcher-bridge.test.ts` — how the JS side is
  currently tested against a fake; the Kotlin side needs the mirror of this
