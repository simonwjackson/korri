---
date: 2026-05-19
topic: korri-lan-stream-discovery
---

# Korri LAN Stream Discovery

## Summary

Build a Linux-first CLI/debug prototype where a Korri client discovers a streamable Korri host on the LAN, presents that host's remote games as content, lets the user choose a game, stages it on the host, and attempts to open Moonlight locally.

---

## Problem Frame

Korri can now prepare known library games for the existing `Korri Stream` flow, but the user still has to already know which machine is the stream host and operate the launch preparation from that host. That keeps the experience host- and operator-centered instead of content-centered.

The desired product direction is closer to a local game library that happens to know some games are available from nearby streamable systems. A user should not have to browse into a remote machine to inspect its games. Remote availability should become an attribute of content, and hosts should remain infrastructure behind that content surface.

The first slice should prove the network and control loop without taking on the eventual app UI, Android/Odin packaging, duplicate-game merging, file sharing, or multiplayer discovery.

---

## Actors

- A1. Linux client user: Runs the CLI/debug prototype from a Linux dev machine and chooses a remote game to stream.
- A2. Korri discovery client: Finds streamable Korri hosts and presents remote games in a content-first CLI/debug view.
- A3. Streamable Korri host: Advertises that it is online and can prepare known Korri library games for streaming.
- A4. Existing stream runner/app: Consumes the prepared launch on the host through the established `Korri Stream` flow.
- A5. Local Moonlight client: Attempts to connect from the Linux client after the remote game is staged.

---

## Key Flows

- F1. Discover streamable hosts
  - **Trigger:** The Linux client user runs the discovery/stream CLI.
  - **Actors:** A1, A2, A3
  - **Steps:** The client searches the local network for streamable Korri hosts; the host advertises enough information for the client to identify it as online; the client includes discovered hosts in its candidate remote content sources.
  - **Outcome:** The user can tell that a streamable Korri host such as `aka` is online.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. Choose remote content and prepare a stream
  - **Trigger:** The client has discovered at least one streamable host with remote games.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The client obtains the host's known streamable games; presents them as remote content rather than requiring host-first browsing; the user chooses one game; the client asks the host to stage that known game for the existing `Korri Stream` flow.
  - **Outcome:** The chosen remote game is prepared on the host for the next stream attempt.
  - **Covered by:** R6, R7, R8, R9, R10, R11

- F3. Attempt local Moonlight connection
  - **Trigger:** A remote game has been staged successfully.
  - **Actors:** A1, A2, A5
  - **Steps:** The client attempts to open Moonlight locally; if the regular Moonlight command is unavailable, it may fall back to a Nix-provided Moonlight command; the user is left in the existing Moonlight/Sunshine connection flow.
  - **Outcome:** The prototype demonstrates the end-to-end path from discovery through game selection to a local stream connection attempt.
  - **Covered by:** R12, R13, R14

---

## Requirements

**Discovery and host identity**
- R1. The first prototype must target Linux clients; Android/Odin implementation is not part of this slice.
- R2. The client must be able to discover streamable Korri hosts on the same local network with zero or near-zero manual configuration.
- R3. The primary discovery direction must use the LAN's standard service-discovery shape rather than making host entry the main product workflow.
- R4. The discovery path must have a manual-host fallback for debugging and reliability when automatic discovery is unavailable or flaky.
- R5. The minimum host status for the first prototype is online presence; richer stream, network, and capability status may be absent.

**Content-first remote game selection**
- R6. Remote games must be presented as content in the CLI/debug view, not as a required step of browsing into a remote host.
- R7. The first prototype may show only remote games; merging local and remote libraries is deferred.
- R8. Remote games should include enough source indication that the user can tell they are available remotely.
- R9. The client must let the user choose a discovered remote game from the host's known Korri library content.
- R10. Preparing a remote game must stage a known Korri library game on the host for the existing `Korri Stream` flow.
- R11. The prototype must not expose arbitrary unauthenticated remote command execution as the game-selection mechanism.

**Stream connection attempt**
- R12. After a remote game is staged successfully, the client must attempt to open Moonlight locally.
- R13. The Moonlight attempt should prefer an installed local Moonlight command and may fall back to a Nix-provided Moonlight command.
- R14. If the Moonlight attempt cannot be started, the CLI/debug prototype must still report that staging succeeded and make the remaining connection step clear.

**Future capability shape**
- R15. The discovery model must leave room for future host capabilities such as stream service enabled, active connection status, latency, bandwidth, and file sharing availability.
- R16. File sharing and multiplayer discovery should be treated as future capabilities on the same discovery/source model, not as requirements for this first stream-discovery slice.
- R17. The eventual app UI should be able to consume this direction as a content/source overlay model rather than a host-browser model, but app UI integration is out of scope for the first prototype.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R4, R5.** Given `aka` is online on the same LAN, when the Linux user runs the CLI/debug prototype, the client discovers `aka` automatically or through the manual-host fallback and identifies it as an online streamable Korri host.
- AE2. **Covers R6, R7, R8, R9.** Given `aka` exposes known streamable games, when discovery succeeds, the CLI/debug view presents those games as remote content choices with a remote/source indication rather than requiring the user to first enter a host-browsing view.
- AE3. **Covers R10, R11.** Given the user chooses a remote game from `aka`, when the client prepares the stream, the host stages that known library game for `Korri Stream` without accepting an arbitrary raw command from the client.
- AE4. **Covers R12, R13, R14.** Given the remote game is staged successfully, when the client proceeds, it attempts to open Moonlight locally; if Moonlight cannot be started, the user still sees that remote staging succeeded and what remains to connect.
- AE5. **Covers R15, R16, R17.** Given the prototype only needs online status today, when future capabilities are added, they can attach to the discovered source/content model without changing the product stance that content is primary and hosts are infrastructure.

---

## Success Criteria

- A Linux dev machine can discover `aka` as an online streamable Korri host without requiring the user to remember its address in the common path.
- The user can choose a game exposed by `aka` from a content-first CLI/debug surface.
- The chosen remote game is staged on `aka` for the existing `Korri Stream` flow.
- The client attempts to open Moonlight locally after staging, proving the intended end-to-end prototype loop.
- Downstream planning can design the implementation without inventing the product stance on host-first browsing, arbitrary remote commands, Android targeting, file sharing, multiplayer, or local/remote library merging.

---

## Scope Boundaries

- Android/Odin implementation work is out of scope for this slice.
- Main Korri app UI integration is out of scope.
- Local and remote library merging is out of scope.
- Duplicate-game overlay behavior is out of scope.
- File sharing implementation is out of scope.
- Multiplayer lobby or peer discovery implementation is out of scope.
- Latency, bandwidth, and connection-quality measurement are out of scope beyond preserving room for future capability status.
- Strong authentication, device pairing, or user approval flows are out of scope for the prototype; trusted LAN is acceptable for this slice.
- Replacing Sunshine/Moonlight or changing the stable `Korri Stream` app model is out of scope.
- Arbitrary unauthenticated remote command execution is out of scope.

---

## Key Decisions

- Content-first direction: Remote availability should become an attribute of games/content, not a host-browsing destination.
- Linux-first prototype: The first implementation target is a Linux dev machine, keeping Android/Odin packaging out of the critical path.
- Remote-only debug view first: The CLI/debug prototype can prove remote discovery and remote game choice before local+remote merging exists.
- Standard LAN discovery with fallback: The product direction should use standard LAN service discovery, while retaining a manual-host path for debugging and reliability.
- Trusted LAN prototype: The first slice may trust same-LAN clients, while stronger pairing/authentication remains a future product concern.
- Existing stream flow remains central: Discovery and remote prepare should feed the established `Korri Stream` flow rather than replacing Moonlight/Sunshine.

---

## Dependencies / Assumptions

- `aka` or another target host can run the existing Korri stream runner/app and expose known Korri library games.
- The Linux client machine can run the Korri CLI/debug prototype and can attempt to launch Moonlight locally.
- The network allows same-LAN service discovery or at least direct manual-host access for the fallback path.
- The remote prepare action can be constrained to known Korri library games on the host.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R3][Technical] Which TypeScript/Bun-compatible service-discovery mechanism best fits the standard LAN discovery direction in the current Nix/Linux environment?
- [Affects R4][Technical] What exact manual-host fallback shape should the CLI expose?
- [Affects R9, R10][Technical] What host-side control surface should expose known games and accept remote prepare requests for trusted-LAN prototype use?
- [Affects R12, R13][Technical] What is the safest and most portable way for the Linux client to attempt local Moonlight launch while preserving clear failure reporting?
