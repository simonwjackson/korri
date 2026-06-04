---
date: 2026-05-20
topic: korri-headless-source-aware-server
---

# Korri Headless Source-Aware Server

## Summary

Define the first product slice of a headless Korri server as a source-aware CLI/debug experience: show local and remote games in one surface, launch local games locally, stream remote games from a headless host, and report basic remote status. The host-facing control/data surface must be RPC-oriented, not a new REST resource model.

---

## Problem Frame

Korri's current headless streaming setup can stage a game for the stable `Korri Stream` Sunshine app, but the experience still feels operator-centered. The user either needs to know host-specific details, run preparation in the right place, or reason about the stream host separately from the game they want to play.

The desired direction is a remote play appliance: a client should be able to ask “what can I play here or nearby?” and then choose the appropriate action without SSHing into the host or treating Sunshine as the primary game browser. Thin clients should eventually feel like Korri surfaces backed by a headless host, but the first proof should stay CLI/debug-first and avoid a full app/client-server rewrite.

---

## Actors

- A1. Player/operator: Uses a CLI/debug client to choose what to play without SSHing into the remote host.
- A2. Source-aware Korri client: Aggregates local and remote game sources, presents source-specific entries, and invokes the right launch action.
- A3. Local Korri source: Provides games that can be launched on the client machine.
- A4. Headless Korri host: Provides remote catalog, basic status, and streamable launch actions over Korri RPC.
- A5. Stream runtime: Existing Sunshine/Moonlight and Korri stream runner path that turns a prepared remote game into a playable stream.

---

## Key Flows

- F1. Browse local and remote games
  - **Trigger:** The player runs the CLI/debug client.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The client reads local game availability; discovers or is pointed at one or more headless hosts; asks remote hosts for available games and basic status; presents local and remote entries as source-specific playable choices.
  - **Outcome:** The player sees what can be played locally and what can be streamed remotely without switching tools or SSHing into the host.
  - **Covered by:** R1, R2, R3, R4, R5, R8

- F2. Launch a local game
  - **Trigger:** The player chooses a local game entry.
  - **Actors:** A1, A2, A3
  - **Steps:** The client identifies the choice as local; uses the local Korri launch path; reports launch success or failure in the CLI/debug surface.
  - **Outcome:** The selected game starts on the client machine.
  - **Covered by:** R6, R10

- F3. Stream a remote game
  - **Trigger:** The player chooses a remote game entry.
  - **Actors:** A1, A2, A4, A5
  - **Steps:** The client identifies the choice as remote; asks the headless host to prepare that known game for streaming; reports staging status; attempts the existing stream connection path.
  - **Outcome:** The selected remote game is staged on the host and the client moves into the stream connection flow.
  - **Covered by:** R7, R9, R10, R11

- F4. Handle unavailable sources
  - **Trigger:** A configured or discovered remote host is offline, unreachable, or not stream-ready.
  - **Actors:** A1, A2, A4
  - **Steps:** The client keeps local entries usable; marks or reports remote source unavailability; avoids presenting failed remote status as a local catalog failure.
  - **Outcome:** The player can still understand what is playable and why remote options are missing or unavailable.
  - **Covered by:** R5, R8, R12

---

## Requirements

**Source-aware catalog**
- R1. The first version must provide a CLI/debug surface that can list local and remote game entries together.
- R2. Entries must preserve their source identity; local and remote instances of the same game may appear separately in v1.
- R3. Duplicate detection, merging, and source-overlay behavior must not be required for v1.
- R4. The remote catalog must come from the headless Korri host's known library content, not from client-authored commands or ad hoc remote game definitions.
- R5. The listing experience must include enough basic remote status for the player to distinguish reachable stream-capable sources from unavailable ones.

**Launch actions**
- R6. Choosing a local entry must launch the game locally through Korri's local launch capability.
- R7. Choosing a remote entry must stream the game remotely by asking the headless host to stage that known game for the existing stream runtime.
- R8. The client must tolerate partial availability: local games remain usable when remote sources are unreachable.
- R9. Remote stream preparation must remain constrained to known host library game ids and must not expose arbitrary unauthenticated remote command execution.

**Headless host contract**
- R10. The first headless-host contract must support the capabilities needed for source-aware listing, local-or-remote action selection, and basic remote status.
- R11. The host-facing control/data surface must be RPC-oriented and follow Korri's RPC conventions; v1 must not introduce a parallel REST-style product API for these actions.
- R12. The host should report basic status in terms that help the client decide whether remote stream actions should be offered or reported as unavailable.

**Future capability shape**
- R13. The source-aware model must leave room for later save/state management and file/content transfer without making them v1 requirements.
- R14. The model should remain compatible with future thin UI clients that reuse the same local/remote source and action concepts.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given the client has local games and can reach a headless host with remote games, when the player lists playable games, the CLI/debug surface shows both local and remote entries with source identity and does not need to merge duplicates.
- AE2. **Covers R6, R10.** Given the player selects a local entry, when the launch action runs, Korri starts the selected game on the client machine rather than preparing a remote stream.
- AE3. **Covers R7, R9, R11.** Given the player selects a remote entry, when the stream action runs, the client uses Korri RPC to ask the headless host to stage that known library game and does not send an arbitrary command for execution.
- AE4. **Covers R5, R8, R12.** Given a remote host is unreachable or not stream-ready, when the player lists games, local entries remain usable and the remote source is reported as unavailable instead of making the whole listing fail.
- AE5. **Covers R13, R14.** Given v1 only supports listing, launch/stream actions, and basic status, when future saves, file transfer, or thin UI clients are planned, they can attach to the same source-aware model rather than replacing it.

---

## Success Criteria

- The player can use one CLI/debug command surface to see both local and remote playable game entries.
- The player can launch local entries locally and stream remote entries from a headless Korri host without SSHing into that host.
- Remote status is visible enough that unreachable or unavailable hosts are understandable rather than mysterious.
- Planning can proceed without inventing the product stance on duplicate merging, save sync, file transfer, thin-client UI, or REST-vs-RPC API shape.

---

## Scope Boundaries

- Duplicate detection, duplicate merging, and unified local/remote game rows are out of scope for v1.
- A full web or native thin-client UI is out of scope for v1.
- Save sync, save-state management, and emulator state transfer are out of scope for v1.
- File/content transfer and content import through the headless host are out of scope for v1.
- A comprehensive client/server rewrite of all Korri app behavior is out of scope for v1.
- Strong pairing/authentication is out of scope for this first trusted-LAN slice unless reopened explicitly.
- Replacing Sunshine/Moonlight or the existing `Korri Stream` runner path is out of scope.
- Introducing a parallel REST-style product API for the headless host is out of scope.

---

## Key Decisions

- Source-aware CLI aggregator first: This proves the player-facing behavior directly while keeping the first slice smaller than a full client/server rewrite.
- Remote play appliance framing: The host should feel like infrastructure behind playable content, not like a remote desktop the user operates manually.
- Preserve source-specific entries in v1: Avoiding duplicate merging keeps the first version simple and explicit.
- Basic status in v1: Reachability and stream-readiness signals are needed for the CLI experience to be understandable.
- Saves and file transfer later: These are part of the broader headless-server direction but are not needed to prove local-or-remote play selection.
- RPC, not REST: Korri's headless host capabilities should be expressed through the existing RPC direction rather than introducing a second API style.

---

## Dependencies / Assumptions

- Local Korri launch behavior exists or can be reused for local entries.
- A headless host such as `aka` can run the Korri stream runner and expose known library games.
- The client can reach the headless host over the LAN or through an explicit manual host configuration.
- Trusted-LAN control is acceptable for this first slice, provided remote actions remain constrained to known games.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] What exact CLI command shape should present the source-aware local/remote listing and action selection?
- [Affects R5, R12][Technical] What minimum status vocabulary is enough for v1: reachable, catalog available, stream control enabled, current stream state, or a smaller subset?
- [Affects R6, R7][Technical] How should the CLI route from a selected source entry to the correct local launch or remote stream action while preserving clear failure reporting?
- [Affects R11][Technical] Which existing RPC conventions and client/server layers should the headless host reuse so this does not become a parallel REST API?
