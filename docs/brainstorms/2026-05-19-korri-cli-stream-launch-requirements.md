---
date: 2026-05-19
topic: korri-cli-stream-launch
---

# Korri CLI Stream Launch

## Summary

Build a bare-minimum Korri CLI that lets a user choose an existing Korri library game on the server and prepare it for streaming through the existing stable stream app. The first slice is local-first, interactive by default, and scriptable by game id.

---

## Problem Frame

The current game-stream launch flow is validated but still feels like a developer workflow: a user or operator has to know the launch-intent command shape, know what launch target to stage, and then separately connect through the existing stream app. That is enough for prototyping, but it is not yet a Korri-owned product surface.

For the next slice, the highest-leverage improvement is not remote control, stream tuning, or a UI. It is a small terminal command that turns “launch this known Korri game for streaming” into a clear, repeatable action.

---

## Actors

- A1. Server operator/player: Runs the Korri CLI on the Korri server and chooses what to stream.
- A2. Korri CLI: Presents available games, resolves the selected game, and prepares the stream launch.
- A3. Korri library: Provides the known games and launch definitions already configured for Korri.
- A4. Existing stream runner/app: Consumes the prepared launch and starts the selected game when the stream app is launched.

---

## Key Flows

- F1. Prepare a stream launch interactively
  - **Trigger:** The server operator runs the stream launch command without a game id.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The CLI reads the existing Korri library; presents a minimal selectable game list; the operator selects one game; the CLI resolves that game to a launchable target; the CLI prepares the stream launch for the existing stream runner/app; the CLI prints the next manual step.
  - **Outcome:** The selected game is staged for the next stream session, and the operator knows to connect through the existing stream app.
  - **Covered by:** R1, R2, R3, R4, R5, R7

- F2. Prepare a stream launch by game id
  - **Trigger:** The server operator or a script runs the stream launch command with a game id.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The CLI reads the existing Korri library; resolves the supplied id; prepares the stream launch for the existing stream runner/app; prints the result and next manual step.
  - **Outcome:** The selected game is staged without interactive selection.
  - **Covered by:** R1, R3, R4, R6, R7

---

## Requirements

**CLI surface**
- R1. The first Korri CLI must be built as a Korri-owned command-line surface using Effect CLI.
- R2. Running the stream launch command without a game id must open an interactive terminal picker rather than requiring the user to know an id up front.
- R3. The interactive list must be minimal but usable: it must show enough game identity for the user to choose the intended game.
- R4. The stream launch command must prepare the selected game for the existing streaming flow; it must not directly start or control the Moonlight client.

**Game selection and launch preparation**
- R5. The interactive picker must source games from the existing Korri library configuration.
- R6. The stream launch command must also accept an explicit game id so scripts, tests, and advanced users can bypass the picker.
- R7. After a game is selected or supplied by id, the CLI must resolve it through the same existing Korri library launch semantics used by the app rather than asking the user for a raw command.
- R8. If the selected or supplied game cannot be found or cannot be resolved to a launchable target, the CLI must fail clearly without preparing a stale or incorrect stream launch.

**User feedback**
- R9. On success, the CLI must clearly tell the user that the game has been prepared and that the next step is connecting to the existing stable stream app.
- R10. On failure, the CLI must make the failure actionable enough for a server operator to distinguish “no such game,” “library/config problem,” and “could not prepare launch.”

**Future shape without expanding v1**
- R11. The CLI shape should not preclude a future client-to-server trigger, but the first slice must run locally on the Korri server.

---

## Acceptance Examples

- AE1. **Covers R2, R3, R5, R7, R9.** Given the Korri server has a configured library with launchable games, when the operator runs the stream launch command without an id and selects a game, the CLI prepares that game for streaming and prints the next step to connect through the existing stream app.
- AE2. **Covers R6, R7, R9.** Given the operator knows a valid game id, when they run the stream launch command with that id, the CLI prepares that game without showing the picker and prints the next step.
- AE3. **Covers R8, R10.** Given the operator supplies an unknown game id, when the CLI runs, it fails without preparing a launch and explains that the game was not found.
- AE4. **Covers R4, R11.** Given a game is prepared successfully, when the CLI exits, it has not opened Moonlight or introduced a remote control protocol; those remain separate from the local prepare step.

---

## Success Criteria

- A server operator can prepare a known Korri game for streaming without remembering the launch-intent command shape or raw executable details.
- A user can pick from a terminal list for the common case and still launch by id for scripts/tests.
- The CLI feels like the first product-shaped Korri game-stream command, not just a renamed developer script.
- A downstream planner can design the implementation without inventing the product stance on remote triggering, Moonlight control, raw commands, or new library catalog formats.

---

## Scope Boundaries

- Remote client-to-server launch triggering is out of scope for this slice.
- Automatically opening, pairing, or controlling Moonlight is out of scope.
- Stream quality, latency, bitrate, resolution, and encoder tuning are out of scope.
- A new game registry or CLI-specific catalog format is out of scope.
- Raw arbitrary command launching is not the primary user flow for this CLI slice.
- Korri app UI integration is out of scope.
- Post-prepare status watching is out of scope.
- Library import, editing, repair, or management commands are out of scope.

---

## Key Decisions

- Local-first CLI: The first usable command runs on the Korri server because the validated stream runner already has a trusted local launch-preparation contract.
- Interactive default with id override: The CLI should be friendly for a human at the terminal while remaining scriptable for tests and future automation.
- Existing library as source of truth: The CLI should launch games Korri already knows about instead of creating a second catalog.
- Prepare-only v1: The CLI should stage the game for the existing stream app and stop there, keeping stream connection and client control separate for now.

---

## Dependencies / Assumptions

- The Korri server has an existing configured library with at least one launchable game.
- The existing stream runner/app remains the mechanism that consumes a prepared launch and starts the game during the stream session.
- Effect CLI is the intended command framework for the Korri CLI.
- The first slice can assume it is run in a trusted local server context.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What exact command names and argument shape best fit Effect CLI and existing Korri packaging?
- [Affects R3][Technical] What terminal picker behavior is available or appropriate for the first implementation?
- [Affects R5, R7][Technical] Which existing library source configuration path should the CLI use in packaged/server contexts?
- [Affects R8, R10][Technical] What failure categories can be distinguished cleanly from the existing library and launch-preparation errors?
