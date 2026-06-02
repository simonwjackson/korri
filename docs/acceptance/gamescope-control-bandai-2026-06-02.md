# Gamescope Control Bandai Acceptance

Date: 2026-06-02
Status: accepted for v1 control-plane productization; rerunnable harness added
Device: bandai (`ssh -p 2222 root@bandai`)
Display/capture: physical `DSI-2` via `grim`

## What this acceptance proves

- Gamescope can own upscale when launched with a smaller inner Xwayland mode and larger physical output.
- FSR/filter and sharpness can be changed live through non-hotkey control paths.
- Xwayland/internal mode can be changed live without restarting the app or reconnecting the stream.
- A live app can observe and redraw to the new native Xwayland size with the same app PID.
- The v1 Korri Gamescope bridge can drive hello/state/filter/sharpness/mode controls on a clean Bandai session.

## Evidence already captured

### Local FSR/control proof

Label: `gamescope-local-ffplay-grid-fsr-102004`

- Source/app/X root/window: `640x360`.
- Physical captures: `1920x1080` on `DSI-2`.
- `GAMESCOPE_FSR_FEEDBACK`: `0/absent -> 1 -> 0`.
- Captures:
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/01-linear-grid.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/02-fsr-sharp0-grid.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/03-fsr-sharp20-grid.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/04-linear-return-grid.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/05-fsr-sharp20-repeat.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/06-fsr-sharp0-repeat.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004/07-fsr-sharp20-return.png`

### Live Xwayland mode swap proof

Label: `gamescope-local-ffplay-grid-fsr-102004-mode-swap`

Sequence: `640x360 -> 960x540 -> 1280x720 -> 640x360`.

- Control path: `GAMESCOPE_XWAYLAND_MODE_CONTROL` / bridge equivalent.
- FSR stayed active during swaps.
- Captures:
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004-mode-swap/00-before.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004-mode-swap/01-960x540.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004-mode-swap/02-1280x720.png`
  - `/tmp/gamescope-local-ffplay-grid-fsr-102004-mode-swap/03-640x360-return.png`

### Native redraw proof

Label: `gamescope-native-redraw-mode-swap-102832`

Same app PID: `2672`.

Captures visibly showed the running app redrawing with:

- `WINDOW 640x360 / ROOT 640x360 / PID 2672`
- `WINDOW 960x540 / ROOT 960x540 / PID 2672`
- `WINDOW 1280x720 / ROOT 1280x720 / PID 2672`

Captures:

- `/tmp/gamescope-native-redraw-mode-swap-102832/00-640x360-before.png`
- `/tmp/gamescope-native-redraw-mode-swap-102832/01-960x540.png`
- `/tmp/gamescope-native-redraw-mode-swap-102832/02-1280x720.png`
- `/tmp/gamescope-native-redraw-mode-swap-102832/03-640x360-return.png`

### v1 bridge proof on clean Bandai

Label: `gamescope-control-v1-validate-111955-v1-api`

Validated through the bridge/API:

- `hello`
- `state`
- `filter fsr`
- `sharpness 0`
- mode swaps `640x360 -> 960x540 -> 1280x720 -> 640x360`
- `FSR feedback = true`

Captures:

- `/tmp/gamescope-control-v1-validate-111955-v1-api/00-initial-640x360.png`
- `/tmp/gamescope-control-v1-validate-111955-v1-api/01-api-960x540.png`
- `/tmp/gamescope-control-v1-validate-111955-v1-api/02-api-1280x720.png`
- `/tmp/gamescope-control-v1-validate-111955-v1-api/03-api-640x360-return.png`

## Rerun command

After a session starts `gamescope-control-bridge` with a socket at `/storage/probe-a-resolution/run/control.sock`, run:

```bash
bun tools/scripts/gamescope-control-bandai-acceptance.ts \
  --host bandai \
  --ssh-port 2222 \
  --socket /storage/probe-a-resolution/run/control.sock \
  --remote-root /tmp/gamescope-control-bandai-$(date +%H%M%S)
```

Dry-run the exact SSH commands without touching the device:

```bash
bun tools/scripts/gamescope-control-bandai-acceptance.ts --dry-run
```

## Acceptance criteria

A fresh run passes when:

- `hello` and both `state` calls complete through the Unix socket.
- Filter changes to FSR and sharpness changes to `0` report `applied` or a clearly documented non-success result.
- Captures exist for before, FSR sharpness, `960x540`, `1280x720`, and return-to-`640x360`.
- Captures are from physical `DSI-2`; logs alone do not prove visual/product behavior.
- Any backend timeout, backend unavailable, capture failure, or readback mismatch is categorized separately.

## Notes

Generated images stay out of normal commits unless explicitly archived. This document records paths and rerun procedure so future hardware validation can reproduce the same evidence envelope.
