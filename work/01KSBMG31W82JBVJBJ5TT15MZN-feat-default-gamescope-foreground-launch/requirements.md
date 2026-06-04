---
date: 2026-05-24
topic: default-gamescope-foreground-launch-policy
---

# Default Gamescope Foreground Launch Policy

## Summary

Korri should treat launched apps as session-owned foreground apps and wrap them with Gamescope by default. The default wrapper is intentionally minimal: it provides containment/window normalization, while scaling, filters, quality tuning, and exceptions remain explicit config choices. A durable foreground-session supervisor should own the full local lifecycle for every kiosk/device foreground launch: launch, promote, observe, cancel, restore, and recover.

---

## Problem Frame

Korri is moving from a single known stream path toward arbitrary foreground app launches: games, emulators, stream clients, launchers, and other executables. Without a shared launch policy, every app can rediscover the same presentation problems in a slightly different way.

Recent Sobo validation showed the cost of relying on default compositor behavior: a launched Moonlight client appeared as a tiled sibling beside Korri instead of replacing it. The foreground-session policy addresses which surface is visible; the Gamescope default addresses how launched app windows are contained consistently before per-title tuning begins.

---

## Actors

- A1. Korri owner: Configures host, launcher, profile, game, and preset policy.
- A2. Player: Starts a game or foreground app and expects it to take over the screen reliably.
- A3. Foreground session owner: Applies launch, foreground, restore, and cleanup behavior.
- A4. Launcher adapter: Converts the resolved launch policy into the process invocation for a specific app type.
- A5. Foreground session host: Owns the local graphical/session environment where foreground apps run, independent of whether a Korri GUI client is present.
- A6. Cloud gaming machine: Combines Korri server, game streaming, and foreground-session hosting for game surfaces only, without running the Korri GUI client.

---

## Key Flows

- F1. Default foreground launch
  - **Trigger:** The player launches an app without selecting any special override.
  - **Actors:** A2, A3, A4
  - **Steps:** Korri resolves launch policy, applies the default Gamescope wrapper, starts the app as a foreground session, promotes the launched surface, and restores Korri when the session ends.
  - **Outcome:** The app behaves as the foreground experience without requiring per-game setup.
  - **Covered by:** R1, R2, R4, R7

- F2. Opt-out launch
  - **Trigger:** A host, profile, launcher, game, or preset disables Gamescope for a launch.
  - **Actors:** A1, A3, A4
  - **Steps:** Korri resolves the more-specific opt-out, launches the app without Gamescope, still applies foreground-session behavior, and restores Korri when the session ends.
  - **Outcome:** Apps that break under Gamescope remain launchable without losing foreground lifecycle guarantees.
  - **Covered by:** R3, R5, R7

- F3. Cloud gaming source launch
  - **Trigger:** A remote client requests a streamed game from a machine that runs Korri server/game streaming but no local Korri GUI client.
  - **Actors:** A2, A5, A6
  - **Steps:** The host-local foreground-session owner accepts the launch, enters launching, starts the managed foreground session, promotes the game surface for capture, observes the session until exit or cancellation, then restores the host to an idle blank graphical session.
  - **Outcome:** The cloud gaming machine presents only the game surface while active and returns to a clean blank idle state afterward.
  - **Covered by:** R10, R11, R12, R15, R16

---

## Requirements

**Default launch behavior**
- R1. Gamescope is enabled by default for foreground app launches.
- R2. The default Gamescope policy is minimal: wrap the app only, with no default scaling, filters, resolution forcing, quality tuning, or visual enhancement policy.
- R3. Any launch can opt out of Gamescope through normal resolved configuration rather than an emergency workaround.
- R4. The default applies to all foreground app launch surfaces, including local stream clients such as Moonlight.

**Configuration inheritance**
- R5. Gamescope policy follows the existing broad-to-specific launch cascade: global/default policy can be overridden by host-machine/system, launcher, game, profile/preset, or launch-time override policy.
- R6. More-specific policy wins over broader defaults, including explicit `false` / disabled values.
- R7. Gamescope policy and foreground-session policy remain separate: disabling Gamescope must not disable focus/fullscreen/workspace ownership or restore behavior.

**Failure and compatibility posture**
- R8. The expected compatibility path for a problematic app is to disable Gamescope at the narrowest appropriate layer.
- R9. The system should make it clear enough from resolved launch policy whether a launch used Gamescope or opted out, so debugging does not depend on guessing hidden defaults.

**Foreground-session supervision**
- R10. All kiosk/device foreground app launches should route through one foreground-session ownership contract rather than unmanaged direct-spawn paths.
- R11. The foreground-session owner should expose a lifecycle with at least idle/home, launching, foreground, restoring, failed, and recovering states.
- R12. The foreground-session owner should hold a managed child/session handle or equivalent monitor so it can observe normal exit, early failure, and abnormal termination.
- R13. Only one foreground session may be active per foreground-session host; concurrent launch requests should be rejected or serialized predictably rather than creating split-brain sessions.
- R14. A foreground session should be cancellable through a control path that terminates the active session and transitions through restore/recovery.
- R15. Restore behavior is role-specific: GUI kiosk roles restore the Korri client surface, while cloud gaming source roles restore to an idle blank graphical session.
- R16. Korri should support a cloud gaming/source-machine role that runs Korri server, game streaming, and foreground-session hosting without requiring the Korri GUI client.
- R17. Deployment roles should remain composable: GUI client, Korri server, game streaming, and foreground-session/compositor ownership are separate capabilities that may be combined by kiosk or cloud-gaming deployments.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R4.** Given a foreground app with no Gamescope policy set at any specific layer, when the player launches it, Korri wraps it in Gamescope using only the minimal wrapper behavior.
- AE2. **Covers R3, R5, R6.** Given a host-machine/system default enables Gamescope and a specific game disables it, when that game is launched, the game runs without Gamescope.
- AE3. **Covers R3, R5, R6.** Given a game inherits Gamescope enabled and a selected preset disables it, when that preset is launched, the preset opt-out wins.
- AE4. **Covers R7.** Given a launch disables Gamescope, when the app starts, Korri still treats it as a foreground session and restores Korri afterward.
- AE5. **Covers R10, R11, R12, R15, R16.** Given a cloud gaming machine with no Korri GUI client, when a streamed game foreground session exits normally, the foreground-session owner returns the graphical session to idle blank rather than trying to restore a missing GUI client.
- AE6. **Covers R13.** Given a foreground session is launching or active, when another launch request arrives, the host rejects or serializes it predictably instead of spawning a second foreground app beside the first.
- AE7. **Covers R14, R15.** Given an active foreground session, when cancellation is requested, the owner terminates the active session and restores the role-specific idle target.

---

## Success Criteria

- A normal launched app is Gamescope-wrapped and foregrounded without requiring per-game config.
- A known-incompatible app can opt out at a narrow config layer without changing global defaults.
- GUI kiosk deployments restore the Korri client after foreground app exit, failure, or cancellation.
- Cloud gaming/source-machine deployments can host streamed game surfaces without a local Korri GUI client and return to an idle blank graphical session after foreground app exit, failure, or cancellation.
- Planning does not need to invent the default Gamescope posture, opt-out semantics, foreground/session lifecycle states, or role-specific restore target.

---

## Scope Boundaries

- No default scaling, filters, FSR, frame pacing, resolution forcing, or quality profiles.
- No claim that Gamescope is the foreground/overlay policy; foreground ownership remains session-owned.
- No per-app compositor rule pile as the primary design.
- No requirement that every app must work under Gamescope; opt-out is an expected compatibility path.
- No replacement of the existing config cascade model; this requirement rides on that model.
- No requirement that every foreground-session host runs the Korri GUI client; cloud gaming source hosts can be game-surface-only.
- No requirement that the Korri server role itself owns or starts Sway in every deployment; compositor/session ownership is a separate role capability.
- No requirement for first-version launch queueing, multi-window launcher semantics, or rich active-session UI.

---

## Key Decisions

- Gamescope defaults on: This makes the common path consistent and lets exceptions be explicit.
- Minimal wrapper by default: The default should reduce windowing variability without changing image quality or scaling behavior.
- Opt-out is first-class: Compatibility failures are expected and should be handled through normal config inheritance.
- Foreground policy stays separate: Gamescope may normalize the child app window, but the session owner still decides what is on top and when Korri returns.
- Full lifecycle state machine: The durable supervisor should model the full foreground lifecycle rather than only repairing focus/fullscreen after spawn.
- All foreground app launches: The supervisor contract should apply to all kiosk/device foreground launches, not only local Moonlight.
- Composable deployment roles: `kiosk` means Sway/session owner plus GUI client; `client` means GUI client only; `server` means Korri server; a cloud gaming/source machine composes server, game streaming, and foreground-session hosting without a GUI client.
- Cloud gaming idle target: A source machine without GUI should restore to an idle blank graphical session after foreground app exit.

---

## Dependencies / Assumptions

- The launch config cascade described in `docs/briefs/2026-05-21-korri-config-cascade-brief.md` is the intended inheritance model for policy resolution.
- The foreground-session ownership pattern described in `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` remains required even when Gamescope is enabled by default.
- `services.korri.kiosk` currently owns the Sway compositor session and GUI client, while `services.korri.server`/`services.korri.gameStream` provide server and stream-runner capabilities that may integrate with an existing graphical session rather than owning it.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R10, R16, R17][User decision] For cloud gaming/source machines, should launch requests reach the foreground-session owner through Korri server only, through the Sunshine runner only, or through both sharing one host-local supervisor/status contract?

### Deferred to Planning

- [Affects R11, R15][Technical] Exact module/service names and runtime placement for the foreground-session owner.
- [Affects R15, R16][Technical] Exact implementation of the idle blank graphical session for game-surface-only hosts.
