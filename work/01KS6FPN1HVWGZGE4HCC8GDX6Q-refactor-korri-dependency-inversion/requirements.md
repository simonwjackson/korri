---
date: 2026-05-22
topic: korri-dependency-direction-inversion
---

# Korri Dependency-Direction Inversion

## Summary

Invert the korri and nix-on-rocks flake relationship so korri composes on top of the nix-on-rocks SM8550 substrate. The transition must be additive-first so Sobo remains deployable from main throughout the cutover, while nix-on-rocks sheds korri-specific kiosk outputs after korri exposes replacement targets.

---

## Problem Frame

nix-on-rocks is the upstream substrate for SM8550 guest behavior: device facts, guest OS policy, audio/input/display plumbing, curated emulator/runtime packages, and rootfs packaging helpers. Korri is the downstream product layer: electrobun client, LAN server, kiosk session, input bridge, and appliance coordination.

The current flake graph points the wrong way. nix-on-rocks imports korri to produce its main-space kiosk targets, including Sobo's production target. That couples substrate validation to korri's packaging state and leaves nix-on-rocks responsible for product composition it should not own. A recent aarch64 build failure exposed the operational cost of this coupling: nix-on-rocks was pinned to an older korri revision even after korri had fixed its platform-sensitive Bun dependency packaging.

The direction rule is now explicit: korri may depend on nix-on-rocks; nix-on-rocks must not depend on korri.

---

## Actors

- A1. Korri product maintainer: owns client, server, kiosk, product-level app selection, and deployable Korri appliance outputs.
- A2. nix-on-rocks substrate maintainer: owns SM8550 device facts, guest OS policy, package substrate, launchers, and rootfs packaging helpers.
- A3. Sobo deploy operator: needs a stable deploy target for the Odin 2 Portal appliance without broken main-branch windows.
- A4. Future planning or implementation agent: needs clear ownership boundaries and sequencing constraints before touching both repositories.
- A5. Fuji/aarch64 verifier: runs build gates proving the current target and replacement target build on aarch64.

---

## Key Flows

- F1. Current-target tactical unblock
  - **Trigger:** The existing nix-on-rocks Sobo target needs to remain buildable during the transition.
  - **Actors:** A2, A5
  - **Steps:** Update nix-on-rocks to a korri revision that includes the bun2nix packaging migration; verify the existing Sobo target no longer fails on the old platform-sensitive Bun dependency hash.
  - **Outcome:** The current deploy path is buildable while the inversion work proceeds.
  - **Covered by:** R8, R13

- F2. Additive korri-side replacement
  - **Trigger:** Korri needs to become the owner of the rocknix-backed kiosk appliance output.
  - **Actors:** A1, A2, A5
  - **Steps:** Korri consumes the nix-on-rocks substrate, composes server, client, kiosk, and product-selected apps on top, and exposes per-device and by-compatible appliance targets with matching build aliases.
  - **Outcome:** Korri can build the replacement Sobo target without removing the old nix-on-rocks target first.
  - **Covered by:** R1, R2, R5, R6, R9, R10, R14

- F3. Deploy cutover
  - **Trigger:** Korri's replacement Odin 2 Portal target has passed the aarch64 build gate.
  - **Actors:** A1, A3, A5
  - **Steps:** The deploy source changes from the nix-on-rocks main-space target to the korri per-device kiosk target; the operator verifies the new path is the canonical deploy source.
  - **Outcome:** Sobo's deploy authority moves to korri.
  - **Covered by:** R7, R9, R13

- F4. nix-on-rocks cleanup
  - **Trigger:** Korri's replacement target exists and Sobo deploy has a cutover path.
  - **Actors:** A2, A4, A5
  - **Steps:** nix-on-rocks removes the korri flake input and korri-composing outputs while retaining substrate-only smoke targets and reusable helpers.
  - **Outcome:** The dependency graph is corrected and nix-on-rocks remains independently verifiable as substrate.
  - **Covered by:** R3, R4, R11, R12, R15

---

## Requirements

**Dependency direction**
- R1. Korri must depend on nix-on-rocks for SM8550 substrate composition; nix-on-rocks must not depend on korri.
- R2. Korri must own the rocknix-backed appliance composition that runs server, electrobun client, kiosk session, and input bridge together.
- R3. nix-on-rocks must remove all product-owned korri kiosk compositions after korri exposes replacement targets.

**nix-on-rocks substrate surface**
- R4. nix-on-rocks must expose a single substrate import contract for Korri's rocknix-backed kiosk targets.
- R5. The substrate contract must include the OS-coupled SM8550 guest concerns: device facts, guest base policy, display/audio/input/session plumbing, network/ssh policy, lid/power-button handling, and current Steam runtime plumbing.
- R6. nix-on-rocks must keep SM8550 Cemu launchers, performance helpers, storage adapters, and diagnostic harnesses with the substrate Cemu package.
- R7. nix-on-rocks must retain substrate-only smoke configurations so the substrate can still be evaluated or built without Korri.
- R8. nix-on-rocks must retain device-selection knowledge as substrate-owned behavior, including per-device profile mapping and by-compatible selection support for downstream consumers.

**Korri product surface**
- R9. Korri must expose per-device rocknix-backed kiosk targets for the supported SM8550 devices and a by-compatible target for on-device selection.
- R10. Korri must expose package aliases for the corresponding system toplevels so build gates can use direct package builds while deploy flows can use NixOS configuration targets.
- R11. Korri must opt into user-launchable product apps, including Cemu and moonlight-embedded, rather than treating them as unconditional substrate base packages.
- R12. Korri's rocknix-backed kiosk target must reflect the appliance model: electrobun client, optional-but-usually-colocated LAN server, kiosk session, and launcher coordination.

**Migration sequencing and safety**
- R13. The migration must be additive-first: land a buildability-preserving korri pin update, add Korri replacement outputs, cut over deploy authority, then strip nix-on-rocks.
- R14. Main-branch Sobo deployability must not have an intentional no-go window where neither repository offers a working deploy target.
- R15. The nix-on-rocks cleanup must be treated as a required follow-on unit, not an optional future cleanup, so the temporary coexistence window closes.

**Verification**
- R16. The current nix-on-rocks Sobo target must be verified buildable on aarch64 after the tactical korri pin update.
- R17. The new Korri rocknix-backed Odin 2 Portal target must be verified buildable end-to-end on aarch64 before deploy authority moves.
- R18. The stripped nix-on-rocks tree must still build or evaluate its substrate-only guest targets on aarch64 after korri-specific outputs are removed.

---

## Acceptance Examples

- AE1. **Covers R1, R3, R15.** Given the inversion is complete, when a reviewer inspects the nix-on-rocks flake graph, nix-on-rocks has no korri input and no korri-composing kiosk outputs.
- AE2. **Covers R9, R10, R14, R17.** Given Korri has added the replacement targets, when Fuji builds the Odin 2 Portal package alias on aarch64, the build reaches a Korri-owned system toplevel without depending on nix-on-rocks importing korri.
- AE3. **Covers R7, R18.** Given nix-on-rocks has removed korri-specific outputs, when the substrate-only guest targets are built or evaluated on aarch64, they still provide a substrate smoke test without product composition.
- AE4. **Covers R13, R14.** Given the work is mid-transition, when the Sobo deploy operator needs a main-branch deploy target, either the existing nix-on-rocks target or the new Korri target is available and intentionally documented as the current authority.
- AE5. **Covers R5, R6, R11.** Given Korri composes the rocknix-backed kiosk target, when product app selection is reviewed, OS-coupled SM8550 runtime concerns remain substrate-owned while user-launchable apps are explicitly selected by Korri.

---

## Success Criteria

- The flake dependency graph reflects the product boundary: korri imports nix-on-rocks, never the reverse.
- Sobo's deploy source moves to Korri without a broken main-branch interval.
- nix-on-rocks remains useful and independently verifiable as SM8550 substrate after product outputs are removed.
- A future agent can plan the cross-repo work without debating ownership of substrate, product composition, launchers, or deploy sequencing.
- Fuji/aarch64 verification distinguishes the old korri-pin buildability issue from the architectural inversion work.

---

## Scope Boundaries

- Sobo's actual production redeploy is outside this requirements scope; the inversion only prepares the target and cutover path.
- Moving Steam from substrate-owned runtime plumbing to Korri product selection is deferred.
- Splitting or migrating SM8550 Cemu launchers between substrate and product is out of scope; they stay in nix-on-rocks for this work.
- nix-sm8550 archival is out of scope.
- Populating future SM8250 device support is out of scope.
- Reconciliation with the parallel Sobo zero-copy or Moonlight branch is out of scope.
- Headless-only rocknix variants are out of scope.
- A generalized Korri device-adapter framework is out of scope.
- Nixpkgs channel changes are out of scope.
- Broad renaming of rocknix-prefixed outputs or terminology is out of scope unless directly required for the cutover path.
- Korri app, UI, Storybook, and runtime feature behavior changes are out of scope.

---

## Key Decisions

- Single substrate module: The first external contract should be one rocknix guest substrate module, not a menu of fine-grained modules. This matches the current shape and avoids premature API surface.
- Substrate smoke tests stay in nix-on-rocks: Bare guest targets let nix-on-rocks prove substrate health without depending on Korri.
- No nix-on-rocks-owned kiosk variant: Keeping a non-product kiosk would create a second kiosk owner and recreate the boundary confusion this work is meant to remove.
- Additive-first migration: Maintaining deployability is more important than avoiding temporary coexistence. The cleanup unit closes the coexistence window.
- OS-coupled versus user-launchable package split: Substrate owns runtime plumbing; Korri owns product app selection. Steam stays substrate temporarily because its current runtime wrapper straddles OS ABI and product concerns.
- Launchers stay with nix-on-rocks: The current SM8550 Cemu launcher suite is substrate-coupled operational machinery and should not move as part of the flake inversion.
- Korri exposes both configuration and package surfaces: Deploy flows get NixOS configuration targets; build gates get package aliases.

---

## Dependencies / Assumptions

- Korri trunk's bun2nix migration resolves the aarch64 fixed-output dependency drift that affected the old nix-on-rocks korri pin.
- The existing nix-on-rocks substrate modules can be reshaped into a korri-consumable substrate contract without changing live product behavior.
- Sobo remains the primary Odin 2 Portal appliance target for this work.
- The LAN server may be colocated with the client but is not logically required to be colocated; the rocknix-backed kiosk target may still run both for the appliance use case.
- The device profile map and by-compatible selection behavior are substrate knowledge and should remain owned by nix-on-rocks.

---

## Outstanding Questions

### Resolve Before Planning

None.

### Deferred to Planning

- [Affects R4, R5][Technical] Decide whether the substrate contract is implemented by repurposing the current main-space profile, introducing a new named module, or layering a compatibility alias.
- [Affects R8, R9][Technical] Decide the exact shape of the by-compatible helper and how Korri consumes it without duplicating device-profile maps.
- [Affects R10, R17][Technical] Decide the exact package alias names used for Fuji/aarch64 build gates.
- [Affects R11][Technical] Identify the minimal Korri-side app selection set for the first rocknix-backed kiosk target.
- [Affects R13, R16][Technical] Decide whether the tactical korri pin bump is committed as a standalone preparatory change or folded into the first implementation unit.
