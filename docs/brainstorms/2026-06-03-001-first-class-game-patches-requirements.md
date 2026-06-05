---
date: 2026-06-03
topic: first-class-game-patches
---

# First-Class Game Patches

## Summary

Korri will support first-class, config-declared game patches as launch-time resources. Games and presets can declare ordered patch files, Korri will compose them through the existing launch cascade, stage a temporary patched launch artifact, and preserve stable save/state identity for the base game/content shared across presets.

---

## Problem Frame

Korri can already launch emulators with arbitrary arguments, and RetroArch can softpatch content, but patching currently leaks emulator-specific conventions into library entries. A config author has to know whether a launcher wants an explicit patch flag, indexed sidecar filenames, or a staged content path. That makes common use cases fragile: a ROM hack that should be treated as a variant of a game is mixed into launcher argv, while a hack that behaves like a new game has no clear path toward becoming library identity later.

The immediate pain came from GBA and ROM-hack workflows: some patches create a meaningfully new game, while others are small profile-like variants such as color restoration or voice removal. The first slice should make patch intent visible to Korri’s launch resolution without expanding into full catalog management or UI identity modeling yet.

---

## Actors

- A1. Config author: Declares games, presets, and patch files in the library configuration.
- A2. Player: Selects a game or preset and expects the patched variant to launch without understanding emulator patch mechanics.
- A3. Korri launch pipeline: Resolves game/preset launch policy, stages artifacts, launches the emulator, and cleans up after exit.
- A4. Emulator/app integration: Consumes a launch artifact and patch instructions in the form it supports.

---

## Key Flows

- F1. Launch a game with game-level patches
  - **Trigger:** A player launches a game whose config declares one or more patches directly on the game.
  - **Actors:** A2, A3, A4
  - **Steps:** Korri resolves the game, orders the declared patches, stages a launch artifact that the emulator can consume, passes stable save/state identity, and starts the emulator.
  - **Outcome:** The patched content runs without modifying the source ROM or requiring the player to know the patch convention.
  - **Covered by:** R1, R2, R5, R6, R7

- F2. Launch a preset patch variant
  - **Trigger:** A player launches a game with a selected preset that contributes additional patches.
  - **Actors:** A1, A2, A3
  - **Steps:** Korri resolves the base game and selected preset, appends patch contributions in cascade order, stages the ordered patch chain, and launches with save/state identity tied to the base game/content rather than the selected preset.
  - **Outcome:** Profile-like variants such as color changes launch as variants of the same game rather than forcing duplicate game entries.
  - **Covered by:** R1, R3, R4, R7

- F3. End a staged patched launch
  - **Trigger:** The emulator/app process exits after a staged patched launch.
  - **Actors:** A3
  - **Steps:** Korri observes the launch lifecycle, tears down temporary staged artifacts, and leaves durable saves/states in their stable location.
  - **Outcome:** Temporary patch staging does not leave confusing library artifacts behind, while player progress remains durable.
  - **Covered by:** R6, R7, R8

---

## Requirements

**Patch declarations**
- R1. Games and presets must be able to declare ordered patch files as first-class launch resources.
- R2. Patch entries must accept generic file paths and infer the patch format from the file extension.
- R3. Presets must be the v1 mechanism for profile-like patch variants; v1 must not introduce a separate profile concept.
- R4. Patch declarations must compose through the existing inheritance model: less-specific patch contributions apply before more-specific patch contributions, and `inherit: false` can stop inherited patch contributions.

**Launch behavior**
- R5. Korri must stage ordered patch launches so config authors do not need to encode emulator-specific multi-patch naming conventions.
- R6. Staging must be launch-scoped and cleaned up after the launched app exits.
- R7. Staged patched launches must preserve stable save/state identity for the base game/content, shared across presets for that game, rather than deriving progress from a temporary path.
- R8. Patch application must be softpatch-style: source ROM/content files are not modified by Korri.

**Diagnostics and compatibility**
- R9. Patch resolution failures must be visible as launch diagnostics rather than silent fallback to unpatched content.
- R10. Unsupported patch file extensions must fail clearly before launch.
- R11. v1 must prove the model with RetroArch-compatible softpatch formats while keeping the config model generic enough for other emulator integrations.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R5, R8.** Given a game with two declared patch file paths, when the player launches the game, Korri launches staged patched content with both patches applied in order and the original ROM remains unchanged.
- AE2. **Covers R3, R4, R7.** Given a game with a base patch and a selected preset with a color-restoration patch, when the preset is launched, Korri applies the game patch first, the preset patch second, and saves/states under the same stable base-game/content identity used by other presets for that game.
- AE3. **Covers R4.** Given a selected preset marked as not inheriting earlier contributions, when the preset is launched, Korri uses that preset’s patch set without applying less-specific patch declarations.
- AE4. **Covers R6, R7.** Given a staged patched launch has exited, when cleanup runs, temporary staged files are removed while save/state files remain available for the next launch of the same base game/content.
- AE5. **Covers R9, R10.** Given a patch path is missing or has an unsupported extension, when the player attempts to launch, Korri reports a launch diagnostic and does not silently start the unpatched game.

---

## Success Criteria

- Config authors can express common ROM-hack and restoration-patch launches without writing emulator-specific sidecar/indexing conventions into library entries.
- Players can launch patched variants from game/preset config while keeping source ROMs untouched and progress stable across launches.
- Downstream planning can implement the feature without inventing patch ordering, inheritance, staging, save/state identity, or v1 scope boundaries.

---

## Scope Boundaries

- No top-level reusable patch catalog in v1.
- No UI for browsing patch catalogs, creating patch sets, or converting patch sets into separate game entries.
- No automatic patch download, discovery, validation against remote sources, or patch metadata scraping.
- No hardpatching or modification of source ROM/content files.
- No requirement to model “patch creates a new game” identity in v1, though the design should not block that later.
- No broad emulator-specific patch authoring surface beyond what the generic ordered patch-list model can express.

---

## Key Decisions

- Use presets for profile-like patch variants: This extends the existing launch-variant mechanism instead of adding parallel profile terminology.
- Append patches in cascade order: This supports base hack plus selected variant workflows while matching the existing inherited-policy mental model.
- Support `inherit: false`: Config authors need an escape hatch for incompatible patch chains.
- Infer patch format from extension: Config stays compact and generic while integrations decide how to consume supported patch types.
- Stage launch artifacts: Korri hides RetroArch-style indexed filename conventions and keeps the source ROM path clean.
- Preserve stable save/state identity: Temporary staging must not accidentally move progress into throwaway paths; v1 intentionally shares saves and savestates across presets for the same base game/content.

---

## Dependencies / Assumptions

- Emulator integrations can either consume ordered patch declarations directly or receive a staged launch artifact produced by Korri.
- RetroArch-compatible softpatch formats are sufficient as the first proving case.
- The existing launch lifecycle is available to clean up staged artifacts after the launched app exits.
- Save/state identity can be made explicit enough that temporary staging does not control durable progress paths.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R10][Technical] Define the exact supported extension set for v1 and how mixed-format chains should behave.
- [Affects R5, R6][Technical] Decide the staging lifecycle details, including when staged artifacts are created, where they live, and how cleanup handles crashes or forced termination.
- [Affects R7][Technical] Define the stable save/state identity rule for game-only launches versus selected preset/profile launches. Resolved during planning/challenge: v1 shares save/state identity per base game/content rather than per selected preset.
- [Affects R9][Technical] Decide where launch diagnostics appear for local launch, stream preparation, and UI-triggered launch flows.
