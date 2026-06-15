---
id: 01KV3A5RNCMMGR8FY5Y8MKPWGD
slug: normalize-all-foreground-launches-under-one-lifecycle-superv
title: Normalize all foreground launches under one lifecycle supervisor
origin: parked
status: To Do
priority: high
labels:
  - steam
  - streaming
  - sessiond
  - input
  - architecture
created: 2026-06-14
source: user
briefing: docs/briefs/2026-06-14-foreground-session-lifecycle-brief.md
---

# Normalize all foreground launches under one lifecycle supervisor

## Why it matters

Remote vs local lifecycle must be an implementation detail. A user launches, monitors, and stops a foreground experience; they should not have to care whether that experience is a local emulator, a Steam AppID routed through Gamescope/LaunchOptions, or a remote host prepared for Moonlight streaming. Today those paths are observable through different control-plane seams: local/sessiond status, game-stream prepare intents, Steam wrapper behavior, and inputd fallback process heuristics. That split leaks into UI state, stop behavior, diagnostics, and hardware actions.

A single managed foreground-session contract gives every app type the same launch identity, readiness, stop, restore, and residual-reaping semantics. Implementation-specific details should remain available as metadata and diagnostics, but the product lifecycle should be one surface.

## Acceptance Criteria

- [ ] Steam, emulator, native/process, and remote-stream launches all register a durable foreground session identity with sessiond or an equivalent lifecycle supervisor.
- [ ] Remote vs local is represented only as session metadata/diagnostics, not as separate UI/control lifecycle branches.
- [ ] The portal/home UI consumes one foreground-session status source for local, Steam, emulator, and remote-stream launches.
- [ ] `app.library.launch`, remote stream prepare/launch, and direct local launch paths converge on the same lifecycle projection for `Preparing`, `Launching`, `Running`, `Stopping`, `Restoring`, `Failed`, and `Recovering` states.
- [ ] The button chord invokes one stop API and never needs per-launcher process heuristics in inputd.
- [ ] Session status remains running/cooling until the actual foreground experience is terminated or intentionally anchored, even when the initial launcher process exits before the game.
- [ ] Residual process reaping is owned by the lifecycle supervisor with observable logs/events.
- [ ] Every foreground session id ties together launch request, lifecycle events, stop request, and diagnostic artifacts.
- [ ] Tests cover Steam-style launcher-exits-before-game, emulator-style direct child process launches, and remote-stream launches through the same lifecycle projection and stop contract.

## Related

- `docs/briefs/2026-06-14-foreground-session-lifecycle-brief.md`
- `work/items/parking-lot/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti.md`
- `product/services/device/sessiond.ts`
- `product/services/device/game-stream-launch-intent.ts`
- `product/services/device/game-stream-runner.ts`
- `product/services/device/inputd-actions.ts`
- `product/platform/library/sessiond-managed-launch-protocol.ts`
- `product/platform/library/session-launcher.ts`
- `product/platform/library/sessiond-lifecycle-projections.ts`
- `product/platform/stream/foreground-session-gate-state.ts`
- `tools/device/steam/korri-steam-gamescope-launch.sh`

## Briefing

See `docs/briefs/2026-06-14-foreground-session-lifecycle-brief.md` for the product framing, target lifecycle vocabulary, public shape sketch, current anchors, and success criteria.

## Notes

User described this as wanting a single interface/pipeline to normalize launch, status, and kill/stop behavior regardless of actual app type. The concrete product requirement is: **remote vs local lifecycle is an implementation detail**. Runtime-specific facts should be attached as diagnostics/artifacts, not expressed as separate lifecycle machines that UI/input code must branch on.
