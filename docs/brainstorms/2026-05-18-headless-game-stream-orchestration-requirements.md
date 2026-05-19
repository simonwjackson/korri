---
date: 2026-05-18
topic: headless-game-stream-orchestration
---

# Headless Game Stream Orchestration

## Summary

Define a minimal script-triggered proof for remote play orchestration: launch one simple Nix-runnable game on a headless/Sway gaming server, start a stream connection for that game, keep the game fullscreen, and stop the active stream/session when the game exits.

---

## Problem Frame

Today, starting a remote gaming session is a manual chain: choose Moonlight settings, connect to the remote machine, open the game or launcher, handle any setup, launch the game, and make sure it fills the remote display. That flow feels like operating a desktop remotely rather than launching a game appliance.

The first proof should avoid the hardest adjacent concerns. Steam games are deliberately excluded because Steam gamepad/fullscreen UI behavior adds separate constraints. Stream optimization is also excluded; the only requirement is that a client can connect and see the launched game.

---

## Actors

- A1. Remote player: Starts the session from an Odin Portal 2, Thor device, or similar client.
- A2. Client trigger: A script or equivalent lightweight launcher that asks the gaming server to start the session.
- A3. Headless gaming server: Owns Sway, game launch, streaming lifecycle, fullscreen behavior, and cleanup.
- A4. Streaming client/session: The Moonlight/Sunshine connection path that carries the remote game session.

---

## Key Flows

- F1. Start a one-game remote play session
  - **Trigger:** The remote player runs the client trigger.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The trigger contacts the headless gaming server; the server prepares a streamable session; the server launches the configured demo game; the game becomes the fullscreen focus of the stream; the client connects and sees the game rather than a general desktop workflow.
  - **Outcome:** The remote player can play the configured game through the stream.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. End a one-game remote play session
  - **Trigger:** The launched game exits normally or is stopped through the session control path.
  - **Actors:** A1, A3, A4
  - **Steps:** The server observes that the game session is over; it stops the active stream/session associated with that game; it cleans up the game/session state enough for another run.
  - **Outcome:** The active stream/session is no longer left running for a finished game, and the server is ready for another validation attempt.
  - **Covered by:** R6, R7, R8

---

## Requirements

**Validation shape**
- R1. The first version must support exactly one configured game.
- R2. The configured game should be simple, non-Steam, available from Nix packages, and easy to run as a validation target.
- R3. The validation surface may be a script or lightweight client-side trigger outside the Korri app.
- R4. The target server for validation is the user's fresh `aka` gaming host, while the reusable orchestration capability belongs in Korri rather than being tied only to that host.

**Session orchestration**
- R5. Starting the flow must launch the configured game and make a remote stream connection possible without requiring the user to manually operate the remote desktop.
- R6. The launched game must be fullscreen or otherwise fill the stream target so the player sees the game as the session surface.
- R7. When the launched game exits, the active stream/session for that run must stop.
- R8. After a game exits, the server must clean up enough state that the same validation flow can be run again.

**Constraints**
- R9. The first version must not launch Steam games.
- R10. The first version must not invoke Steam gamepad/fullscreen UI.
- R11. The first version must not include stream quality, latency, bitrate, resolution, or adaptive profile optimization.
- R12. Gamescope may be used if it helps make fullscreen or session behavior reliable, but using it is not itself the product requirement.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R5, R6.** Given the headless gaming server is reachable and the configured demo game is available, when the remote player runs the client trigger, the streamable session starts, the configured game launches, and the game fills the stream target.
- AE2. **Covers R7, R8.** Given the configured game is running through the stream, when the game exits, the active stream/session for that run stops and the server can accept another run of the same validation flow.
- AE3. **Covers R9, R10.** Given the validation flow is run, when the game session starts, no Steam game or Steam gamepad/fullscreen UI is launched as part of the flow.
- AE4. **Covers R11.** Given the stream connection works at any acceptable default settings, when the first version is evaluated, missing quality/latency optimization does not count as failure.

---

## Success Criteria

- A remote player can start the one-game validation flow from a client device and reach playable streamed game output without manually opening a remote desktop and launching the game by hand.
- The launched game reliably fills the stream target.
- Exiting the game stops the active stream/session for that run.
- A downstream planner can design the implementation without inventing product scope around Steam support, Korri UI integration, multi-game library behavior, or stream optimization.

---

## Scope Boundaries

- Multiple games are out of scope.
- Korri app UI integration is out of scope.
- Whole-library remote launch is out of scope.
- Steam game launching is out of scope.
- Steam gamepad/fullscreen UI integration is out of scope.
- Per-game first-run configuration automation is out of scope.
- Stream quality/latency optimization is out of scope.
- Adaptive bitrate, resolution, FPS, or encoder policy is out of scope.
- A general remote desktop workflow is out of scope.

---

## Key Decisions

- Script-first validation: A script or lightweight trigger is enough for v1 because the immediate risk is orchestration, not Korri app UX.
- One simple non-Steam game: A small Nix-runnable game keeps the proof focused on launch, fullscreen, stream connection, and cleanup.
- No stream optimization: The first proof only needs to connect; quality and latency policy can wait until the basic session lifecycle is reliable.
- Gamescope allowed as a helper: Fullscreen reliability matters more than proving the flow without Gamescope.

---

## Dependencies / Assumptions

- The validation server can run a Sway-based session suitable for streaming.
- Sunshine/Moonlight or equivalent existing streaming setup is available enough to establish a connection.
- The chosen validation game can exit in a way the server can observe.
- The reusable orchestration pieces created in Korri can be consumed by the external game-server configuration.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] Which Nix-runnable demo game is the best validation target?
- [Affects R5, R7][Technical] Should the stream lifecycle stop only the active session or stop the Sunshine service itself for v1?
- [Affects R6, R12][Technical] Is Sway alone sufficient for reliable fullscreen behavior, or should Gamescope be part of the validation flow?
