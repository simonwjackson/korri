## Context

Korri’s current kiosk session does not yet have a generic foreground-app policy. On live Sobo, launching Moonlight from Korri produced a normal Sway tiling outcome: the workspace stayed in `splith`, Korri occupied the left 480x540 half of the 960x540 logical output, and Moonlight occupied the right 480x540 half. Moonlight’s SDL logs aligned with that compositor state: it initially presented at the full 960x540 output, then received a resize event to 480x540 and letterboxed inside the tiled half-width surface.

The repo confirms why this happens. `nix/modules/korri-kiosk.nix` generates a minimal Sway config with `default_border none`, `default_floating_border none`, `hide_edge_borders both`, and `exec --no-startup-id ${clientLauncher}`. It appends platform `sway.extraConfig`, but it does not define a policy for launched applications to become foreground, fullscreen, floating, tabbed, or workspace-isolated.

Sobo’s platform config in `nix/images/platforms/rocknix-sm8550.nix` supplies device/session facts: root-owned kiosk runtime, existing session bus, InputPlumber, Moonlight command/platform environment, SDL Wayland environment, and display/input Sway fragments. Those are hardware and runtime facts, not a foreground-surface policy. The x86 platform config in `nix/images/platforms/x86.nix` likewise wires Moonlight and input services without a special overlay/fullscreen policy for Moonlight.

The current desktop stream launch path also bypasses the more explicit Korri session lifecycle. `korri/deploy/desktop/launch-bridge.ts` prepares the remote stream host, then directly calls `launchMoonlight({ host })`. By contrast, `tools/device/sessiond.ts` models an explicit session transition: launch only from `home`, stop the renderer, mark `game`, run the launched spec, then restore the renderer and reconcile home. That is closer to the desired “Korri is the hub/baseline; launched apps are foreground sessions” mental model.

`tools/device/game-stream-fullscreen.ts` already contains useful primitives for one subset of this problem: it can find a stream surface and issue Sway commands to focus, fullscreen, and remove borders. However, `tools/device/game-stream-runner.ts` only enables that repair path when a launch intent’s Gamescope policy is enabled, using a Gamescope-specific selector. It is not currently the generic local-Moonlight foreground policy.

Web research challenged Gamescope as a universal answer. Gamescope is a gaming microcompositor useful for Xwayland sandboxing, resolution spoofing, scaling, frame limiting, and creating fullscreen/borderless nested windows. But it is not, by itself, an outer Sway overlay policy: Sway can still tile the Gamescope window unless Korri’s session/compositor policy focuses/fullscreens or workspace-isolates it. Gamescope also carries caveats: Wayland clients require `--expose-wayland`, backend behavior can vary, performance may depend on priority/capabilities, and input/fullscreen quirks exist. On Sobo, wrapping Moonlight could perturb the validated `v4l2m2m + SDL/Wayland` path.

## Guidance

Model this as two layers:

1. **Kiosk/session foreground policy owns which surface is on top.**
   The Korri appliance should have one canonical place that decides what happens when a launched app appears: focus it, fullscreen it, place it on a foreground workspace, use tabbed/stacked workspace layout, or restore Korri when the app exits. This policy should be generic and tied to the session lifecycle, not to individual apps like Moonlight.

2. **Gamescope is an optional app presentation adapter.**
   Use Gamescope when a launcher benefits from Xwayland isolation, resolution spoofing, scaling, frame limiting, or consistent game-facing display geometry. Do not treat Gamescope as the universal “overlay” mechanism; it still needs the outer foreground policy and may be wrong for already-validated native Wayland/SDL paths such as Sobo Moonlight `v4l2m2m`.

A good long-term shape is to route launched foreground apps through a session manager with an explicit lifecycle similar to `tools/device/sessiond.ts`:

```text
home -> launching -> foreground-app -> restoring-home
```

The launch path should then enforce foreground state with Sway/session operations, for example:

```text
[con_id=<launched-surface>] focus
[con_id=<launched-surface>] fullscreen enable
[con_id=<launched-surface>] border none
```

or by moving the app to a dedicated foreground workspace and switching there:

```text
workspace 2
[con_id=<launched-surface>] move to workspace 2
[con_id=<launched-surface>] fullscreen enable
```

or by configuring a single-visible-surface workspace mode if validation shows it matches the UX:

```text
workspace_layout tabbed
# or stacking, if decorations and multi-window behavior are acceptable
```

Avoid growing an app-specific pile like this as the primary architecture:

```text
for_window [app_id="moonlight"] fullscreen enable
for_window [class="Cemu"] fullscreen enable
for_window [class="RetroArch"] fullscreen enable
```

Those rules may be useful as temporary diagnostics or compatibility shims, but they do not solve the arbitrary-app problem cleanly.

For Gamescope, keep the existing launcher-level policy approach: carry `gamescope` as launch metadata and wrap only when selected. The current `composeGamescopeLaunchSpec` pattern is appropriate as an adapter:

```text
gamescope -f -b [args...] -- <game-command> <game-args...>
```

But the outer session still must make the Gamescope surface foreground; `-f` makes Gamescope request a fullscreen window, not a guarantee that Sway will choose it over Korri.

## Why This Matters

Without a foreground policy, each new executable becomes a normal compositor surface. On a tiling compositor, “normal” means “tile beside existing windows,” which is exactly the Sobo symptom. Fixing this with a Moonlight-only rule would mask the immediate stream bug while leaving the next emulator, launcher, dialog, or arbitrary executable to rediscover the same failure mode.

The two-layer model separates concerns cleanly:

- Korri/session code owns product semantics: home, foreground app, restore, recovery, focus, fullscreen, workspace state.
- App adapters own process-specific presentation details: Gamescope wrapping, Moonlight platform selection, emulator flags, scaling/resolution policy.

This avoids making Gamescope carry responsibility it cannot actually fulfill. Gamescope can normalize the child app’s display environment, but it cannot decide how the parent Sway workspace should prioritize Gamescope relative to Korri. That parent compositor decision belongs in Korri’s kiosk/session policy.

This also preserves flexibility. Moonlight on Sobo can stay on the validated `v4l2m2m + SDL/Wayland` path, while local games or emulators can opt into Gamescope when it provides value. The system gets a generic foreground-app contract without forcing every app through the same rendering stack.

## When to Apply

- When a Korri appliance launches any process that should visually replace or cover the hub.
- When an app appears tiled beside Korri instead of becoming the foreground surface.
- When adding support for arbitrary local executables, emulators, remote stream clients, launchers, or game wrappers.
- When deciding whether to use Gamescope for a launcher: choose it for game presentation benefits, not as the outer overlay/session policy.
- When extending `sessiond`, `korri-kiosk`, the desktop launch bridge, or game-stream runner behavior around foreground app lifecycle.

## Examples

### Bad framing: app-specific overlay fixes

```text
for_window [app_id="moonlight"] fullscreen enable
```

This may fix today’s Moonlight symptom, but it does not define what should happen for the next arbitrary executable. It also couples product behavior to app identity.

### Better framing: foreground session policy

```text
on launch request:
  mark session launching
  start foreground process
  wait for new Sway surface
  focus/fullscreen or move to foreground workspace
  mark session foreground-app

on process exit:
  restore or refocus Korri
  reconcile home invariant
```

This matches the existing `tools/device/sessiond.ts` direction and can reuse repair primitives like those in `tools/device/game-stream-fullscreen.ts`, generalized away from Gamescope-specific selectors.

### Gamescope as adapter, not policy

```text
# Adapter layer: useful for selected games
command: gamescope
args: ["-f", "-b", "--", game.command, ...game.args]

# Policy layer: still required
sway: focus/fullscreen the Gamescope surface or switch to foreground workspace
```

### Sobo-specific lesson

Moonlight `v4l2m2m` already presents through SDL/Wayland and uses hardware decode. Wrapping it in Gamescope should be treated as an experiment, not a default, because it changes the presentation path and may add nested compositor complexity. The foreground bug should be solved outside Moonlight first.

## Related

- `nix/modules/korri-kiosk.nix` — generated kiosk Sway config; currently no generic foreground policy.
- `nix/images/platforms/rocknix-sm8550.nix` — Sobo/SM8550 runtime, Moonlight, and display/input config; supplies hardware/session facts rather than app foreground semantics.
- `nix/images/platforms/x86.nix` — x86 kiosk wiring also lacks special Moonlight foreground policy.
- `korri/deploy/desktop/launch-bridge.ts` — current remote stream path directly starts local Moonlight after prepare.
- `tools/device/sessiond.ts` — explicit home/game/restore lifecycle; closest existing model for Korri-as-hub session ownership.
- `tools/device/game-stream-fullscreen.ts` — Sway focus/fullscreen/border repair primitives currently scoped to Gamescope-selected game stream surfaces.
- `tools/device/game-stream-runner.ts` — wraps with Gamescope and repairs fullscreen only when launch intent enables Gamescope.
- `korri/products/app/stream/moonlight-launcher.ts` — builds and spawns Moonlight args; app adapter layer, not compositor foreground policy.
