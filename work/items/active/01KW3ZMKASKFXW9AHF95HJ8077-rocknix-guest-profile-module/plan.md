---
title: refactor: Extract RockNIX guest profile module
type: refactor
status: completed
date: 2026-06-27
verify_command: "nix build .#checks.x86_64-linux.korri-rocknix-guest-profile-module .#checks.x86_64-linux.korri-module-identity-audit .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-rk3566-kiosk-config .#checks.x86_64-linux.korri-standard-native --no-link"
---

# refactor: Extract RockNIX guest profile module

## Summary

Extract the duplicated RockNIX guest-profile activation script and stage-10 proof marker into one opt-in Korri NixOS module. SM8550 and RK3566 platform adapters will keep declaring their platform identity, while the shared module owns the common nix-on-rocks guest generation and proof-marker mechanics.

---

## Problem Frame

SM8550 and RK3566 platform adapters both carry the same `korri-rocknix-guest-profile` activation script and nearly identical `/etc/rocknix-stage10-proof-marker` content. This is substrate integration behavior for Korri-on-RockNIX, not chipset policy; leaving it duplicated makes the next RockNIX device copy the same boot-generation mechanics again.

---

## Requirements

- R1. RockNIX guest-profile activation must have one shared implementation that preserves the existing `/nix/var/nix/profiles/per-user/root/rocknix-guest-system` behavior.
- R2. The activation script must preserve the literal activation-time `$systemConfig` handoff and `deps = [ "users" ]` ordering.
- R3. Stage-10 proof marker generation must be shared while keeping platform-specific identity strings for SM8550 and RK3566.
- R4. The shared module must be explicit opt-in so non-RockNIX Korri hosts do not inherit RockNIX guest behavior accidentally.
- R5. Module-level and composed-platform Nix checks must prove the shared module behavior and the SM8550/RK3566 platform wiring.

---

## Scope Boundaries

- Do not extract SM8550 seat/udev/ACL repair in this slice.
- Do not extract SM8550 or RK3566 audio bootstrap behavior in this slice.
- Do not change InputPlumber, RetroArch, inputd, Gamescope, Steam, or runtime-profile behavior.
- Do not deploy to Bandai/Sobo or alter RockNIX host-side update tooling.
- Do not repair unrelated check-owner gaps beyond adding ownership for the new module check.

### Deferred to Follow-Up Work

- Extract broader RockNIX guest-device ACL convergence after its failure modes are separately characterized.
- Extract audio bootstrap only after SM8550 soft-fail user audio and RK3566 hard-fail main-space audio contracts are modeled explicitly.
- Revisit existing open worktrees that touch platform adapters when they next rebase.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` and `product/systems/nixos/images/platforms/rocknix-rk3566.nix` both define `system.activationScripts.korri-rocknix-guest-profile` and `environment.etc."rocknix-stage10-proof-marker"`.
- `product/systems/nixos/modules/korri-removable-media.nix` is the closest opt-in module precedent: shared behavior lives in `product/systems/nixos/modules/`, while platform adapters explicitly enable it.
- `product/systems/nixos/flake/modules.nix` is the module registry; standalone opt-in modules should not be added to the aggregate `korri` module unless every Korri host should receive them.
- `tools/testing/nix/korri-removable-media-check.nix` provides the preferred `evalConfig`-based module-check pattern.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` and `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` are the composed-system gates that should prove each RockNIX product still emits the activation script and marker.
- `tools/testing/nix/korri-module-identity-audit-check.nix` scans new `product/systems/nixos/modules/korri-*.nix` files, so the new module must avoid forbidden machine-specific literals.

### Institutional Learnings

- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: shared modules should be conservative; platform/image layers explicitly assert appliance posture.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`: the guest profile pointer is the mechanism that keeps RockNIX reboots on the generation selected by the latest guest switch; do not replace `$systemConfig` with `config.system.build.toplevel`.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`: define one canonical option seam, derive behavior from it, and fail closed when required fields are missing.
- `docs/solutions/architecture-patterns/kiosk-renderer-ownership-by-sessiond-2026-05-27.md`: composed-system checks should assert kiosk/guest invariants at evaluation time before device boot.
- `docs/solutions/runtime-errors/retroarch-bare-passthru-wrapper-injects-l-coredir-2026-05-27.md`: checks should prefer stable evaluated attributes over source-text grep when the behavior is visible in the NixOS config graph.

### External References

- External research not used. Local NixOS module patterns and documented RockNIX deployment learnings are sufficient for this bounded refactor.

---

## Key Technical Decisions

- Use `services.korri.rocknixGuestProfile.proofMarkerLabel` as the canonical option seam: The name is specific to the behavior being extracted and avoids implying ownership of all RockNIX guest concerns.
- Keep the module disabled by default: Importing the module should declare options only; SM8550/RK3566 platform adapters opt in because they know they are nix-on-rocks RockNIX guests.
- Register the module as a bare standalone import in `flake/modules.nix`: The module does not depend on `services.korri.runtime`, so it should not bundle `korri-runtime` or join the aggregate `korri` module.
- Keep only the proof-marker label configurable: The activation script path and profile name are shared substrate contracts, not per-platform policy knobs.
- Reject blank proof-marker labels with an explicit module assertion: A missing or empty first line makes the marker malformed; checks should inspect failed assertions for the blank-label case rather than relying only on `tryEval`.
- Use evaluated-config assertions, not source greps: Both the activation script and proof marker are visible through NixOS config attributes, so checks should anchor on those stable outputs.
- Preserve relative-path platform imports: Use the same nearby-module import style already used by SM8550 for opt-in image/platform modules.

---

## Open Questions

### Resolved During Planning

- Should this be part of the aggregate `korri` module? No. It is RockNIX-specific behavior and should be imported only by RockNIX platform adapters.
- Should the option be named broadly as `rocknixGuest`? No. This slice only owns guest-profile activation and proof-marker generation; broader RockNIX guest behavior remains out of scope.
- Should the activation script reference `config.system.build.toplevel`? No. That would reintroduce the recursion risk documented in prior RockNIX deployment learnings; preserve the activation-time `$systemConfig` variable.
- Should source-file checks be used to prove the extraction? No. The evaluated NixOS config exposes the relevant activation script and `environment.etc` marker.

### Deferred to Implementation

- Exact option-description prose: Match nearby module documentation style while keeping the single-line proof-marker requirement explicit.

---

## Implementation Units

### U1. Add the shared RockNIX guest-profile module

**Goal:** Introduce an opt-in NixOS module that owns the shared guest-profile activation script and stage-10 proof-marker rendering.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** None

**Files:**
- Create: `product/systems/nixos/modules/korri-rocknix-guest-profile.nix`
- Create: `tools/testing/nix/korri-rocknix-guest-profile-module-check.nix`
- Modify: `product/systems/nixos/flake/modules.nix`
- Modify: `product/systems/nixos/flake/checks.nix`

**Approach:**
- Define `services.korri.rocknixGuestProfile.enable` and `services.korri.rocknixGuestProfile.proofMarkerLabel` in the new module.
- Gate all emitted behavior behind `enable`.
- Preserve the existing activation script semantics: create the root profile directory, update the `rocknix-guest-system` profile with the literal `$systemConfig`, and keep `deps = [ "users" ]`.
- Render `/etc/rocknix-stage10-proof-marker` from the required label and `config.networking.hostName`.
- Register the module in `flake/modules.nix` as a standalone import, not in the `korri` aggregate.
- Add a module check to `flake/checks.nix` and add the new check to the standard-native owner matrix as `owner = "module"`.

**Execution note:** Start with the isolated module check so the enabled, disabled, and invalid-label contracts are explicit before platform adapters are changed.

**Patterns to follow:**
- `product/systems/nixos/modules/korri-removable-media.nix` for opt-in module shape and dedupe key style.
- `tools/testing/nix/korri-removable-media-check.nix` for `evalConfig` fixture structure.
- `product/systems/nixos/flake/modules.nix` standalone module entries such as `korri-removable-media` for opt-in platform modules.

**Test scenarios:**
- Happy path: enabling the module with `proofMarkerLabel = "korri-test-system"` on a fixture host named `korri-test` emits `system.activationScripts.korri-rocknix-guest-profile` and `/etc/rocknix-stage10-proof-marker`.
- Happy path: the emitted activation script contains `rocknix-guest-system`, `nix-env`, and the literal `$systemConfig`, and declares `deps = [ "users" ]`.
- Happy path: the emitted proof marker starts with `korri-test-system` and contains `target=korri-test`.
- Edge case: with the module imported but `enable = false`, no guest-profile activation script and no stage-proof marker are emitted.
- Error path: `enable = true` without a proof-marker label fails evaluation when the module output is consumed.
- Error path: `enable = true` with an empty proof-marker label records a failed module assertion rather than emitting an acceptable blank first line; the check should inspect `cfg.assertions` (or force a toplevel build) so assertion-backed failures are not missed.
- Integration: `korri-standard-native` includes the new module check with a classified owner.

**Verification:**
- The new module check passes in isolation.
- The module identity audit continues to pass with the new module file present.
- Importing the module alone does not affect non-enabled fixture hosts.

---

### U2. Convert SM8550 and RK3566 platform adapters to opt in

**Goal:** Remove the duplicated platform-local activation script and proof marker from both RockNIX adapters, replacing them with explicit shared-module enablement and platform labels.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Test: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Test: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Import the shared module from each RockNIX platform adapter.
- Add `services.korri.rocknixGuestProfile.enable = true` and the platform-specific `proofMarkerLabel`.
- Preserve existing marker labels exactly: `korri-sm8550-kiosk-system` for SM8550 and `korri-rk3566-kiosk-system` for RK3566.
- Delete the two duplicated blocks from each adapter only after the shared option is wired.
- Leave nearby RockNIX platform logic untouched, including input, audio, device ACL, compositor, and package wiring.

**Patterns to follow:**
- SM8550's existing relative import of `../../modules/korri-removable-media.nix` for platform-opt-in modules.
- The prior InputPlumber platform-policy refactor's bounded adapter cleanup style: delete duplicated policy only when the shared seam already proves equivalent output.

**Test scenarios:**
- Integration: SM8550 composed config still emits the `korri-rocknix-guest-profile` activation script via the shared module after platform-local script deletion.
- Integration: RK3566 composed config still emits the `korri-rocknix-guest-profile` activation script via the shared module after platform-local script deletion.
- Integration: SM8550 composed config still renders `korri-sm8550-kiosk-system` and the evaluated hostname in the proof marker.
- Integration: RK3566 composed config still renders `korri-rk3566-kiosk-system` and the evaluated hostname in the proof marker.
- Regression: no unrelated platform invariants in the existing SM8550/RK3566 checks change as part of this refactor.

**Verification:**
- The platform adapter diff is limited to importing/enabling the shared module and removing the duplicate activation/marker blocks.
- Both RockNIX composed-system config checks pass after the adapter conversion.

---

### U3. Strengthen composed-platform checks for the shared output

**Goal:** Add explicit composed-system assertions so future changes cannot drop the guest-profile activation script or stage proof marker from SM8550/RK3566 unnoticed.

**Requirements:** R2, R3, R5

**Dependencies:** U1, U2

**Files:**
- Modify: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Modify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- In the SM8550 check's existing per-system helper, assert the activation script exists, references the RockNIX guest profile, preserves `$systemConfig`, and depends on `users`.
- In the RK3566 check, add an `activationScripts` binding mirroring the SM8550 check before adding equivalent assertions.
- Assert `services.korri.rocknixGuestProfile.enable = true` and the expected per-platform `proofMarkerLabel` so the composed checks prove the shared module is wired, not merely that equivalent output exists somewhere.
- Assert proof-marker text through `cfg.environment.etc."rocknix-stage10-proof-marker".text` and `cfg.networking.hostName`, not by grepping platform source files.
- Keep the assertions platform-specific only for the expected marker label; all other activation-script expectations should match across platforms.

**Execution note:** Add these assertions in the same slice as the adapter conversion so the checks cover both the shared-module option state and the rendered outputs after extraction.

**Patterns to follow:**
- Existing `check "message" assertion` lists in both platform config checks.
- Existing `activationScripts = cfg.system.activationScripts or { };` pattern in `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`.

**Test scenarios:**
- Happy path: SM8550 check passes when `services.korri.rocknixGuestProfile.enable` is true, the option label is `korri-sm8550-kiosk-system`, the rendered marker has that label, and the marker includes the system hostname.
- Happy path: RK3566 check passes when `services.korri.rocknixGuestProfile.enable` is true, the option label is `korri-rk3566-kiosk-system`, the rendered marker has that label, and the marker includes the system hostname.
- Regression: either platform check fails if the activation script loses `rocknix-guest-system`, `nix-env`, literal `$systemConfig`, or `deps = [ "users" ]`.
- Regression: either platform check fails if the shared-module option is disabled, the configured label is wrong, the proof marker is missing, or the rendered marker has the wrong first-line platform identity.

**Verification:**
- SM8550 and RK3566 composed-system checks prove the shared module option is enabled with the expected label and that the rendered activation/marker outputs remain correct.

---

## System-Wide Impact

- **Interaction graph:** Platform adapters import a new shared module; the module emits NixOS activation and `/etc` config when explicitly enabled. No runtime service graph, daemon API, launch pipeline, or UI surface changes.
- **Error propagation:** Missing or blank proof-marker labels should fail during Nix evaluation/checks. Broken composed wiring should fail platform config checks before deployment.
- **State lifecycle risks:** The activation script controls the RockNIX reboot generation pointer; preserving `$systemConfig` and the `rocknix-guest-system` profile path is load-bearing for post-switch reboot behavior.
- **API surface parity:** New NixOS options are platform/internal module API only. No TypeScript, RPC, CLI, catalog, or plugin API surfaces change.
- **Integration coverage:** Isolated module checks prove local behavior; composed SM8550/RK3566 config checks prove the actual products opt in correctly.
- **Unchanged invariants:** Existing platform marker labels, activation script body semantics, input/audio/compositor behavior, and device deployment flow remain unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `$systemConfig` is accidentally replaced with a Nix toplevel reference | Preserve the shell variable literally and assert it in the module/composed checks. |
| A platform enables the module without a valid proof-marker label | Make the label required and reject blank labels; cover both cases in the module check. |
| The module leaks RockNIX behavior into non-RockNIX hosts | Keep it disabled by default and register it as standalone rather than in the aggregate `korri` module. |
| Composed products pass module checks but forget to opt in | Add explicit SM8550/RK3566 config-check assertions for the activation script and marker. |
| Open worktrees touching platform adapters hit conflicts later | Keep the diff small and limited to the duplicated blocks; note the rebase cost in implementation handoff/summary. |

---

## Documentation / Operational Notes

- No user-facing documentation is required for this refactor.
- Implementation summaries should call out that no deploy occurred and no live RockNIX device state changed.
- If the implementation discovers undocumented RockNIX guest-profile behavior beyond the duplicated blocks, capture it as follow-up rather than expanding this slice.

---

## Sources & References

- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Related code: `product/systems/nixos/modules/korri-removable-media.nix`
- Related check: `tools/testing/nix/korri-removable-media-check.nix`
- Related check: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Related check: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
