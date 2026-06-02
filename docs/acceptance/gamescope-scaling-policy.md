# Gamescope Scaling Policy

Date: 2026-06-02
Status: active policy for v1 Gamescope runtime-control integration

## Policy summary

Gamescope owns visual upscale only when Korri launches it with a smaller inner surface and a larger outer output. Moonlight/Sunshine runtime stream changes remain separate controls. Product code must not infer scaling policy from child argv/env; it must use explicit configuration/session fields when those fields are introduced.

## Rules

1. **FSR proof requires Gamescope-owned upscale.** Launch with smaller inner dimensions (`-w/-h`) and larger outer dimensions (`-W/-H`) before claiming FSR/scaling behavior.
2. **No hotkey-only proof.** `Super+U` or other hotkeys are not accepted as API/product evidence. Use the Korri bridge, X/native readback, and DSI-2 captures.
3. **Physical capture is source of truth for visual claims.** Logs and socket responses prove control-plane behavior; DSI-2 captures prove visual/product behavior.
4. **API accepts positive internal modes; product policy gates usage.** The v1 API validates any positive width/height. Product launch policy decides which live `mode.set` values are offered or automated.
5. **Mode/filter/sharpness are individual controls.** Do not introduce a v1 quality-profile command that hides Moonlight/Sunshine/Gamescope coordination.
6. **Do not silently fall back.** Unsupported mode/filter/scaling combinations must remain unavailable or return structured non-success results rather than applying a guessed launch shape.

## Current validated shape

Validated local and bridge-driven Bandai evidence supports this shape:

- Outer Gamescope output: `1920x1080` physical DSI-2 output.
- Inner Xwayland/app modes: `640x360`, `960x540`, `1280x720`.
- Filter: `linear` and `fsr` live changes.
- Sharpness: live changes across `0..20`.
- FSR feedback: `GAMESCOPE_FSR_FEEDBACK = 1` when FSR is active.

## Product launch policy

For v1 product wiring:

- Launch-spec composition may expose explicit Gamescope fields for:
  - backend (`wayland` for nested Sway sessions unless a hardware-specific policy says otherwise),
  - outer output size,
  - inner Xwayland size,
  - expose-Wayland behavior,
  - initial filter,
  - initial sharpness.
- These fields must be cascade-folded explicit policy fields, not inferred from child argv/env.
- Product sessions may start the Gamescope bridge and expose its socket/readiness before applying any automated runtime scaling decision.
- Product automation may use live `filter.set` and `sharpness.set` once bridge capabilities report support.
- Product automation must not automatically use live `mode.set` for Moonlight nested-resolution coordination until the active Moonlight client path is known to redraw/present correctly for that launch shape.

## Moonlight/Sunshine coordination

- Sunshine/Moonlight stream resolution and bitrate changes are still validated by their own runtime-control path.
- Gamescope inner-mode changes do not by themselves prove outbound encoded frame-size changes.
- For bandwidth savings, stream resolution and bitrate must change at the Moonlight/Sunshine layer; Gamescope scaling controls only determine how the compositor presents the stream/game surface.
- When the product wants lower bandwidth plus full-panel presentation, the coordinated shape is:
  1. lower Moonlight/Sunshine stream resolution/bitrate/FPS as needed,
  2. set Gamescope inner mode to match or intentionally frame the client surface,
  3. keep Gamescope outer output at panel/native target,
  4. choose filter/sharpness explicitly,
  5. verify no reconnect/restart occurred.

## Acceptance gates before broad automation

Before Korri automatically applies live `mode.set` in product quality policy, the active launch path must have evidence for:

- same Moonlight stream/session remains connected,
- no game restart,
- no Moonlight reconnect,
- Moonlight presenter redraws rather than freezing,
- physical DSI-2 capture after the mode change,
- state/readback matches requested mode or reports a structured non-success result.

Until those gates pass for a concrete product launch shape, expose `mode.set` as an operator/API control and keep product automation to filter/sharpness/state visibility.

## Backlog impact

- `task-090` is satisfied by this policy document plus launch-spec/config tests when explicit policy fields are added.
- `task-102` is satisfied for local Gamescope FSR/inner-resolution behavior by the Bandai evidence in `docs/acceptance/gamescope-control-bandai-2026-06-02.md`.
- `task-068` remains tied to Moonlight nested-resolution product evidence; this policy intentionally gates broad automation until that evidence is present for the active client path.
