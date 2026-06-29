---
title: refactor: Document RK3566 guest-device access posture
type: refactor
status: completed
date: 2026-06-27
deepened: 2026-06-27
origin: work/items/active/01KW52DYT1PHC0F5M9ZK34EHZR-evaluate-rk3566-guest-device-access-module-adoption/item.md
verify_command: "nix build .#checks.x86_64-linux.korri-rocknix-guest-device-access-module .#checks.x86_64-linux.korri-rk3566-kiosk-config .#checks.x86_64-linux.korri-sm8550-kiosk-config .#checks.x86_64-linux.korri-module-identity-audit --no-link"
---

# refactor: Document RK3566 guest-device access posture

## Summary

This plan makes RK3566/RG353M's relationship to the shared RockNIX guest device-access module explicit. Rather than importing the SM8550-oriented ACL convergence path prematurely, RK3566 will remain deliberately non-adopted: the module stays unimported, while config-check coverage and adapter documentation explain why its root compositor, main-space audio, and raw-gamepad hiding posture do not currently need the shared module.

---

## Problem Frame

The shared `services.korri.rocknixGuestDeviceAccess` module was extracted from SM8550 to stop reusable RockNIX guest udev/ACL convergence from living in a chipset adapter. RK3566 is the obvious second platform, but it has a materially different posture: root-owned compositor, main-space audio, and an explicit raw-gamepad hiding service that would conflict with broad `/dev/input/event*` ACL repairs.

---

## Requirements

- R1. Review RK3566/RG353M against the shared RockNIX guest device-access module options before adopting or rejecting it.
- R2. Make the RK3566 decision explicit in durable repo artifacts: either enable the module with platform-appropriate options and checks, or document why it remains disabled.
- R3. Prevent RK3566 from silently inheriting SM8550-only ACL, TTY, backlight, sound, or DRM-seat assumptions.
- R4. Preserve existing RK3566 behavior for InputPlumber raw-node hiding, root compositor operation, and main-space audio.
- R5. Preserve existing SM8550 shared-module behavior.

---

## Scope Boundaries

- No live RK3566/RG353M deployment or hardware validation in this batch.
- No changes to `korri-rk3566-hide-raw-gamepad-devices` behavior.
- No inputd action/profile refactor.
- No RK3566 audio-bootstrap changes.
- No Gamescope, Steam, Moonlight, or runtime-profile rewrites.
- No shared module redesign unless implementation reveals the existing module cannot express an explicit disabled posture safely.

### Deferred to Follow-Up Work

- Re-evaluate RK3566 enablement if hardware validation shows a non-root Korri process needs access to host-bound DRM, TTY, sound, backlight, or non-gamepad input device nodes.
- Consider adding `korri-rk3566-kiosk-config` to the broader standard-native ownership matrix as a separate CI policy decision.
- Address warm InputPlumber restart convergence for `korri-rk3566-hide-raw-gamepad-devices` separately; this is an existing raw-node isolation risk, not introduced by this plan.

---

## Context & Research

### Relevant Code and Patterns

- `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix` owns reusable RockNIX guest retrigger/ACL mechanics and emits canonical service bodies without platform ordering.
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix` is the reference adopter: it configures SM8550-specific device-access options and owns the ordering against `greetd.service`, `systemd-udevd.service`, and substrate sound-card hydration.
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` is the reference composed-system check pattern for asserting option values and adapter-owned ordering.
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix` currently imports shared guest-profile and audio-bootstrap modules but intentionally does not import the guest-device-access module.
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` already checks RK3566 raw-gamepad hiding, InputPlumber ordering, main-space audio, and shared audio/profile posture; it lacks any assertion about `rocknixGuestDeviceAccess`.

### Institutional Learnings

- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: shared modules should keep conservative defaults, while image/platform layers declare explicit posture.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: platform intent should be declarative, not inferred from runtime probes.
- `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`: device-node convergence must account for both pre-existing and late-created nodes; this supports explicit checks around what this batch does and does not converge.
- `work/items/active/01KW4ZJ9QBTEFJRQQN1Y2M0W2V-rocknix-guest-device-access/plan.md`: the prior batch intentionally deferred RK3566 adoption as a separate platform decision.

### External References

- External research skipped. The repo already has direct local patterns for NixOS module extraction, platform adapter adoption, and composed-system checks.

---

## Key Technical Decisions

- Choose explicit RK3566 non-adoption for this batch: RK3566 currently has no safe, meaningful host-bound node set for the shared module to repair. Its compositor runs as root, audio flows through the main-space Pulse socket, and the virtual InputPlumber controller should be readable through the `input` group rather than broad ACL grants.
- Do not enable `enableInputUdevAcl` on RK3566: a broad input ACL loop would conflict with the existing raw gamepad hide service by re-granting access to physical `retrogame_joypad` event nodes after they are intentionally locked down.
- Do not add RK3566 DRM, TTY, sound, or backlight globs: those are SM8550/Sobo facts, not shared RockNIX facts.
- Assert the non-adoption posture in the RK3566 composed-system check: the module option path remains absent, the canonical services remain absent, and SM8550-only generated artifacts remain absent.
- Keep the shared module unchanged: its current conservative `enable = false` default is the correct cross-device safety boundary.

---

## Open Questions

### Resolved During Planning

- Should RK3566 enable the shared module in this batch? No. Research found no safe ACL glob that adds useful access without risking raw-gamepad isolation, so the plan records an explicit disabled posture.
- Should `korri-rocknix-device-acl-fallback` run on RK3566? No. The SM8550 fallback repairs greetd/TTY and broad device ACLs; RK3566's root compositor and raw-gamepad hiding posture make that fallback unnecessary and potentially harmful.
- Should RK3566 inherit SM8550 backlight repair? No. No RG353M backlight repair path has been verified for this module.

### Deferred to Implementation

- Exact wording of the RK3566 adapter comment: the implementation should be concise and located near the module imports or device-access-adjacent posture, but the wording is not plan-critical.
- Whether the RK3566 check should assert absence by option-path probing, service-name probing, or both: the plan requires both outcomes where practical; the implementer can choose the cleanest Nix expression without importing the module just to set `enable = false`.

---

## Implementation Units

### U1. Assert RK3566 disabled device-access posture

**Goal:** Add composed-system coverage that makes RK3566's guest-device-access decision explicit and protects against accidental SM8550 posture inheritance.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`

**Approach:**
- Add locals for the RK3566 runtime user, compositor config, runtime user account, and guest-device-access option path.
- Assert RK3566 keeps the shared module unimported by checking that `services.korri.rocknixGuestDeviceAccess` is absent or has no enabled option path, and that the canonical shared-module services are not emitted.
- Assert the root-owned compositor assumption that justifies non-adoption remains true (`services.korri.compositor.user` is `root`, with the existing no-user-creation posture).
- Assert the replacement normalized-input access path remains true: the Korri runtime user belongs to the `input` group and the InputPlumber/uinput udev rule still grants `GROUP="input", MODE="0660"` on `/dev/uinput`.
- Assert SM8550-only udev fragments do not appear in RK3566's `services.udev.extraRules`: DRM `master-of-seat` and generic `setfacl -m u:korri:rw /dev/input/%k` should remain absent.
- Cover backlight repair through absence of the canonical shared-module services; if such a service appears, the check should fail rather than trying to grep only udev rules for backlight behavior.
- Keep existing checks for raw physical gamepad hiding and inputd ordering intact.

**Execution note:** Characterization-first. Add the RK3566 posture assertion before or alongside the adapter documentation so this batch is guarded even though the current behavior may already satisfy the assertion.

**Patterns to follow:**
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix` for reading `cfg.services.korri.rocknixGuestDeviceAccess` and checking explicit option posture.
- Existing RK3566 checks in `tools/testing/nix/korri-rocknix-rk3566-config-check.nix` for composing readable assertion messages.

**Test scenarios:**
- Happy path: evaluated RK3566 config has no `rocknixGuestDeviceAccess` adoption, no canonical shared-module services, root compositor ownership, and the check passes.
- Edge case: if a future adapter import enables the module with default or SM8550-like options, the RK3566 config check fails with a message that identifies the device-access posture drift.
- Error path: if shared-module service names appear in RK3566 without an explicit plan to order them safely, the check fails.
- Error path: if the compositor is changed away from root ownership while the shared module remains unadopted, the check fails so the same change must provide a replacement DRM/TTY access path.
- Integration: existing raw-gamepad hiding checks still pass, and the runtime user still has the `input` group/uinput path that replaces broad input ACL repair.

**Verification:**
- RK3566 config evaluation exposes explicit non-adoption of the guest-device-access module.
- No SM8550-only device-access udev or service artifacts are accepted for RK3566.
- The root compositor and normalized-input group-access assumptions are executable check gates, not prose-only rationale.

---

### U2. Document the RK3566 platform decision in the adapter

**Goal:** Record in the RK3566 platform adapter why the shared module remains disabled today, so future device work does not copy SM8550's option set by habit.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1

**Files:**
- Modify: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`

**Approach:**
- Add a short platform-adapter comment near the existing shared module imports or input/device-access section.
- Explain the three load-bearing facts: the compositor is root-owned, audio uses the main-space Pulse socket, and physical `retrogame_joypad` nodes are intentionally hidden after InputPlumber claims them.
- State that enabling broad input ACL repair would risk undoing `korri-rk3566-hide-raw-gamepad-devices`, while the virtual InputPlumber controller should be covered by group membership.
- Do not import `korri-rocknix-guest-device-access.nix` and do not add `services.korri.rocknixGuestDeviceAccess` options in this batch.

**Patterns to follow:**
- Explanatory comments in `product/systems/nixos/images/platforms/rocknix-sm8550.nix` that distinguish shared module mechanics from platform-owned facts.
- Existing RK3566 comments around main-space audio and raw gamepad hiding.

**Test scenarios:**
- Test expectation: none -- this unit documents the platform decision without changing evaluated behavior. U1 carries the executable guard for the decision.

**Verification:**
- The adapter contains a clear explanation for why RK3566 does not import or enable the shared device-access module.
- No evaluated RK3566 behavior changes beyond comments.

---

## Verification Strategy

The implementation units are intentionally narrow; the broader checks are regression gates rather than separate implementation work. The implementing agent should verify:

- RK3566 composed-system posture with `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`.
- Shared module behavior with `tools/testing/nix/korri-rocknix-guest-device-access-module-check.nix`.
- SM8550 adopter behavior with `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`.
- Module identity constraints with `tools/testing/nix/korri-module-identity-audit-check.nix`.

These checks should pass together; no SM8550 or shared-module check should be modified unless the RK3566 assertion reveals a direct inconsistency in the existing contract.

---

## System-Wide Impact

- **Interaction graph:** RK3566 platform evaluation touches NixOS module composition and platform config checks only. Runtime services should not change because the selected posture is explicit non-adoption with no module import.
- **Error propagation:** Check failures should be configuration-time Nix failures, not runtime boot failures.
- **State lifecycle risks:** No new runtime state is introduced. Existing warm InputPlumber restart and raw-node hiding convergence risks remain unchanged and deferred.
- **API surface parity:** The shared module API remains unchanged; SM8550 remains the only current adopter; RK3566 is an explicitly checked non-adopter.
- **Integration coverage:** Platform config checks are the correct coverage surface because this batch is about NixOS graph posture, not TypeScript behavior.
- **Unchanged invariants:** RK3566 keeps root compositor operation, main-space audio, InputPlumber map ordering, raw physical gamepad hiding, and RetroArch shared InputPlumber autoconfig behavior.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Explicit non-adoption may feel like not using the shared module enough. | The acceptance criteria allow either adoption or documented disablement; the plan records the safer posture until a real RK3566 host-bound access need exists. |
| Future developers may re-enable broad input ACLs to be safe. | U1 adds config-check coverage and U2 documents why broad ACLs conflict with raw-node hiding. |
| Check-only decision could miss live hardware behavior where group membership is insufficient. | Live validation is explicitly deferred; this batch avoids adding risky ACL behavior without that evidence. |
| Existing raw-node hiding warm-restart risk remains. | Captured as deferred follow-up; this plan does not worsen it. |
| Local trunk has multiple unpushed refactor batches. | Implementation should start from current local `trunk`; no PR/push is implied by this plan. |

---

## Documentation / Operational Notes

- This plan intentionally uses the RK3566 adapter comment and config checks as the durable decision record. No standalone documentation file is required.
- No deployment or operator runbook change is expected because evaluated runtime behavior stays the same.
- If future RK3566 hardware validation proves host-bound device access is needed, create a new plan that enables the module with explicit RK3566 option values and checks.

---

## Sources & References

- **Origin item:** `work/items/active/01KW52DYT1PHC0F5M9ZK34EHZR-evaluate-rk3566-guest-device-access-module-adoption/item.md`
- Related plan: `work/items/active/01KW4ZJ9QBTEFJRQQN1Y2M0W2V-rocknix-guest-device-access/plan.md`
- Related code: `product/systems/nixos/modules/korri-rocknix-guest-device-access.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- Related code: `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- Related check: `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- Related check: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- Related check: `tools/testing/nix/korri-rocknix-guest-device-access-module-check.nix`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- Institutional learning: `docs/solutions/integration-issues/steam-uinput-permissions-block-virtual-xinput-2026-06-13.md`
