---
date: 2026-05-24
topic: live-usb-persistence-modes
---

# Live USB Persistence Modes

## Summary

Define a two-artifact persistence model for the Korri live USB: the Product ISO uses selective allowlisted persistence, while the Developer ISO uses broader writable state for investigation. Both artifacts preserve reboot-to-reboot state only on the USB persistence area and keep the system image effectively locked until upgrade.

---

## Problem Frame

The live USB kiosk needs to be reusable across boots rather than behaving like a disposable demo image. Korri settings, Moonlight client state, network setup, device setup, machine identity, and useful diagnostics may need to survive reboots so the appliance remains comfortable to use after initial setup.

At the same time, the delivered product should not drift like a mutable full OS install. Random system changes, cache growth, and accidental writes should not become part of the product state. Developers need a broader persistence shape for investigation, but that convenience should not weaken the safety posture of the delivered kiosk.

---

## Actors

- A1. Player/operator: Uses the delivered live USB appliance and expects setup-relevant state to survive reboot.
- A2. Developer/operator: Boots the Developer ISO to investigate behavior with broader writable state.
- A3. Korri live USB kiosk: The booted appliance that runs either the Product ISO persistence contract or the Developer ISO persistence contract.
- A4. USB persistence area: The intended writable state location associated with the live USB media.

---

## Key Flows

- F1. Product boot with selective persistence
  - **Trigger:** The player/operator boots the live USB through the default product path.
  - **Actors:** A1, A3, A4
  - **Steps:** The kiosk resolves the approved USB persistence area, exposes only the product allowlist as persistent state, starts the Korri kiosk surface, and keeps non-allowlisted system/user state ephemeral.
  - **Outcome:** Product-relevant state survives reboot without turning the appliance into a mutable full install.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7

- F2. Developer boot with broad persistence
  - **Trigger:** The developer/operator boots the separate Developer ISO artifact.
  - **Actors:** A2, A3, A4
  - **Steps:** The Developer ISO uses the same approved USB persistence area, broadens what state persists for investigation, and surfaces that the boot is not the delivered Product ISO.
  - **Outcome:** Developers can inspect and retain broader state across reboots without writing to the host internal disk.
  - **Covered by:** R1, R2, R8, R9, R10, R11

- F3. Persistence unavailable or unsafe
  - **Trigger:** The kiosk cannot resolve a usable approved USB persistence area during either boot mode.
  - **Actors:** A1, A2, A3
  - **Steps:** The kiosk refuses to silently persist elsewhere, falls back to clearly labeled non-persistent behavior or fails visibly, and records enough diagnostic signal for the operator to understand the persistence problem.
  - **Outcome:** The no-internal-disk safety rule holds even when persistence is missing, malformed, or unavailable.
  - **Covered by:** R2, R10, R12, R13

---

## Requirements

**Shared safety posture**
- R1. The live USB must support two persistence artifacts: the default Product ISO and the explicit Developer ISO.
- R2. Both modes must persist state only to the approved USB persistence area and must not write to or depend on the host internal disk.
- R3. The system image, root filesystem behavior, and delivered OS shape must remain effectively locked between upgrades rather than accumulating ordinary OS drift.
- R4. The default boot path must be product mode.

**Product-mode allowlist**
- R5. Product mode must persist only explicitly selected files or directories.
- R6. Product mode must persist Korri client settings/preferences and Moonlight client state required for reboot-to-reboot stream usability.
- R7. Product mode must persist setup state that affects appliance continuity: network setup, input/device setup, stable machine identity, and useful logs/diagnostics.

**Developer ISO**
- R8. Developer persistence must be delivered as a separate Developer ISO artifact rather than as a selectable mode in the Product ISO.
- R9. The Developer ISO may persist broad writable state for investigation, including broader kiosk user state, without changing the delivered Product ISO allowlist.
- R10. The Developer ISO must be visibly distinguishable from the Product ISO so it is not mistaken for the delivered appliance posture.
- R11. The Developer ISO must be difficult to enter accidentally from the normal player/operator path.

**Failure behavior**
- R12. If the approved USB persistence area is missing or unusable, the kiosk must not silently substitute host-internal storage or an unrelated writable device.
- R13. Missing or unusable persistence must produce a clear non-persistent/failure signal rather than appearing to persist successfully.

---

## Acceptance Examples

- AE1. **Covers R1, R4, R5, R6, R7.** Given the USB persistence area is present, when the kiosk boots through the default product path and reboots, Korri/Moonlight/setup allowlisted state survives and non-allowlisted broad system state does not become product state.
- AE2. **Covers R8, R9, R10, R11.** Given a developer boots the separate Developer ISO artifact, when the kiosk boots and reboots, broader developer state survives and the session is visibly marked as the Developer ISO.
- AE3. **Covers R2, R12, R13.** Given the USB persistence area is absent, malformed, or unsafe, when the kiosk boots, it does not write to the internal disk and clearly reports or marks non-persistent behavior.
- AE4. **Covers R3, R5.** Given a product-mode boot has accumulated temporary files or incidental runtime changes outside the allowlist, when the kiosk reboots, those changes do not alter the delivered system shape.

---

## Success Criteria

- A product USB can be rebooted repeatedly while retaining only the state needed for a comfortable appliance experience.
- Developers have an explicit broad-persistence path for investigation without changing the delivered Product ISO.
- The no-internal-disk safety rule remains true in the Product ISO, the Developer ISO, and persistence failure cases.
- Downstream planning can proceed without inventing the distinction between product persistence, developer persistence, artifact naming, or failure posture.

---

## Scope Boundaries

- Persisting the whole OS/root filesystem in delivered product mode is out of scope.
- Treating the USB as a mutable full NixOS install is out of scope.
- Writing to or depending on the host internal disk is out of scope.
- Building an end-user UI for switching persistence modes is out of scope.
- Allowing the product mode to persist broad user state by default is out of scope.
- Exact Nix module structure, bind-mount mechanics, partition creation tooling, and whether the NixOS Impermanence module is used directly are deferred to planning.

---

## Key Decisions

- Two artifacts over one compromise artifact: The Product ISO stays strict and predictable, while the Developer ISO gives developers the broad writable state they need.
- Product persistence is allowlisted: Reboot persistence is a contract, not an accidental side effect of writable storage.
- Developer persistence is a separate artifact: The delivered Product ISO stays strict and cannot accidentally enter broad persistence, while developers use a distinct Developer ISO for investigation.
- USB-only safety applies to both modes: Developer convenience must not weaken the core appliance guarantee.
- Impermanence-style model: The desired mental model is a locked system with selected persisted state, regardless of whether planning chooses the NixOS Impermanence module directly or a project-specific mechanism.

---

## Dependencies / Assumptions

- The live USB can identify and mount an approved USB persistence area before the kiosk relies on persistent state.
- Korri and Moonlight have identifiable client-state locations that can be included in the product allowlist.
- Network, input/device, machine identity, and diagnostics state can be scoped tightly enough for product-mode persistence without turning into broad OS persistence.
- The image build can expose distinct Product ISO and Developer ISO artifacts with clear names and validation surfaces.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5, R6, R7][Technical] What exact files and directories belong in the product-mode allowlist for Korri, Moonlight, network setup, input/device setup, machine identity, and logs/diagnostics?
- [Affects R5, R9][Technical] Should planning use the NixOS Impermanence module directly, a project-specific persistence mechanism, or a hybrid where Impermanence-style declarations sit above the existing USB safety resolver?
- [Affects R8, R10, R11][Technical] What is the safest concrete artifact/output contract for exposing a separate Developer ISO and visibly labeling it?
- [Affects R12, R13][Technical] Should missing persistence fall back to clearly marked ephemeral operation, block the kiosk, or vary by Product ISO vs. Developer ISO?
