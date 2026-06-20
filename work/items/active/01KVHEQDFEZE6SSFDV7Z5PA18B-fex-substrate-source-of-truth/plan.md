---
title: refactor: Make FEX the substrate source of truth
type: refactor
status: completed
date: 2026-06-20
verify_command: "bun test product/plugins/fex-runtime/src/plugin.test.ts product/plugins/proton-runtime/src/plugin.test.ts product/plugins/mega-man-arena/src/plugin.test.ts product/plugins/index.test.ts product/plugins/steam/src/plugin.test.ts product/plugins/steam/src/boundary.test.ts product/plugins/steam/src/materializer.test.ts product/plugins/steam/src/session/lifecycle-hook.test.ts --timeout 30000 && bash product/plugins/fex-runtime/packages/fex-runtime/tests/setup-env-smoke.sh && bash product/plugins/proton-runtime/packages/proton-runtime/tests/setup-env-smoke.sh"
---

# refactor: Make FEX the substrate source of truth

## Summary

Refactor plugin path ownership so `@korri:fex` owns generic FEX substrate facts and `@korri:proton` owns Proton runtime defaults, while `@korri:steam` keeps Steam-specific AppID launch, Steam Runtime repair, and service-envelope behavior. This removes the current TypeScript-level dependency where generic runtime plugins import Steam path constants, without changing the proven Bandai runtime path or Steam launch behavior.

---

## Problem Frame

The current Steam/FEX proof is ROCKNIX-aligned, but the code still has transitional overlap: generic runtime plugins import `steamRuntimePaths` from the Steam plugin for FEX rootfs and Proton paths. That makes Steam look like the source of truth for generic FEX/Proton facts, even though Steam should only be the provider/consumer of a managed runtime substrate and the owner of Steam-specific mutable repair.

---

## Assumptions

*This plan was authored without stopping for confirmation. The items below are agent inferences based on the prior discussion and current repo research; review them before implementation if the intended architecture differs.*

- The default Bandai FEX rootfs path remains `/var/lib/korri/steam/fex-rootfs`; this plan changes ownership/import boundaries, not deployed paths.
- The default Proton 10 path remains `/var/lib/korri/steam/steamapps/common/Proton 10.0`; this plan moves the path constant to `@korri:proton` but does not change where Steam installs Proton.
- `@korri:fex` and `@korri:proton` keep their declarative `steam.runtime` provisioning requirement for now, preserving current plugin auto-enable behavior while eliminating path imports from Steam.
- Extracting FEX rootfs provisioning out of the Steam NixOS module is valuable but out of scope for this plan; follow-up is captured as backlog item `01KVHFVV6JRH4VVJPFKMZ26ZV2`.
- Non-Steam live/manual validation is limited to Mega Man Arena on Bandai for this plan.
- If the ownership move exposes broken FEX/Proton consumers, fix all discovered consumer fallout rather than parking it, while still using Mega Man Arena as the only live/manual validation gate.
- The implementing agent may choose additional automated confidence gates for Mega Man Arena, but must stop immediately after the automated gate is green and the implementation commit is created. Do not prepare an extra manual checklist or continue into live/manual validation.
- If Steam boundary tests fail as fallout from this refactor, fix them in this plan before the Mega Man Arena handoff gate.

---

## Requirements

- R1. `@korri:fex` must be the canonical TypeScript owner for generic FEX substrate paths used by FEX consumers.
- R2. `@korri:proton` must be the canonical TypeScript owner for Proton runtime default paths used by Proton consumers.
- R3. `@korri:steam` must no longer export FEX rootfs or Proton root path facts as part of `steamRuntimePaths`.
- R4. Steam-specific mutable runtime repair must stay inside the Steam plugin/package boundary.
- R5. The proven Bandai Steam AppID launch path must not change: Korrid still resolves Steam games to `korri-steam-app <appid>` and Steam still owns launch/install authority.
- R6. Existing runtime provisioning behavior should remain stable in this slice; any later move toward a Steam-independent FEX provisioner must be explicit follow-up work.
- R7. Tests must prevent reintroducing `steamRuntimePaths.fexRootfs` or `steamRuntimePaths.proton10Root` imports outside the Steam plugin.
- R8. Package-level FEX/Proton setup helpers must use the same canonical defaults as their owning runtime plugins, or have parity tests that fail if the helper defaults drift from those constants.
- R9. Steam boundary test fallout caused by this ownership cleanup must be fixed in this plan, not deferred.
- R10. All discovered FEX/Proton consumer fallout from the ownership move must be fixed, while live/manual validation remains limited to Mega Man Arena.
- R11. The work must be committed after automated gates pass and before the user performs manual Mega Man Arena validation.
- R12. Manual Mega Man Arena validation must happen on Bandai specifically.

---

## Scope Boundaries

- Do not change the runtime path values deployed on Bandai.
- Do not move `steam-guest-runtime-prep`, pressure-vessel repair, Proton ARM64 patches, `korri-steam-app`, or AppID cleanup into `@korri:fex`.
- Do not alter Steam AppID materialization, visibility policy, Gamescope behavior, install authority, or screenshot gate criteria.
- Do not investigate Stray, FEZ, VVVVVV, or Flinthook compatibility failures in this plan.
- Do not build a new NixOS FEX rootfs provisioner outside Steam in this slice.

### Deferred to Follow-Up Work

- Extract FEX rootfs provisioning from the Steam NixOS module into a plugin-owned or shared substrate module if/when non-Steam FEX consumers need Steam-free deployment.
- Decide whether `@korri:fex` should eventually drop or mark non-auto-enabled its `steam.runtime` requirement after provisioning is no longer Steam-owned.
- Promote richer FEX diagnostics from the Steam runtime check into a generic `@korri:fex` diagnostics surface once the provisioning boundary is clearer.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/plugin/index.ts` defines plugin identity, `requires`, config contributions, and operation-scoped handlers.
- `product/platform/plugin/registry.ts` expands enabled plugins and requirement-driven auto-enablement.
- `product/plugins/fex-runtime/src/plugin.ts` currently imports `steamRuntimePaths.fexRootfs` from Steam for its default rootfs.
- `product/plugins/proton-runtime/src/plugin.ts` currently imports `steamRuntimePaths.proton10Root` from Steam for its default Proton root.
- `product/plugins/steam/src/plugin.ts` currently exports `steamRuntimePaths` containing `stateRoot`, `fexRootfs`, and `proton10Root`.
- `product/plugins/mega-man-arena/src/plugin.test.ts` verifies Mega Man Arena declares FEX and Proton runtime dependencies.
- `product/plugins/mega-man-arena/packages/mega-man-arena/check.nix` verifies the package wrapper delegates to `korri-fex-runtime` and `korri-proton-runtime` setup helpers.
- `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep` correctly owns Steam Runtime / pressure-vessel mutation and should remain Steam-owned.
- `product/plugins/steam/packages/steam-korri/tests/steam-guest-runtime-prep-smoke.sh` covers the Steam-specific FEX integration contract, including `srt-bwrap` behavior.

### Institutional Learnings

- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`: Steam Sniper `srt-bwrap` must resolve `${FEX_ROOTFS}/usr/bin/bwrap`, prepend host PATH, and invoke through `/usr/bin/FEX`; this is a Steam runtime-prep contract, not generic FEX plugin behavior.
- `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`: plugin-specific behavior belongs in plugin-owned code or explicit product composition; generic code should use provider-keyed seams.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: the component that knows a fact should record it explicitly rather than forcing downstream wrappers to rediscover it from env/argv.
- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`: do not disturb Steam-inside-Gamescope/AppID launch behavior while doing runtime-boundary cleanup.
- `docs/solutions/architecture-patterns/steam-appid-launch-ux-policy-2026-06-20.md`: production/default hide and explicit debug visibility are Steam UX policy concerns, not FEX substrate concerns.

### External References

- Not used. Local plugin architecture and live Bandai learnings are sufficient for this bounded internal refactor.

---

## Key Technical Decisions

- **Move path ownership, not deployment paths:** `@korri:fex` owns the FEX rootfs constant and `@korri:proton` owns the Proton root constant, but both values remain the currently proven Bandai paths and package helper defaults must stay in parity with those constants.
- **Keep runtime provisioning behavior stable:** this plan preserves the existing declarative `steam.runtime` requirement so consumers do not silently lose the Steam-provisioned rootfs during a source-of-truth cleanup.
- **Trim Steam's path surface:** `steamRuntimePaths` should shrink to Steam-owned state only; it must not remain a convenience export for FEX/Proton defaults.
- **Steam runtime-prep remains Steam-owned:** pressure-vessel wrappers, Proton patching, `srt-bwrap`, AppID launch, and cleanup are all consequences of Steam's mutable runtime and must not be generalized prematurely.
- **Consumers import generic constants:** tests and plugin consumers that need default FEX/Proton paths import them from their owning runtime plugins, not from Steam.
- **Mega Man Arena is the sole live/manual non-Steam gate:** validate the delegated FEX/Proton helper path through Mega Man Arena on Bandai only, then stop for user validation.
- **Fix discovered consumer fallout:** if the source-of-truth move exposes other broken FEX/Proton consumers, fix them in this plan so the repo remains coherent; do not expand live/manual validation beyond Mega Man Arena.
- **Boundary enforcement is test-backed:** add or update tests so future code cannot reintroduce Steam path constants as the generic source of truth.

---

## Open Questions

### Resolved During Planning

- **Should this plan change deployed FEX/Proton paths?** No. Path values remain unchanged; only TypeScript ownership/import boundaries change.
- **Should Steam runtime-prep move into `@korri:fex`?** No. It mutates Steam Runtime and Proton files, so it remains Steam-owned.
- **Should the current `steam.runtime` provisioning requirement be removed now?** No. Keep current provisioning behavior stable; fully Steam-independent FEX provisioning is deferred.
- **Should this plan include shell helpers?** Yes. Runtime `setup-env` helpers are included because actual game wrappers source them.
- **Which non-Steam consumer should be validated?** Mega Man Arena only.
- **What manual gate should be used after automated confidence?** Full visual/input/cleanup check: visible playable/menu state, input works, fresh non-black screenshot, and no obvious residual process tree after stop.
- **Should implementation prepare a manual checklist after the automated Mega Man Arena gate?** No. Stop immediately after the automated gate is green and the commit is created.
- **If Steam boundary tests fail, should they be fixed here?** Yes. Steam boundary fallout from this refactor is in scope.
- **Should the work be committed before manual Mega Man Arena validation?** Yes. Commit after automated gates pass, then pause for manual validation.
- **If other FEX/Proton consumers break, should they be parked?** No. Fix all discovered FEX/Proton consumer fallout in this plan.
- **Where must manual Mega Man Arena validation happen?** Bandai specifically.

### Deferred to Implementation

- **Exact test helper placement for boundary scans:** implementation should choose the smallest existing test location that already owns plugin-boundary assertions.
- **Whether to rename existing tests while touching them:** avoid renames unless local conventions make the new assertions clearer.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  FEX[@korri:fex] -->|owns| FEXPATH[FEX rootfs path constant]
  PROTON[@korri:proton] -->|owns| PROTONPATH[Proton default root constant]
  STEAM[@korri:steam] -->|owns| STEAMSTATE[Steam state root]
  STEAM -->|owns| PREP[Steam Runtime prep / pressure-vessel repair]
  STEAM -->|owns| APPID[korri-steam-app AppID launch]
  FEX -. declarative provisioning requirement .-> STEAM
  PROTON -. declarative provisioning requirement .-> STEAM
  MMA[Mega Man Arena] -->|delegates to helpers| FEXPATH
  MMA -->|delegates to helpers| PROTONPATH
```

The important boundary is that imports flow toward the generic runtime plugins for generic path facts, while Steam remains responsible for the mutable Steam-specific adapter work.

---

## Implementation Units

### U1. Establish canonical FEX runtime paths

**Goal:** Make `@korri:fex` own and export the default FEX rootfs path used by FEX consumers and its package helper.

**Requirements:** R1, R6, R8

**Dependencies:** None

**Files:**
- Modify: `product/plugins/fex-runtime/src/plugin.ts`
- Modify: `product/plugins/fex-runtime/index.ts`
- Modify: `product/plugins/fex-runtime/packages/fex-runtime/setup-env`
- Test: `product/plugins/fex-runtime/src/plugin.test.ts`
- Create test: `product/plugins/fex-runtime/packages/fex-runtime/tests/setup-env-smoke.sh`

**Approach:**
- Add an exported FEX runtime path object or constant in the FEX runtime plugin.
- Use that local FEX-owned value for the default `runtime.resolve` rootfs behavior.
- Keep the package `setup-env` default in parity with the exported FEX-owned value; implementation may either generate/share the literal through package tooling or add a smoke/parity check that fails on drift.
- Preserve existing override behavior: callers that pass an explicit rootfs still win over the default.
- Preserve the current declarative provisioning requirement for this slice.

**Execution note:** Characterize current default and override behavior before changing imports.

**Patterns to follow:**
- `product/plugins/fex-runtime/src/plugin.ts` existing `runtime.resolve` handler shape.
- `product/plugins/steam/src/plugin.ts` path object style, but do not keep generic paths there.

**Test scenarios:**
- Happy path: resolving `@korri:fex` without a rootfs override returns `FEX_ROOTFS` equal to the FEX-owned default path.
- Happy path: resolving with an explicit rootfs override uses the caller-provided rootfs, not the default.
- Integration: plugin descriptor still declares the current runtime provisioning requirement expected by existing compositions.
- Boundary: FEX runtime tests no longer import `steamRuntimePaths` from the Steam plugin.
- Integration: FEX package `setup-env` defaults `FEX_ROOTFS` to the same path exposed by the FEX runtime plugin and still respects caller-provided `FEX_ROOTFS` overrides.

**Verification:**
- FEX runtime tests prove defaults and overrides still work while the default source moves to `@korri:fex`.

---

### U2. Establish canonical Proton runtime paths

**Goal:** Make `@korri:proton` own and export its default Proton runtime root instead of importing it from Steam, and keep the package helper in parity.

**Requirements:** R2, R6, R8

**Dependencies:** U1 is not technically required, but should land first to establish the pattern.

**Files:**
- Modify: `product/plugins/proton-runtime/src/plugin.ts`
- Modify: `product/plugins/proton-runtime/index.ts`
- Modify: `product/plugins/proton-runtime/packages/proton-runtime/setup-env`
- Test: `product/plugins/proton-runtime/src/plugin.test.ts`
- Create test: `product/plugins/proton-runtime/packages/proton-runtime/tests/setup-env-smoke.sh`

**Approach:**
- Add an exported Proton runtime path object or constant in the Proton runtime plugin.
- Use that local Proton-owned value for default `runtime.resolve` behavior.
- Keep the package `setup-env` default in parity with the exported Proton-owned value; implementation may share the value through packaging or add smoke/parity coverage.
- Keep explicit caller overrides working.
- Preserve the current declarative provisioning requirement in this slice, because the default Proton root is still physically Steam-provisioned on Bandai.

**Patterns to follow:**
- U1's exported path shape.
- Existing `product/plugins/proton-runtime/src/plugin.ts` runtime resolver tests.

**Test scenarios:**
- Happy path: resolving Proton without a root override uses the Proton-owned default path.
- Happy path: resolving with an explicit Proton root override uses the caller-provided path.
- Integration: descriptor requirement still communicates the current Steam runtime provisioning dependency.
- Boundary: Proton runtime tests no longer import `steamRuntimePaths` from the Steam plugin.
- Integration: Proton package `setup-env` defaults `KORRI_PROTON_RUNTIME_ROOT` to the same path exposed by the Proton runtime plugin and still respects caller-provided overrides.

**Verification:**
- Proton runtime tests prove default/override behavior and no longer depend on Steam path exports.

---

### U3. Trim Steam path exports to Steam-owned facts

**Goal:** Remove FEX and Proton default path ownership from the Steam plugin export surface while preserving Steam AppID launch behavior.

**Requirements:** R3, R4, R5, R7, R9

**Dependencies:** U1, U2

**Files:**
- Modify: `product/plugins/steam/src/plugin.ts`
- Review/modify if needed: `product/plugins/steam/index.ts`
- Test: `product/plugins/steam/src/plugin.test.ts`
- Test: `product/plugins/steam/src/boundary.test.ts`
- Test: `product/plugins/steam/src/materializer.test.ts`
- Test: `product/plugins/steam/src/session/lifecycle-hook.test.ts`
- Test: `product/plugins/index.test.ts`

**Approach:**
- Shrink `steamRuntimePaths` to Steam-owned facts such as Steam state root.
- Remove `fexRootfs` and `proton10Root` from Steam's path object/export surface.
- Add or update boundary coverage so non-Steam plugins cannot use Steam as the generic source of FEX/Proton path truth.
- Keep Steam plugin runtime-prep/package exports unchanged except for any required import updates.

**Patterns to follow:**
- Existing Steam boundary tests in `product/plugins/steam/src/boundary.test.ts`.
- First-party plugin boundary expectations from `product/plugins/AGENTS.md`.

**Test scenarios:**
- Happy path: Steam plugin still exposes its provider/app/storage/module contributions after trimming generic path facts.
- Happy path: Steam AppID materialization still resolves service-wrapper launches with AppID-only args in `product/plugins/steam/src/materializer.test.ts`.
- Integration: Steam AppID cleanup metadata and lifecycle behavior remain covered by `product/plugins/steam/src/session/lifecycle-hook.test.ts`.
- Boundary: no public `steamRuntimePaths.fexRootfs` or `steamRuntimePaths.proton10Root` values remain available to consumers.
- Integration: plugin index/composition tests still enable Steam where explicitly configured or required.
- Error path: a future import attempt from non-Steam code should fail by typecheck or boundary test rather than silently using a compatibility shim.

**Verification:**
- Steam plugin and plugin index tests prove Steam still composes while generic runtime path facts are no longer Steam-owned.
- Any Steam boundary fallout from this ownership cleanup is fixed before proceeding to the Mega Man Arena gate.

---

### U4. Validate Mega Man Arena as the non-Steam FEX/Proton consumer

**Goal:** Prove the source-of-truth cleanup preserves Mega Man Arena's non-Steam FEX/Proton wrapper path before pausing for manual validation.

**Requirements:** R1, R2, R7, R8, R10, R11, R12

**Dependencies:** U1, U2

**Files:**
- Test: `product/plugins/mega-man-arena/src/plugin.test.ts`
- Modify if needed: `product/plugins/mega-man-arena/packages/mega-man-arena/check.nix`
- Review/modify if needed: `product/plugins/mega-man-arena/packages/mega-man-arena/mega-man-arena-fex`

**Approach:**
- Keep Mega Man Arena delegated to `korri-fex-runtime` and `korri-proton-runtime`; do not copy new path constants into the game wrapper.
- Strengthen package checks only if needed so they prove `mega-man-arena-fex` sources the FEX and Proton setup helpers and respects their exported runtime env.
- Keep live/manual validation limited to Mega Man Arena on Bandai.
- If implementation reveals other broken FEX/Proton consumers, fix those discovered consumer issues in this plan, but do not add them to the live/manual validation matrix.
- After automated confidence is high and the implementation commit is created, stop immediately. Do not prepare a separate checklist or claim live/manual success; the user will validate visual/input/cleanup manually on Bandai.

**Patterns to follow:**
- Existing Mega Man Arena descriptor test for `with` entries referencing `@korri:fex` and `@korri:proton`.
- Existing Mega Man Arena package `check.nix` assertions for wrapper/helper delegation.

**Test scenarios:**
- Happy path: Mega Man Arena descriptor still requires `@korri:fex/linux-user` and `@korri:proton/proton-10`.
- Happy path: package check proves `mega-man-arena-fex` sources `korri-fex-runtime` and `korri-proton-runtime` setup helpers.
- Integration: wrapper checks prove `KORRI_FEX_RUNTIME_*` and `KORRI_PROTON_RUNTIME_*` handoff variables remain present after helper-default refactor.
- Boundary: Mega Man Arena does not import `steamRuntimePaths` or hardcode FEX rootfs as its source of truth.

**Verification:**
- Automated checks convince the implementer that Mega Man Arena's delegated FEX/Proton path is intact.
- Commit the green implementation before manual validation.
- Stop immediately after the automated gate and commit; user manual validation happens on Bandai and consists of visible playable/menu state, working input, fresh non-black screenshot, and no obvious residual process tree after stop.

---

### U5. Add source-of-truth boundary coverage

**Goal:** Lock the refactor so the generic runtime path ownership does not drift back to Steam.

**Requirements:** R3, R7

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `product/plugins/steam/src/boundary.test.ts`
- Modify if existing registry expectations require it: `product/plugins/index.test.ts`

**Approach:**
- Add focused assertions or boundary scans for the specific anti-patterns this plan removes.
- Prefer type-level/export-level tests where possible; use text-boundary scans only if the repo already uses them for plugin boundaries.
- Keep this unit narrow: do not introduce broad repository-wide standards scans unless an existing Steam boundary test already uses that style.
- Assert behavior, not just strings: plugin composition should still work and runtime plugins should still resolve defaults.

**Patterns to follow:**
- Existing plugin boundary tests for first-party plugin separation.
- `product/plugins/index.test.ts` registry/composition tests.

**Test scenarios:**
- Boundary: `steamRuntimePaths` itself has no `fexRootfs` or `proton10Root` keys.
- Boundary: no non-Steam runtime plugin imports `steamRuntimePaths` for generic FEX/Proton defaults.
- Integration: enabling plugins through registry still produces expected enabled plugin ids after keeping current provisioning requirements stable.
- Error path: if `steamRuntimePaths` regains generic FEX/Proton keys, the boundary test fails.

**Verification:**
- Boundary tests fail closed on reintroduced Steam-owned generic runtime constants.

---

### U6. Document the ownership split

**Goal:** Make the boundary clear to future implementers so path ownership and runtime-prep ownership do not collapse again.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** U1-U5

**Files:**
- Modify: `product/plugins/AGENTS.md`
- Create or modify: `docs/solutions/architecture-patterns/fex-substrate-and-steam-runtime-boundary-2026-06-20.md`

**Approach:**
- Document the intended boundary in plain language: FEX owns generic substrate facts; Proton owns Proton defaults; Steam owns AppID launch, service envelope, and mutable Steam Runtime repair.
- Explicitly call out that the current default FEX rootfs may still be physically provisioned by Steam, but TypeScript path ownership should not flow through Steam.
- Link back to the Steam Sniper bwrap architecture note and Steam AppID UX policy.

**Patterns to follow:**
- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`
- `docs/solutions/architecture-patterns/steam-appid-launch-ux-policy-2026-06-20.md`
- `product/plugins/AGENTS.md` concise plugin-boundary guidance.

**Test scenarios:**
- Test expectation: none -- documentation-only unit. Existing boundary tests from U5 enforce the documented contract.

**Verification:**
- Documentation states the split without suggesting Steam launch or runtime-prep should move into `@korri:fex`.

---

## System-Wide Impact

- **Interaction graph:** `@korri:fex`, `@korri:proton`, `@korri:steam`, Mega Man Arena, any discovered FEX/Proton consumers with fallout, and plugin registry tests are affected. Generic platform launch code and sessiond should not change.
- **Error propagation:** Runtime resolver errors should remain unchanged; this plan changes defaults' owners, not failure semantics.
- **State lifecycle risks:** No persistent state migration is planned. The deployed rootfs and Proton directories stay in place.
- **API surface parity:** Export surfaces change for runtime path constants. Callers must use `@korri:fex` / `@korri:proton` rather than Steam for generic runtime paths.
- **Integration coverage:** Registry and consumer tests are required because import-only refactors can compile while weakening plugin enablement behavior.
- **Unchanged invariants:** Steam still owns install/launch authority, service envelope, Steam Runtime repair, pressure-vessel wrapping, Proton patching, visibility policy, and AppID cleanup.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Moving constants creates a false sense that FEX is fully Steam-independent. | Keep provisioning requirement and document Steam-free provisioning as deferred follow-up. |
| TypeScript defaults drift from NixOS module or package helper defaults. | Keep path values unchanged in this slice, add explicit path-lock/parity tests for exported constants and `setup-env` defaults, and leave Nix provisioning untouched. |
| Boundary cleanup accidentally changes plugin auto-enable behavior. | Preserve current declarative requirements and add registry tests covering expected composition. |
| Steam runtime-prep gets over-generalized into FEX. | Scope boundaries and U6 docs explicitly keep mutable Steam Runtime repair in `@korri:steam`. |
| Scope creeps into live/manual validation for every non-Steam FEX/Proton consumer. | Fix discovered consumer fallout in code/tests, but keep the live/manual gate limited to Mega Man Arena on Bandai. |

---

## Documentation / Operational Notes

- This refactor should not require a Bandai deploy by itself because runtime paths and Steam launch behavior remain unchanged.
- If a later plan extracts FEX rootfs provisioning out of Steam, it should include NixOS module checks and a live `steam-guest-runtime-prep --check` gate on Bandai.
- The Steam matrix proof remains valid as long as `korri-steam-app` dry-runs and live AppID gates continue to resolve the same path and runtime envelope.
- When implementation reaches the Mega Man Arena confidence gate, commit the green implementation and then stop immediately for Bandai manual validation rather than continuing autonomously.
- Do not prepare a separate manual checklist after the gate; the accepted manual criteria are already recorded in this plan.

---

## Sources & References

- Related requirements: `work/items/active/01KV8NZRAAETDX69P5T73BRVY8-first-party-plugin-system-shape/requirements.md`
- Related plan: `work/items/active/01KVE01T9NW7TQ0DMSY345CMND-convert-steam-to-first-party-plugin/plan.md`
- Related code: `product/plugins/fex-runtime/src/plugin.ts`
- Related code: `product/plugins/proton-runtime/src/plugin.ts`
- Related code: `product/plugins/steam/src/plugin.ts`
- Related code: `product/plugins/mega-man-arena/src/plugin.test.ts`
- Related code: `product/plugins/mega-man-arena/packages/mega-man-arena/check.nix`
- Related code: `product/plugins/mega-man-arena/packages/mega-man-arena/mega-man-arena-fex`
- Related code: `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep`
- Related docs: `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`
- Related docs: `docs/solutions/architecture-patterns/steam-appid-launch-ux-policy-2026-06-20.md`
- Related docs: `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md`
