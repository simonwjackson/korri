
# Safe Game Resume Brief

---

**Source job**: `docs/jobs/safe-game-resume.md`
**BDD spec**: `korri/products/app/features/resume/e2e/safe-game-resume.feature`

---

## Purpose

Translate the Safe Game Resume JTBD into product-level behavior that can be planned, implemented, and tested without duplicating the full user research narrative.

This document is the bridge between:

- **JTBD** — why safe resume matters to players
- **BDD** — executable examples of observable behavior

---

## Traceability IDs

| ID | Outcome | Source |
|----|---------|--------|
| SGR-O1 | Progress safety | JTBD §3.1, §6 progress uncertainty |
| SGR-O2 | No re-decision | JTBD §3.2, §8 Locate |
| SGR-O3 | Low-friction resume | JTBD §3.3, current solutions |
| SGR-O4 | Explicit launch control | JTBD §3.4, §6 auto-launch |
| SGR-O5 | Retry failed handoff | JTBD §3.5, §8 Modify |

---

## In Scope

- Showing the previous game as the primary continuation target.
- Requiring explicit player activation before launching.
- Running supported pre-launch sync or safety checks before executing the launch command.
- Detecting when the last played device differs from the current device, when that data is available.
- Interrupting launch when progress safety cannot be verified and plausible progress risk exists.
- Letting the player cancel or continue anyway from a risk confirmation.
- Reporting launch command failure and keeping retry anchored to the same game/context.

---

## Out of Scope

- Choosing what to play from the broader library.
- Installing, updating, repairing, or locating missing games.
- Deep save-version management or save-source selection.
- Household profile switching.
- Emulator-specific save-state management.
- Universal proof that the game reached playable in-game state.

---

## Product Promises

### SGR-R1: Previous game is the primary resume target

When a previous game exists, the launcher must present it as the primary continuation action on entry to the resume surface.

- Traces to: SGR-O2
- BDD: `@SGR-O2` scenario “Previous game is offered as the primary continuation action”

### SGR-R2: Resume never auto-launches

The launcher must not automatically launch the previous game merely because the player opened the launcher, woke the device, or returned to the resume surface.

- Traces to: SGR-O4
- BDD: `@SGR-O4` scenario “Previous game is offered as the primary continuation action”

### SGR-R3: Supported safety checks run before launch

When the game source or configured integration supports sync or progress-safety checks, the launcher must run those checks after the player chooses Continue and before executing the launch command.

- Traces to: SGR-O1, SGR-O3
- BDD: `@SGR-O1` scenario “Supported progress check runs before launch”

### SGR-R4: Unverified progress risk requires confirmation

When the launcher has plausible progress risk and cannot verify that continuing is safe, it must interrupt before launch and require explicit confirmation.

The minimum confirmation actions are:

- cancel and return to the launcher
- continue anyway with risk acknowledged

- Traces to: SGR-O1
- BDD: `@SGR-O1` scenario “Unverified progress safety requires confirmation”

### SGR-R5: Other-device play is a primary risk trigger

When the launcher knows the game was last played on another device where this app is installed, it must not assume the current device has authoritative progress.

If automatic sync/check succeeds, launch may proceed after the player chose Continue. If sync/check fails or cannot verify safety, SGR-R4 applies.

- Traces to: SGR-O1
- BDD: `@SGR-O1` scenario “Last played on another device prompts when sync cannot verify safety”

### SGR-R6: Launch command success is the baseline handoff boundary

The baseline completion signal is whether the configured launch command succeeds or fails. The launcher must not claim the game is playable unless a future integration can verify that separately.

- Traces to: SGR-O5
- BDD: covered by future implementation scenarios once command execution exists

### SGR-R7: Failed launch can be retried without re-finding the game

When the configured launch command fails, the launcher must show a failure state with a direct retry action for the same game and launch context.

- Traces to: SGR-O5
- BDD: `@SGR-O5` scenario “Failed launch command can be retried”

---

## Open Implementation Questions

These belong in planning, not the JTBD:

- What data model records last played game, device, source, and command?
- Which source integrations can perform reliable sync or progress-safety checks?
- How should devices identify themselves across installs?
- What command result counts as success for each launcher/source type?
- When should future PID or log watching upgrade command success into richer app-state detection?
