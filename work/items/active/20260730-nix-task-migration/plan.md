---
title: "refactor: declare Korri tasks in Nix, retire just"
type: refactor
status: active
date: 2026-07-30
verify_command: "nix run .#korrid-check"
---

# refactor: declare Korri tasks in Nix, retire just

## Summary

Move all 15 justfile recipes into Nix tasks that declare their own tools and environment, generate the task list from those same definitions so it cannot drift, and delete the justfile. The spike already proved the three hard cases run without a devshell; this slice is the mechanical remainder plus the cleanup that makes the result honest.

---

## Problem Frame

`just` is only a menu and a devshell selector — the real logic already lives in shell scripts. But the recipes lean on whatever the ambient devshell happens to provide, and that implicitness has produced real defects: a task that needed `libclang` had no idea it did, and the Android SDK setup has been silently failing its NDK symlink step on every shell entry because a `shellHook` has no `set -e`. Since agents, not humans, run these commands, discoverability has to be machine-legible and dependencies have to be declared rather than assumed.

---

## Requirements

- R1. Every justfile recipe has a Nix task equivalent; the justfile is deleted
- R2. Each task declares the tools and environment it needs — no reliance on an ambient devshell
- R3. `nix run .#help` lists every task with its description, generated from the task definitions so the list cannot drift
- R4. One implementation of the Android SDK layout, shared by devshells and tasks, with the latent `ndk` symlink bug fixed
- R5. Recipe chains (`ra-accept` → `ra-deploy` → `ra-build`) are preserved as explicit calls
- R6. Tasks resolve the repo root robustly rather than assuming the caller's working directory
- R7. Everything that referenced `just` — scripts, AGENTS.md, area docs — points at the new surface
- R8. Device-touching tasks still pass on the tablet after the move

---

## Scope Boundaries

- No attempt to make Gradle, RetroArch, or adb tasks hermetic Nix derivations — they stay impure tasks that Nix declares and invokes
- No change to what any task actually does; this is a relocation plus dependency declaration, not a rewrite of build logic
- No CI wiring (none exists today)
- No packaging of korrid or the APK as new flake outputs beyond what already exists
- No devshell removal — shells stay for interactive work; tasks are the scripted surface

### Deferred to Follow-Up Work

- Retiring `nix develop` from inside scripts that still shell out to it: after the task surface settles
- Caching/eval-latency work if `nix run` startup proves annoying in practice

---

## Context & Research

### Relevant Code and Patterns

- `spike/nix-apps` branch — the proof this plan builds on: `nix/tasks.nix` (definitions → apps → generated help), `clients/android/sdk.nix` (shared SDK composition), `clients/android/sdk-env.sh` (SDK farm, extracted from the shellHook)
- `justfile` — the 15 recipes to port; note most are one-line wrappers around existing scripts
- `clients/android/devshell.nix` — carries the duplicate SDK setup that U1 replaces, including the exclusion list bug
- `services/korrid/check.sh`, `check-in-shell.sh` — the only script that invokes `just` (`just portal-bundle`)
- `runtimes/retroarch/*.sh` — already self-contained scripts; their tasks are thin
- `flake.nix` — the index; per-area composition only, so task definitions live in `nix/` and area files, not inline

### Institutional Learnings

- Making the implicit explicit finds bugs: the spike surfaced both an invisible `libclang` dependency and a silently-failing NDK symlink
- A `shellHook` cannot fail loudly (`set -e` is absent), so setup errors there hide indefinitely — tasks with `set -euo pipefail` expose them
- Device gates must assert their own output, not just exit zero

### External References

- Spike measurements and behaviour recorded in the branch commits (`1533ad69`, `12b23662`)

---

## Key Technical Decisions

- **Tasks as flake apps built with `writeShellApplication`**: gives declared `runtimeInputs`, shellcheck on every script for free, and `nix run` without entering a shell
- **Help is generated, not written**: the description lives beside the task definition and the listing is derived from it, so a task can never exist without appearing in help. This is the agent-facing discovery surface — `nix flake show` is not usable for this (every app reads `app: no description`)
- **Logic stays in shell scripts; tasks declare and invoke**: keeps diffs reviewable and avoids burying logic in Nix strings. Tasks own dependencies and environment, scripts own behaviour
- **SDK farm extracted to a script both shells and tasks source**: a devshell cannot share a `shellHook` with an app, so the only way to have one implementation is a script. Fixing the `ndk` exclusion there fixes it everywhere at once
- **Impure tasks stay impure**: Gradle, adb, and network fetches are wrapped, not purified. Attempting hermetic derivations for these is a different project with a much worse cost/benefit
- **Devshells remain** for interactive work and as the composition source for toolchains; tasks are the scripted entry points

---

## Open Questions

### Resolved During Planning

- Can Gradle run without a shellHook? — Yes, proven: four APKs from a clean `.android-sdk`
- Can the device/NDK path be fully declared? — Yes, proven on the tablet
- Is `nix flake show` enough for agent discovery? — No; a generated `help` task is required

### Deferred to Implementation

- Repo-root resolution mechanism (`git rev-parse --show-toplevel` vs a marker file vs `KORRI_ROOT`) — pick against real task invocations, including from subdirectories
- Whether chained tasks call each other's built program paths or re-enter `nix run` — decide on the first chain ported (`ra-accept`), preferring the direct path to avoid nested evaluation
- Whether `portal-bundle`'s working-tree mutation (copying `dist` into APK assets) stays a task or becomes a build input — leave as-is unless the port makes the seam obvious
- Exact eval-latency impact on the agent loop; measure once several tasks are in use

---

## Implementation Units

### U1. One Android SDK setup, shared and correct

**Goal:** Devshells and tasks build the SDK layout from the same script, and the silent NDK failure is gone.

**Requirements:** R2, R4

**Dependencies:** None

**Files:**
- Create: `clients/android/sdk.nix`
- Create: `clients/android/sdk-env.sh`
- Modify: `clients/android/devshell.nix`
- Modify: `services/korrid/devshell.nix` (consume the shared composition)

**Approach:**
- Port `sdk.nix` and `sdk-env.sh` from the spike; the exclusion list must skip `ndk` so the per-version link lands in a real directory
- Devshell shellHook sources the script instead of carrying its own copy
- Keep the korrid devshell's bindgen/host-compiler exports, which the spike proved necessary

**Execution note:** Characterization-first — before changing the devshell, capture what the current farm produces so the refactor can be compared against it rather than assumed equivalent.

**Test scenarios:**
- Happy path: with no `.android-sdk` present, entering the android devshell produces the farm with `ndk/<version>` resolving to the NDK
- Happy path: same from a task, with no devshell involved
- Edge case: entering the shell twice does not rebuild or corrupt the farm
- Error path: the NDK link step fails loudly if the SDK layout changes, rather than warning and continuing
- Integration: `assembleDebug` succeeds against a farm built by each path

**Verification:**
- Both entry points yield an identical farm; no `ln:` warning appears anywhere

---

### U2. Task substrate: definitions, apps, generated help

**Goal:** A single place where a task is defined, from which both the runnable app and the help listing derive.

**Requirements:** R2, R3, R6

**Dependencies:** U1 (Android tasks need the shared composition)

**Files:**
- Create: `nix/tasks.nix`
- Modify: `flake.nix` (expose `apps`, staying an index)

**Approach:**
- Each definition carries description, `runtimeInputs`, environment, and script
- `help` (and `default`) render from the same attribute set
- Repo-root resolution decided here and used by every task (see Open Questions)

**Patterns to follow:**
- Spike `nix/tasks.nix`; `flake.nix`'s existing rule that composition lives in area files

**Test scenarios:**
- Happy path: `nix run .#help` lists every defined task with its description
- Edge case: adding a task makes it appear in help without touching a second file
- Edge case: a task invoked from a subdirectory still resolves the repo root
- Happy path: arguments reach the underlying script (`-- <serial>`)

**Verification:**
- Help output matches the set of defined tasks exactly

---

### U3. Port build and check tasks

**Goal:** The non-device recipes run as tasks with declared dependencies.

**Requirements:** R1, R2

**Dependencies:** U2

**Files:**
- Modify: `nix/tasks.nix`
- Modify: `services/korrid/check-in-shell.sh` (its `just portal-bundle` call)

**Approach:**
- Port `portal-dev`, `portal-check`, `portal-bundle`, `android-apk`, `android-apk-dev`, `korrid-check`, `korrid-test`, `ra-fetch`, `ra-build`, `ra-core-mgba`, `ra-check`
- Each task names its tools; anything currently assumed from the ambient shell (`unzip`, `jq`, `adb`, `git`) becomes explicit
- `portal-dev` is long-running — confirm signals and port binding behave under `nix run`

**Test scenarios:**
- Happy path: each ported task succeeds from a clean checkout with no devshell active
- Edge case: `android-apk-dev` passes its URL argument through to Gradle
- Edge case: `portal-dev` serves on the LAN and stops cleanly on interrupt
- Error path: a task whose tool is undeclared fails at build time, not mid-run
- Integration: `korrid-check` still performs the whole-app gate (portal assets asserted in the APK)

**Verification:**
- Every ported task green; `korrid-check` passes end to end

---

### U4. Port device tasks and their chains

**Goal:** Tablet-touching tasks work, including the multi-step RetroArch chain.

**Requirements:** R1, R2, R5

**Dependencies:** U3

**Files:**
- Modify: `nix/tasks.nix`

**Approach:**
- Port `korrid-check-device`, `korrid-script-device`, `ra-deploy`, `ra-accept`
- Chains become explicit invocations of the prior task's program; avoid nested `nix run` evaluation
- Device tasks reconnect network adb targets before use, per the lesson already baked into the scripts

**Test scenarios:**
- Happy path: `korrid-script-device` runs the example plugin on the tablet and asserts the declaration
- Happy path: `ra-accept` performs build → deploy → acceptance in order, failing fast if an earlier step fails
- Error path: a missing/unreachable device fails immediately with a clear message rather than midway through a build
- Edge case: passing a serial containing a colon (network target) works

**Verification:**
- Chain runs on the tablet; each step observably precedes the next

---

### U5. Retire just

**Goal:** One task surface, and everything pointing at it.

**Requirements:** R1, R7

**Dependencies:** U3, U4

**Files:**
- Delete: `justfile`
- Modify: `AGENTS.md`
- Modify: `services/korrid/SCRIPTING.md`, `runtimes/retroarch/NOTES.md`, area READMEs referencing `just`
- Modify: `services/korrid/devshell.nix` and others carrying `just` in their tool list

**Approach:**
- Replace the AGENTS.md standing decision about justfile glue with the task-surface rule, naming `nix run .#help` as the entry point so an agent reading the file finds the surface immediately
- Sweep for `just ` references in docs and scripts

**Test scenarios:**
- Test expectation: none — deletion and docs; the gate is that no reference to `just` survives and U3/U4 tasks still pass

**Verification:**
- Repo-wide search finds no `just` invocations; `nix run .#help` is discoverable from AGENTS.md

---

### U6. Device regression gate

**Goal:** Prove the move changed nothing observable on hardware.

**Requirements:** R8

**Dependencies:** U4, U5

**Files:**
- Modify: `work/items/active/20260730-nix-task-migration/work.md` (record the run)

**Approach:**
- Full pass on the tablet: `korrid-check` (whole-app gate), `korrid-script-device`, and one RetroArch chain
- Compare against the pre-migration behaviour of the same flows

**Test scenarios:**
- Integration (device): app installs, portal loads, plugin probe returns its declaration, RetroArch acceptance passes
- Edge case: run once from a clean checkout with no `.android-sdk` to prove nothing depends on residue from a devshell

**Verification:**
- All device flows behave as they did before the migration

---

## System-Wide Impact

- **Interaction graph:** the entry point for every scripted action changes; agents reading AGENTS.md must land on the new surface or they will keep reaching for `just`
- **Error propagation:** tasks fail earlier and louder (declared inputs, `set -euo pipefail`) — expect previously-hidden failures to surface during the port, as the spike already showed twice
- **State lifecycle risks:** `.android-sdk` is shared mutable state between shells and tasks; one implementation removes the risk of two divergent farms
- **API surface parity:** no runtime contract changes; this is developer-surface only
- **Unchanged invariants:** what each task does, the scripts they call, the devshells for interactive work

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Agents keep invoking `just` from habit or stale context | Delete the justfile so it fails loudly, and name `nix run .#help` in AGENTS.md |
| Hidden environment assumptions surface as failures mid-port | Expected, and the point — the spike hit two; port task-by-task with each verified before moving on |
| `nix run` eval latency degrades the agent loop | Measure during U3; if it bites, revisit before U5 makes it irreversible |
| Long-running tasks (`portal-dev`) behave differently under `nix run` | Explicitly tested in U3 rather than assumed |
| Chained tasks re-entering `nix run` compound latency | Chains call program paths directly (U4) |

---

## Documentation / Operational Notes

- AGENTS.md is the discovery path for agents: it must name the task surface, not describe recipes
- `nix run .#help` replaces `just --list`; because it is generated, a task cannot exist undocumented

---

## Sources & References

- Spike: branch `spike/nix-apps` — `1533ad69` (task substrate, device task), `12b23662` (Gradle task, SDK farm fix)
- Related code: `justfile`, `clients/android/devshell.nix`, `services/korrid/check-in-shell.sh`
- Standing decisions: `AGENTS.md` (flake-as-index, justfile-owns-glue — the latter is replaced by this work)
