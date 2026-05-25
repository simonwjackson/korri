---
title: Kiosk foreground app policy belongs to the session, not Gamescope
date: 2026-05-24
category: architecture-patterns
module: Korri kiosk/session foreground policy
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "A Korri kiosk launches or connects to an app that must visually replace the hub instead of tiling beside it."
  - "Arbitrary games, stream clients, emulators, or executables need a generic foreground-surface contract."
  - "Gamescope is being considered as an overlay or fullscreen guarantee."
related_components:
  - "nix/modules/korri-kiosk.nix"
  - "nix/images/platforms/rocknix-sm8550.nix"
  - "nix/images/platforms/x86.nix"
  - "korri/deploy/desktop/launch-bridge.ts"
  - "korri/products/app/stream/moonlight-launcher.ts"
  - "tools/device/sessiond.ts"
  - "tools/device/game-stream-fullscreen.ts"
  - "tools/device/game-stream-runner.ts"
tags: [korri, kiosk, sway, foreground, sessiond, gamescope, moonlight, rocknix]
---

# Kiosk foreground app policy belongs to the session, not Gamescope

## Context

On Sobo, launching a Moonlight stream from Korri made Moonlight appear to the right of Korri instead of visually replacing it. The live Sway tree showed a normal tiling result: the workspace layout stayed `splith`, Korri occupied the left half of the 960x540 logical output, Moonlight occupied the right half, and neither surface was fullscreen.

Moonlight's own logs confirmed the compositor resized it after creation. The SDL/Wayland `v4l2m2m` path initially presented at the full 960x540 output, then received a 480x540 window event and letterboxed inside that half-width surface.

The repo explains why this happened. `nix/modules/korri-kiosk.nix` generates a minimal Sway config: borders are disabled and `korri-kiosk-client` is started, but no generic rule says launched apps become foreground, fullscreen, floating, tabbed, or workspace-isolated. `nix/images/platforms/rocknix-sm8550.nix` adds Sobo display/input facts and Moonlight runtime environment, not foreground-app semantics. `nix/images/platforms/x86.nix` also lacks a special Moonlight overlay policy, so any x86 overlay-like behavior is likely a backend/windowing accident rather than a shared Korri invariant.

The current local stream launch path also bypasses the stronger session lifecycle code. `korri/deploy/desktop/launch-bridge.ts` prepares the remote stream host and then directly calls `launchMoonlight({ host })`. That direct spawn path is separate from the `tools/device/sessiond.ts` lifecycle that models `home`, `launching`, `game`, `restoring`, and `recovering` and can reconcile Sway focus/fullscreen state.

## Guidance

Model foreground presentation as two separate layers:

1. **Kiosk/session foreground policy owns which surface is on top.**
   The appliance needs one canonical owner for the rule: when Korri launches or connects to an app, that app becomes the foreground surface until it exits or the session restores home. That owner may focus/fullscreen a new Sway surface, switch to a dedicated foreground workspace, use a tabbed/stacked workspace mode, or restore Korri after process exit. The invariant belongs to kiosk/session management, not to individual app launch flags.

2. **Gamescope is an optional app presentation adapter.**
   Gamescope is useful when a launcher benefits from Xwayland isolation, resolution spoofing, scaling, frame limiting, or consistent game-facing geometry. It is not the universal overlay mechanism. Sway can still tile the Gamescope window unless the outer kiosk/session policy promotes that Gamescope surface to foreground.

A durable launch model should look like this:

```text
home -> launching -> foreground-app -> restoring-home
```

The foreground transition can then apply Sway/session commands to the launched surface:

```text
[con_id=<launched-surface>] focus
[con_id=<launched-surface>] fullscreen enable
[con_id=<launched-surface>] border none
```

or move the launched surface to a dedicated foreground workspace:

```text
[con_id=<launched-surface>] move to workspace 2
workspace 2
[con_id=<launched-surface>] fullscreen enable
```

or use a single-visible-surface workspace mode if validation shows it matches the appliance UX:

```text
workspace_layout tabbed
# or stacking, if decorations and multi-window behavior are acceptable
```

Avoid making app identity the primary architecture:

```text
for_window [app_id="moonlight"] fullscreen enable
for_window [class="Cemu"] fullscreen enable
for_window [class="RetroArch"] fullscreen enable
```

Those rules can be useful diagnostics or compatibility shims, but they do not solve arbitrary foreground apps. They also encourage the wrong ownership model: each new executable teaches the compositor another app-specific exception instead of sharing one session invariant.

## Why This Matters

Without a foreground policy, every launched executable is just another compositor surface. On a tiling compositor, the default outcome is to tile beside existing windows. That was the Sobo symptom.

The two-layer model keeps responsibilities clean:

- Korri/session code owns product semantics: home, foreground app, restore, recovery, focus, fullscreen, and workspace state.
- App adapters own process-specific presentation: Gamescope wrapping, Moonlight platform selection, emulator flags, resolution/scaling policy, and per-game environment.

This prevents Gamescope from carrying responsibility it cannot fulfill. `gamescope -f` can create a fullscreen Gamescope window, but the parent Sway session still decides whether that window is focused, fullscreened, tabbed, tiled, or workspace-isolated relative to Korri.

It also preserves the validated Sobo Moonlight path. Moonlight `v4l2m2m` currently presents through SDL/Wayland and uses the SM8550 VPU. Wrapping it in Gamescope should be an experiment, not the default fix for a compositor foreground bug, because it changes the presentation path and adds a nested compositor.

## When to Apply

- A Korri appliance launches any process that should visually replace or cover the hub.
- A launched app appears beside Korri instead of becoming the foreground surface.
- A new local executable, emulator, stream client, launcher, or game wrapper is added.
- Gamescope is proposed as a fullscreen or overlay guarantee.
- `sessiond`, `korri-kiosk`, the desktop launch bridge, or game-stream runner behavior is changed around foreground app lifecycle.

## Examples

### Keep Gamescope as launch policy, not session policy

Gamescope can be selected by launch metadata when it helps the child app:

```text
gamescope -f -b -- <game-command> <game-args...>
```

But the outer session still needs to promote the Gamescope surface:

```text
wait for launched Sway surface
focus it
fullscreen it or move it to the foreground workspace
restore Korri when it exits
```

`tools/device/game-stream-fullscreen.ts` already demonstrates this separation: it composes a Gamescope launch spec and still issues Sway repair commands (`focus`, `fullscreen enable`, `border none`) for the resulting surface.

### Route direct local launches through foreground ownership

The current Moonlight path in `korri/deploy/desktop/launch-bridge.ts` starts Moonlight directly after remote prepare. A more durable shape is to route local foreground launches through the same session owner used for other foreground app sessions, so Moonlight does not depend on Sway's default tiling behavior.

### Treat Sobo's video path as adjacent, not the foreground fix

Setting `KORRI_MOONLIGHT_PLATFORM=v4l2m2m` and `SDL_VIDEODRIVER=wayland` is a video/presentation-path fix for hardware decode. It does not prove or enforce the compositor foreground invariant. Foreground policy should be solved outside Moonlight first.

## Related

- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` — earlier Odin/Chromium lesson that kiosk presentation is a session invariant, not a browser flag.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` — generic Sunshine/Moonlight runner contract and launch-intent validation.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — lifecycle split between boot-scoped control and session-scoped runner.
- `docs/plans/2026-05-04-004-feat-odin-chromium-session-supervisor-plan.md` — historical session-supervisor design with home/game/restoring state.
- `docs/plans/2026-05-21-003-refactor-korri-kiosk-modules-plan.md` — Korri kiosk module ownership and platform-fragment boundaries.
- `docs/plans/2026-05-24-005-fix-sm8550-moonlight-platform-plan.md` — adjacent Sobo Moonlight platform fix; distinct from foreground-window policy.
- `docs/brainstorms/2026-05-18-headless-game-stream-orchestration-requirements.md` — prior requirement framing where Gamescope may help fullscreen/session behavior but is not the product requirement.
