# Context Analyzer Findings

## Chosen track

- **Track:** knowledge
- **Problem type:** `architecture_pattern`
- **Category directory:** `docs/solutions/architecture-patterns/`
- **Suggested filename:** `korri-kiosk-foreground-app-policy-not-gamescope-overlay-2026-05-24.md`

## YAML frontmatter skeleton

```yaml
---
title: Korri kiosk foreground app policy belongs to the session, not Gamescope
date: 2026-05-24
category: architecture-patterns
module: Korri kiosk/session foreground policy
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - A Korri kiosk launches or connects to an app that must visually replace the hub instead of tiling beside it.
  - Arbitrary games, stream clients, emulators, or executables need a generic foreground-surface contract.
  - Gamescope is being considered as an overlay or fullscreen guarantee.
related_components:
  - nix/modules/korri-kiosk.nix
  - nix/images/platforms/rocknix-sm8550.nix
  - nix/images/platforms/x86.nix
  - korri/deploy/desktop/launch-bridge.ts
  - tools/device/sessiond.ts
  - tools/device/sessiond-sway.ts
  - tools/device/sessiond-state.ts
  - tools/device/game-stream-fullscreen.ts
  - tools/device/game-stream-runner.ts
tags: [korri, kiosk, sway, foreground, sessiond, gamescope, moonlight, rocknix]
---
```

## Rationale

This should be captured as a **knowledge-track architecture pattern**, not a bug-track solution:

- The immediate Sobo symptom was user-visible: Moonlight appeared as a normal tiled Sway sibling to Korri, with the live Sway tree showing `splith`, Korri in the left half, Moonlight in the right half, `app_id: moonlight`, and neither window fullscreen.
- The durable lesson is broader than Moonlight: Korri needs a generic foreground-app/session policy for arbitrary apps and executables. A per-app Sway rule or a Gamescope wrapper is not the architecture boundary.
- `architecture_pattern` is the narrowest matching schema value because the key guidance is about ownership: foreground surface state belongs to kiosk/session management, while Gamescope is at most an app presentation adapter.
- `component: tooling` is the closest allowed enum for this Nix/Sway/sessiond/device-runtime concern. Existing solution docs in this repo use `component: tooling` for Sway/sessiond/kiosk topics.
- `severity: high` is appropriate because the issue affects the core appliance experience: launched apps should conceptually sit on top of the hub, not compete with it in a tiled desktop layout.

## Evidence from inspected files

### Kiosk Sway config has no foreground policy

`nix/modules/korri-kiosk.nix` generates a minimal Sway config:

- `default_border none`
- `default_floating_border none`
- `hide_edge_borders both`
- `exec --no-startup-id ${clientLauncher}`
- `${cfg.sway.extraConfig}`

The module documentation says `sway.extraConfig` is for platform-provided Sway fragments such as display transforms, touchscreen calibration, and device-specific input maps. It does not define an app foreground/overlay policy.

### SM8550 platform config only adds display/input and Moonlight runtime env

`nix/images/platforms/rocknix-sm8550.nix` configures root-owned kiosk session details, InputPlumber, Moonlight command/platform/mapping, and display/session facts. Its Sway fragment is limited to:

- hide cursor
- default border
- `${sm8550.display.swayDeviceConfig}`

It does not add generic `for_window`, workspace, tabbed/stacked, fullscreen, or foreground-session rules.

### x86 platform does not appear to add a special overlay policy either

`nix/images/platforms/x86.nix` wires seatd/inputplumber and Moonlight env defaults, but does not add Sway foreground rules. If x86 visually behaves like an overlay, current code evidence suggests that behavior is not from a shared kiosk Sway foreground policy.

### Current desktop Moonlight path bypasses session ownership

`korri/deploy/desktop/launch-bridge.ts` prepares the remote stream host, then directly calls `launchMoonlight({ host })`. That direct local spawn path does not route through the stronger `sessiond` home/game/restoring lifecycle or generic Sway foreground repair.

### Existing sessiond code already models home/game/restoring ownership

`tools/device/sessiond-state.ts` has explicit modes: `home`, `launching`, `game`, `restoring`, and `recovering`. `tools/device/sessiond.ts` transitions from home to launch/game, stops the renderer, runs the launch spec, then restores the renderer and reconciles home. `tools/device/sessiond-sway.ts` can repair focus/fullscreen/border state for the home renderer.

This is the closest existing architecture to the desired invariant: Korri is the home/baseline surface, and foreground app sessions are deliberate session states rather than incidental child windows.

### Gamescope support exists but is not a universal overlay mechanism

`tools/device/game-stream-fullscreen.ts` composes a Gamescope launch spec with `-f -b`, then separately repairs the Gamescope Sway surface with `focus`, `fullscreen enable`, and `border none`. `tools/device/game-stream-runner.ts` only enables that Sway repair when Gamescope is enabled and requires `SWAYSOCK` for it.

That code itself demonstrates the key point: Gamescope does not by itself solve the outer compositor policy. The Sway window for Gamescope still needs a foreground/fullscreen repair policy.

## Suggested documentation framing

The final solution doc should emphasize:

1. **Foreground ownership is a kiosk/session invariant.** Sway, sessiond, or an equivalent foreground manager must own whether launched apps replace/cover Korri. Individual apps should not be trusted to preserve that appliance invariant.
2. **Gamescope is an adapter, not the policy.** It can normalize local game presentation, resolution, scaling, and Xwayland isolation, but the outer Sway surface can still tile unless the kiosk/session layer promotes it to foreground.
3. **Avoid per-app rule accumulation as the durable solution.** Moonlight-specific rules may validate the symptom, but arbitrary apps require a generic foreground-surface contract.
4. **Route direct local launches through the same session foreground path.** The current Moonlight desktop bridge is a known bypass of stronger session lifecycle logic.

## Related existing doc

A strongly related prior solution exists:

- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md`

It documents the same ownership principle for an earlier Odin/Chromium context: kiosk/chromeless state is a session invariant, not a browser flag. The new doc should cross-reference it but remain distinct because the new topic is the generalized Korri foreground app policy and the role/non-role of Gamescope for arbitrary apps and Moonlight.
