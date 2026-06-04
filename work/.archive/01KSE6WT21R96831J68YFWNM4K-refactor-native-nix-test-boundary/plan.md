---
title: "refactor: Move Nix checks out of Bun"
type: refactor
status: completed
date: 2026-05-25
deepened: 2026-05-25
verify_command: "just typecheck && just test-unit && just test-nix && just lint"
---

# refactor: Move Nix checks out of Bun

## Summary

Supersede the completed Bun-batched Nix harness plan by making the runner boundary match the code under test: Bun runs TypeScript tests only, while Nix module/config/build invariants live as native flake checks under `nix/tests/`. The work migrates the remaining `tools/testing/nix/*.test.ts` coverage into Nix-owned checks, removes the Bun wrappers, and updates local/CI orchestration so Bun no longer knows about Nix tests.

---

## Problem Frame

The current test split solved runtime pain but preserved the wrong architecture: `bun test` still owns Nix assertions by spawning `nix eval` and interpreting JSON with Bun `expect()` calls. That keeps Nix checks in TypeScript discovery, requires `--path-ignore-patterns` guardrails, and lets CI call `bun test tools/testing/nix/...` for configuration invariants that Nix can fail directly.

This plan treats `../01KSBMG31V2GQ4NCWTAP023Z8Y-refactor-nix-test-harness/plan.md` as historical context and replaces its long-term direction with the cleaner boundary the user requested.

---

## Requirements

- R1. Bun test discovery must not include or route to Nix-backed tests; `test-unit` is for TypeScript test files only.
- R2. Nix module, image, derivation-graph, live USB, and RockNix configuration invariants currently asserted through `tools/testing/nix/*.test.ts` must be preserved with equivalent native Nix checks.
- R3. `just test-nix` must run Nix-owned gates using Nix commands and flake check/package targets, never `bun test tools/testing/nix/`.
- R4. `just check` must continue to run both TypeScript and Nix validation, with a clear runner boundary.
- R5. CI workflows that currently run Nix assertions through Bun must call native Nix checks instead.
- R6. Structural standards tests must guard the new boundary: no `*.test.ts` Nix harness under `tools/testing/nix/`, no `bun test tools/testing/nix`, and no broad package script that bypasses the repo’s intended test recipes.
- R7. Application behavior and NixOS module semantics must not change as part of the harness migration.

---

## Scope Boundaries

- No changes to product runtime behavior, NixOS module option semantics, package contents, or RockNix/live USB image composition except where an implementation uncovers an existing test-only assumption that must be represented faithfully in Nix.
- No broad CI redesign beyond replacing Bun-wrapped Nix test invocations with native Nix gates.
- No effort to optimize Nix evaluation or build time beyond removing the TypeScript wrapper layer.
- No new shared Nix test framework unless duplication becomes materially worse during migration; the existing `check` record list pattern is the default.
- No documentation capture in `docs/solutions/` during this plan unless explicitly requested after the migration lands.

### Deferred to Follow-Up Work

- Update stale learning docs that mention old `tools/testing/nix/*-eval.test.ts` paths once the migration lands, especially `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`.
- Capture a new `docs/solutions/` learning for the Bun/Nix runner boundary after the implementation proves the migration pattern.
- Consider folding `test-nix` into a broader `nix flake check` posture later if all expensive package checks become safe to run consistently through flake checks.

---

## Context & Research

### Relevant Code and Patterns

- `tools/testing/nix/korri-desktop-build-graph.test.ts` and `tools/testing/nix/korri-desktop-build-graph.fixture.nix` currently use Bun to spawn `nix eval` and assert derivation graph properties.
- `tools/testing/nix/korri-image-outputs-eval.test.ts` and `tools/testing/nix/korri-image-outputs-eval.fixture.nix` currently assert x86 image outputs, package/check/app discovery, and image composition summaries through Bun.
- `tools/testing/nix/korri-rocknix-image-eval.test.ts` and `tools/testing/nix/korri-rocknix-image-eval.fixture.nix` currently assert RockNix target discovery, appliance shape, SM8550 session constraints, and hardware-fact boundaries through Bun.
- `tools/testing/nix/korri-live-usb-safety-eval.test.ts` and `tools/testing/nix/korri-live-usb-safety-eval.fixture.nix` mix Nix config evaluation with resolver-script behavior tests under one Bun file.
- `tools/testing/nix/korri-live-usb-smoke.test.ts` mixes a `nix build --dry-run` package gate with a docs smoke under Bun.
- `nix/tests/korri-compositor-module-check.nix`, `nix/tests/korri-input-module-check.nix`, and `nix/tests/korri-server-module-check.nix` are the canonical native check pattern: evaluate real NixOS modules, assemble `{ message, assertion }` records, `throw` on failure, and return a tiny `pkgs.runCommand` success derivation.
- `nix/tests/korri-live-usb-config-check.nix` and `nix/tests/korri-live-usb-vm-smoke.nix` already expose live USB validation through flake checks.
- `nix/tests/korri-rocknix-sm8550-config-check.nix` is a new partial native check for SM8550 Gamescope/Moonlight invariants and should be extended or used as the pattern for RockNix migration.
- `justfile` currently has `test-unit` excluding `tools/testing/nix/**`, `test-nix` running `bun test tools/testing/nix/`, `live-usb-smoke` invoking one Bun Nix test file, and `check` depending on both test recipes.
- `.github/workflows/desktop-stage2.yml` currently runs two Nix-backed Bun test files under `nix develop .#ci`.
- `package.json` currently maps `test` directly to `bun test`, bypassing the `just test-unit` boundary.
- `tools/testing/standards/test-suite-partitioning.test.ts` currently codifies the old anti-pattern by asserting that `test-nix` uses `bun test tools/testing/nix/`.

### Institutional Learnings

- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` supports this migration: native Nix checks preserve the real evaluator and remove a wrapper, rather than replacing real evaluation with a substitute.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` establishes the principle that NixOS module constraints should fail closed at evaluation time. The specific old TypeScript harness references in that doc are now stale and should be cleaned up after migration.
- Existing project guidance keeps reusable test doubles as configured real implementations; native `*-check.nix` files should take real module/system/package inputs rather than inventing mocked Nix structures.

### External References

- External research was not needed. The repo already contains strong native Nix check patterns and the target boundary is a project-level architecture choice.

---

## Key Technical Decisions

- Native Nix check files are the canonical home for Nix assertions: use `nix/tests/*-check.nix` plus `flake.nix` `checks`, not Bun wrappers around `nix eval` JSON output.
- Preserve the existing Nix check idiom before introducing helpers: local `check = message: assertion: { ... }`, named scenario configs, filtered failures, `throw` on failure, and a minimal success derivation.
- Avoid self-referential `flake.checks` assertions from inside a check. Where the Bun fixture currently inspected `flake.checks` attr names, the native version should assert the concrete derivations or inputs that `flake.nix` passes into the check, not recursively inspect the check set that contains itself.
- Split mixed test files by ownership. Nix config/build/resolver behavior moves to Nix-owned checks; any remaining docs-only or TypeScript-only smoke should move out of `tools/testing/nix/` and keep a non-Nix name.
- Make orchestration cleanup the final migration step. Keep old Bun wrappers until their equivalent native checks exist, then delete the wrappers and invert the standards guard.
- Update `package.json` so `npm/bun run test` delegates to `just test-unit`; raw broad `bun test` should not be the blessed repo entrypoint.

---

## Open Questions

### Resolved During Planning

- Should this update the completed 2026-05-24 harness plan in place? No. The user chose a new superseding plan so the historical completed plan remains intact.
- Should Bun continue to run `tools/testing/nix/` behind a separate `test-nix` recipe? No. `test-nix` should be Nix-native.
- Should Nix assertions remain available through local developer commands and CI? Yes. `just` and CI still orchestrate both suites; only runner ownership changes.

### Deferred to Implementation

- Exact grouping of the migrated image/RockNix checks: implementation may choose one check per former TS file or fold assertions into an existing nearby check when failure messages remain clear and the file stays navigable.
- Whether docs smoke stays as a TypeScript standards/docs test or becomes a Nix `runCommand` grep check depends on the smallest clean split when `korri-live-usb-smoke.test.ts` is dismantled.
- Final list of Nix targets under `just test-nix` depends on which checks become flake `checks` versus package dry-build gates.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Current boundary:

just test-nix / CI
  -> bun test tools/testing/nix/*.test.ts
      -> spawnSync("nix", ["eval" | "build", ...])
          -> JSON/text result
              -> Bun expect(...)

Target boundary:

just test-unit / package test
  -> bun test over TypeScript tests only

just test-nix / CI
  -> nix build .#checks.<system>.<native-check> --no-link
  -> selected nix build package dry-runs where the gate is a build graph gate
      -> Nix assertion failure or derivation failure is the test failure
```

The migration is coverage-preserving, not behavior-changing. Each old Bun-backed Nix assertion should either map to a native `check` record in `nix/tests/` or be deliberately moved to a non-Nix TypeScript/docs test if it was never testing Nix behavior.

---

## Implementation Units

### U1. Migrate desktop build graph assertions to a native Nix check

**Goal:** Replace the Bun wrapper for desktop derivation graph and wrapper environment assertions with a native flake check.

**Requirements:** R1, R2, R3, R7

**Dependencies:** None

**Files:**
- Create: `nix/tests/korri-desktop-build-graph-check.nix`
- Modify: `flake.nix`
- Delete: `tools/testing/nix/korri-desktop-build-graph.test.ts`
- Delete: `tools/testing/nix/korri-desktop-build-graph.fixture.nix`

**Approach:**
- Move the current fixture’s derivation/path/closure facts into a `nix/tests/*-check.nix` file that receives the concrete package derivations it needs from `flake.nix`.
- Preserve the current assertion groups: shared unwrapped derivation, distinct wrapper variants, device closure cohesion, host isolation, input runtime environment, and Moonlight client runtime package selection.
- Preserve host isolation as a negative invariant: the host wrapper must not contain the pkgs2405 WebKitGTK or GTK store paths that belong only to device variants.
- Prefer passing package values into the check over re-opening the flake from inside the check.

**Patterns to follow:**
- `nix/tests/korri-compositor-module-check.nix` for readable grouped `check` records and failure reporting.
- Current `tools/testing/nix/korri-desktop-build-graph.fixture.nix` for the facts that need preservation.

**Test scenarios:**
- Happy path: building the new flake check succeeds when host/device wrappers share the intended unwrapped derivation and expose the expected runtime package/environment facts.
- Error path: a mismatch between host/device unwrapped derivations would fail with a check message naming the desktop build graph invariant.
- Integration: the check is reachable through `checks.<system>.korri-desktop-build-graph` and does not require Bun or TypeScript dependencies.

**Verification:**
- The old desktop build graph Bun test files are gone.
- The equivalent native flake check fails or passes entirely through Nix.
- No `bun test` command is needed to validate desktop derivation graph invariants.

---

### U2. Migrate generic image output assertions to native Nix checks

**Goal:** Move x86 image output, package/app/check exposure, headless/kiosk composition, and hardware-fact hygiene assertions out of Bun.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1 only for migration precedent; no runtime dependency.

**Files:**
- Create: `nix/tests/korri-image-outputs-check.nix`
- Modify: `flake.nix`
- Delete: `tools/testing/nix/korri-image-outputs-eval.test.ts`
- Delete: `tools/testing/nix/korri-image-outputs-eval.fixture.nix`

**Approach:**
- Convert the former fixture summary fields into direct Nix assertions over the relevant package derivations, image systems, module configs, and live USB app outputs.
- Keep image composition assertions grouped by product surface: output exposure, live USB, live USB Developer, headless, kiosk, external platform adapter, platform-managed user, and generic hardware-fact boundaries.
- Preserve the five current live USB app exposure checks (`korri-live-usb-vm`, `korri-live-usb-qemu`, `korri-live-usb-qemu-persistence`, `korri-live-usb-developer-qemu`, `korri-live-usb-developer-qemu-persistence`) by passing the relevant app set or app values into the native check.
- Avoid asserting `flake.checks` attr membership from within the check set itself. Instead, have `flake.nix` pass the relevant derivations/systems into the check and assert those values exist or have expected config.
- Give the source-text hardware-fact hygiene assertion an explicit home: either this check as a `runCommand`/Nix source grep over the four generic image files, or a clearly named standards test outside `tools/testing/nix/`. Do not drop the grep while migrating config assertions.

**Patterns to follow:**
- `nix/tests/korri-live-usb-config-check.nix` for live USB config assertions.
- `nix/tests/korri-compositor-module-check.nix` for grouped assertion style.
- Former `tools/testing/nix/korri-image-outputs-eval.fixture.nix` for coverage inventory.

**Test scenarios:**
- Happy path: headless and kiosk system compositions pass NixOS module assertions and expose the expected server/client/compositor/input settings.
- Happy path: Product and Developer live USB systems expose the expected persistence artifact/scope metadata and bootable ISO facts.
- Integration: image package/app exposure is validated without recursively inspecting the check attrset containing the validation itself, including the five live USB app names currently asserted by the Bun test.
- Edge case: generic image modules and x86 defaults remain free of SM8550/RockNix/Odin hardware facts through an explicit grep-style assertion destination.

**Verification:**
- The generic image output Bun test and fixture are deleted.
- Equivalent coverage is reachable through native Nix checks.
- Failure messages identify the product surface whose image invariant broke.

---

### U3. Complete RockNix image and SM8550 assertion migration

**Goal:** Absorb the remaining RockNix image eval assertions into native Nix checks, building on the new SM8550 config check already present in the working tree.

**Requirements:** R1, R2, R3, R5, R7

**Dependencies:** None, but should coordinate with any in-progress edits to `nix/tests/korri-rocknix-sm8550-config-check.nix`.

**Files:**
- Modify: `nix/tests/korri-rocknix-sm8550-config-check.nix`
- Modify: `flake.nix`
- Delete: `tools/testing/nix/korri-rocknix-image-eval.test.ts`
- Delete: `tools/testing/nix/korri-rocknix-image-eval.fixture.nix`

**Approach:**
- Extend the native RockNix/SM8550 check, or create a closely named sibling if the existing file would become too broad.
- Preserve current assertions for Thor/Sobo config targets, explicit system/rootfs package aliases, full kiosk appliance shape, constrained root session settings, inputplumber/gamescope/moonlight environment, user-launchable substrate packages, by-compatible impurity, and hardware-fact boundaries.
- Treat the old Bun file as an assertion inventory before deletion. The native check must explicitly cover the current groups: config target names, target/host package aliases, server/user/service-mode flags, client/kiosk/inputd flags, root kiosk user and `createUser = false`, `/run/user/0` runtime dir, existing session bus with `main-space-session-dbus.service`, inputplumber provider/services/data dirs/package, Gamescope package/version, Moonlight command/mapping/platform/inputplumber requirement, SDL video driver, empty `preStart`, cemu/moonlight substrate packages, by-compatible impurity, and generic hardware-fact hygiene.
- Decide cross-system placement deliberately: target-package alias assertions that are inherently `aarch64-linux` may belong in an aarch64 check, while host rootfs/config checks may remain under x86 host checks.

**Patterns to follow:**
- `nix/tests/korri-rocknix-sm8550-config-check.nix` for multi-system check inputs (`thorSystem`, `soboSystem`) and explicit user-facing failure messages.
- Former `tools/testing/nix/korri-rocknix-image-eval.fixture.nix` for the complete assertion inventory.

**Test scenarios:**
- Happy path: Thor and Sobo remain full kiosk appliances, not server-only targets.
- Happy path: constrained RockNix kiosk session shape keeps root user, existing session bus, inputplumber provider, SM8550-safe Gamescope, and Moonlight `v4l2m2m` environment.
- Integration: explicit system/rootfs package aliases are validated through Nix outputs without requiring Bun.
- Error path: by-compatible remains impure when the required compatibility environment is absent.
- Edge case: generic image modules remain free of RockNix/SM8550 facts.

**Verification:**
- The RockNix image eval Bun test and fixture are deleted.
- RockNix/SM8550 checks are available as native flake checks on the appropriate system(s).
- CI can call those checks without installing or invoking Bun.

---

### U4. Split live USB safety, resolver, dry-build, and docs coverage by owner

**Goal:** Dismantle the mixed live USB Bun tests so Nix config/build/resolver behavior is tested by Nix, while any remaining docs-only or TypeScript-only smoke no longer lives under a Nix test path.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U2 for live USB config assertion precedent.

**Files:**
- Modify: `nix/tests/korri-live-usb-config-check.nix`
- Create: `nix/tests/korri-live-usb-persistence-resolver-check.nix`
- Modify: `flake.nix`
- Delete: `tools/testing/nix/korri-live-usb-safety-eval.test.ts`
- Delete: `tools/testing/nix/korri-live-usb-safety-eval.fixture.nix`
- Delete: `tools/testing/nix/korri-live-usb-smoke.test.ts`
- Create or modify, only if docs smoke remains TypeScript-owned: `tools/testing/standards/korri-live-usb-docs.test.ts`

**Approach:**
- Move live USB Product/Developer persistence config assertions into the existing native config check where they naturally belong.
- Preserve the invalid-artifact negative evaluation path explicitly. Because a normal flake check cannot simply contain a permanently invalid config, add a check strategy that runs a known-bad evaluation in a controlled derivation or focused fixture and asserts the error still names `services.korri.liveUsbPersistence.artifact`.
- Move resolver-script behavior tests into Nix-owned `runCommand` checks that create temporary fixture directories and command shims, then run `nix/images/live-usb-persistence-resolver.sh` as the real script.
- Keep resolver scenario attribution clear: either one small derivation per scenario, or one derivation that accumulates named scenario failures instead of failing anonymously on the first shell assertion. Handle chmod-locked fixture directories with defensive cleanup so the builder can remove temporary state after assertions.
- Keep ISO dry-build ownership in Nix orchestration: either as explicit package dry-run lines in `just test-nix` or as a named native gate if implementation finds a clean flake-check expression.
- Move docs smoke out of `tools/testing/nix/` if it remains a Bun TypeScript test; alternatively make it a tiny Nix check that greps the docs for required live USB operator language.

**Patterns to follow:**
- `nix/tests/korri-live-usb-config-check.nix` for config assertions.
- `nix/tests/korri-live-usb-vm-smoke.nix` for Nix-owned live USB smoke checks.
- Existing resolver rig scenarios in `tools/testing/nix/korri-live-usb-safety-eval.test.ts` for behavior inventory.

**Test scenarios:**
- Happy path: Product artifact exposes allowlisted persistence metadata and does not declare broad persistence roots.
- Happy path: Developer artifact exposes broad Developer metadata without enabling SSH by default.
- Error path: invalid artifact values fail during Nix evaluation with an option-specific message, preserving the current negative-eval assertion rather than merely relying on an uninspected Nix failure.
- Happy path: resolver script mounts sibling USB persistence and prepares allowlisted state.
- Edge case: duplicate persistence labels, legacy broad-home state, Developer namespace locking, symlinked Developer state, non-removable boot parents, mount failures, and preparation failures choose the documented fail-safe behavior with named scenario attribution.
- Integration: ISO package dry-build gates remain reachable through Nix-owned local/CI commands.
- Docs path: live USB operator docs coverage, if retained, is no longer named or routed as a Nix test through Bun.

**Verification:**
- Both live USB Bun files under `tools/testing/nix/` are gone.
- Live USB config, resolver, and package gates are represented under Nix-owned checks or Nix-owned `just test-nix` commands.
- Any retained docs smoke has a non-Nix path and does not spawn Nix.

---

### U5. Replace local and CI orchestration with the native runner boundary

**Goal:** Make `just`, package scripts, and CI invoke TypeScript tests with Bun and Nix checks with Nix, with no Bun route into `tools/testing/nix/`.

**Requirements:** R1, R3, R4, R5, R6

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `justfile`
- Modify: `package.json`
- Modify: `.github/workflows/desktop-stage2.yml`
- Modify: `tools/testing/standards/test-suite-partitioning.test.ts`

**Approach:**
- Change `test-unit` to a plain TypeScript/Bun test entrypoint once no Nix-backed TS files remain.
- Change `test-nix` from `bun test tools/testing/nix/` to native Nix gates: build relevant `checks` and keep explicit package dry-runs only where the gate is intentionally a build-plan check rather than an assertion derivation.
- Change `package.json` `test` from raw `bun test` to `just test-unit` so the blessed package script follows repo orchestration.
- Update desktop Stage 2 CI so “Evaluate image outputs” calls native Nix checks instead of installing Bun dependencies and running Nix-backed Bun tests.
- Remove the now-dead `.github/workflows/desktop-stage2.yml` `tools/testing/nix/**` path filters from both pull request and push triggers; `nix/**` already covers the migrated native checks.
- Invert the standards test: assert the absence of `bun test tools/testing/nix/`, assert no test files exist under `tools/testing/nix/`, assert `test-nix` resolves to Nix commands, and assert the package test script delegates to the repo recipe.

**Execution note:** Boundary guard first. Update the standards test so it fails on the old orchestration, then change `justfile`, `package.json`, and CI to satisfy it after native checks exist.

**Patterns to follow:**
- `tools/testing/standards/test-suite-partitioning.test.ts` existing `just --dry-run` approach, but with the assertions inverted.
- `.github/workflows/desktop-stage2.yml` existing direct Nix build/eval steps for selected flake outputs.

**Test scenarios:**
- Happy path: `test-unit` runs Bun without any Nix-specific path ignore or Nix test path target.
- Happy path: `test-nix` dry-run output contains Nix commands and no `bun test` invocation.
- Edge case: adding a future `*.test.ts` file under `tools/testing/nix/` fails the standards guard.
- Integration: `check` still runs both TypeScript and Nix validation.
- CI: desktop Stage 2 evaluates image/RockNix checks without `bun install` solely for Nix assertion files, and no longer has dead `tools/testing/nix/**` path filters.

**Verification:**
- No local or CI command routes Nix assertions through Bun.
- `package.json` no longer exposes a raw broad `bun test` script as the project test contract.
- The standards test protects the new boundary.

---

### U6. Remove obsolete Nix-through-Bun artifacts and stale references

**Goal:** Finish the migration by deleting the obsolete directory and updating references that would teach future contributors the old pattern.

**Requirements:** R1, R2, R6

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Delete: `tools/testing/nix/` if empty after file deletions
- Modify: `../01KSBMG31V2GQ4NCWTAP023Z8Y-refactor-nix-test-harness/plan.md` only if a short superseded note is desired by the implementer
- Modify: `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` only if the implementation elects to clean the stale old harness path in the same PR

**Approach:**
- Remove the obsolete `tools/testing/nix/` directory after all wrapper files are deleted.
- Search for live references to `bun test tools/testing/nix`, `tools/testing/nix/*.test.ts`, and old `*-eval.test.ts` paths.
- Treat deletion as coverage-gated: each deleted wrapper file must have an in-plan or in-code assertion inventory showing where its former `it()` cases landed in native checks.
- Update only references that would confuse current contributors or active validation commands. Historical plan prose can remain unless it claims to describe the current canonical approach.

**Patterns to follow:**
- Repo rule: avoid bonus docs churn. Update stale references only when they affect current contributor guidance or active validation paths.

**Test scenarios:**
- Happy path: repository search finds no active command invoking `bun test tools/testing/nix/`.
- Happy path: repository search finds no remaining `tools/testing/nix/*.test.ts` files.
- Happy path: each deleted wrapper file has a completed assertion inventory or equivalent native-check mapping, so passing checks cannot hide dropped coverage.
- Edge case: historical docs may mention the old plan as history, but current guidance must not present Bun-wrapped Nix tests as canonical.

**Verification:**
- The obsolete Nix-through-Bun directory is gone or contains no Bun test files.
- Current commands, standards tests, CI, and contributor-facing guidance all point at the native boundary.

---

## System-Wide Impact

- **Interaction graph:** Local `just` recipes, package scripts, and GitHub Actions continue to orchestrate validation, but the runner ownership changes underneath them.
- **Error propagation:** Nix assertion failures should surface as Nix evaluation/build failures with explicit check messages; Bun should no longer translate Nix failures into TypeScript stack traces.
- **State lifecycle risks:** None expected; this is test harness and CI orchestration only.
- **API surface parity:** Developer entrypoints remain `just test-unit`, `just test-nix`, and `just check`, but `test-nix` semantics change from Bun-backed to Nix-native.
- **Integration coverage:** Coverage currently provided by Nix-through-Bun files must be mapped one-for-one before deleting wrappers; the old Bun files are coverage inventories until their replacement check records exist.
- **Unchanged invariants:** NixOS module behavior, package outputs, image composition, and runtime app behavior are not intended to change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Coverage is lost while deleting Bun wrappers | Migrate one old file’s assertions at a time, keep old wrappers until native checks exist, and use the old test files as coverage inventories. |
| Native checks accidentally recurse through `self.checks` | Pass concrete systems/packages/check inputs from `flake.nix` into checks instead of introspecting the check attrset from inside itself. |
| Cross-system RockNix assertions become awkward from x86 checks | Split host and target assertions across system-appropriate checks when needed rather than forcing all RockNix assertions into one x86 check. |
| Resolver-script tests are harder to express in Nix than Bun | Use a `runCommand` check with real shell execution and fixture shims; keep the real resolver script as the unit under test. |
| `test-unit` raw Bun discovery regresses if future Nix `.test.ts` files appear | Standards guard fails on any `tools/testing/nix/*.test.ts` or any `bun test tools/testing/nix` route. |
| CI gets slower if it builds too many Nix targets | Replace only the existing Nix-through-Bun gates with native equivalents first; broader flake-check expansion remains deferred. |

---

## Documentation / Operational Notes

- The implementation should avoid broad documentation churn, but active command references must stop teaching `bun test tools/testing/nix/`.
- After migration, a small `docs/solutions/` capture would be valuable because this plan closes a gap identified by the previous completed harness plan.

---

## Sources & References

- Superseded plan: `../01KSBMG31V2GQ4NCWTAP023Z8Y-refactor-nix-test-harness/plan.md`
- Native Nix check patterns: `nix/tests/korri-compositor-module-check.nix`, `nix/tests/korri-input-module-check.nix`, `nix/tests/korri-server-module-check.nix`, `nix/tests/korri-live-usb-config-check.nix`, `nix/tests/korri-live-usb-vm-smoke.nix`, `nix/tests/korri-rocknix-sm8550-config-check.nix`
- Nix-through-Bun files to migrate: `tools/testing/nix/korri-desktop-build-graph.test.ts`, `tools/testing/nix/korri-image-outputs-eval.test.ts`, `tools/testing/nix/korri-live-usb-safety-eval.test.ts`, `tools/testing/nix/korri-live-usb-smoke.test.ts`, `tools/testing/nix/korri-rocknix-image-eval.test.ts`
- Orchestration surfaces: `justfile`, `package.json`, `.github/workflows/desktop-stage2.yml`, `tools/testing/standards/test-suite-partitioning.test.ts`
- Institutional learning: `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md`
