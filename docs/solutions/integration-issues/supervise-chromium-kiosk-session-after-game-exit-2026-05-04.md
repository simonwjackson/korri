---
title: Supervise Chromium kiosk sessions instead of trusting kiosk flags after game exit
date: 2026-05-04
category: integration-issues
module: Odin Chromium session supervisor
problem_type: integration_issue
component: tooling
symptoms:
  - Chromium kiosk could render Korri fluidly on the Odin, but kiosk/chromeless state was not reliable after a game exited.
  - Electrobun/WebKit could be made to load, but scrolling felt less fluid than Chromium kiosk and GPU acceleration remained blocked by the mixed Nix/ROCKNIX graphics stack.
  - Direct Chromium toggle scripts launched the browser but did not own the full Sway, Chromium, EmulationStation, and emulator lifecycle.
root_cause: missing_workflow_step
resolution_type: tooling_addition
severity: high
related_components:
  - ROCKNIX Sway session
  - korri-inputd
  - app.library.launch
  - runemu.sh
tags: [odin, rocknix, chromium, kiosk, sway, sessiond, gpu, emulationstation]
---

# Supervise Chromium kiosk sessions instead of trusting kiosk flags after game exit

## Problem

Korri needs GPU-accelerated rendering on the AYN Odin 2 Portal under ROCKNIX. ROCKNIX-native Chromium provides that path, but launching Chromium with `--kiosk` alone is not enough to guarantee that Korri returns as a chromeless fullscreen surface after a game exits.

The fix is to make Korri own the session lifecycle with a small supervisor. Chromium becomes the renderer, not the session owner.

## Symptoms

- Chromium kiosk was the smooth rendering baseline, especially for game-list scrolling.
- After emulator handoff and exit, Chromium could lose the expected kiosk/chromeless feel.
- Electrobun/WebKit on the Odin required staged Nix WebKitGTK, `proot`, RPATH patching, and software/compositing-disabling flags; the result loaded but was not as fluid as Chromium.
- Re-enabling WebKit GPU/compositing paths failed with DRI/GBM/EGL errors or process aborts, confirming that the production path should not depend on the mixed Nix/WebKit/ROCKNIX Mesa stack.
- The old `/storage/bin/korri-session-toggle` directly stopped ES and launched Chromium, but it had no long-lived state machine for home/game/restoring modes.

## What Didn't Work

- **Relying on Chromium flags as the guarantee.** `--kiosk`, `--start-fullscreen`, and `--app=<url>` configure launch behavior, but they do not enforce an invariant after Sway focus changes, emulator takeover, browser restore UI, duplicate windows, or process crashes.
- **Continuing to optimize Electrobun/WebKit for the production GPU path.** WebKitGTK 2.44.3 avoided the white-screen EGL abort, but only with conservative rendering flags. Native DRI attempts either still reported GBM/render-node issues or aborted.
- **Letting the toggle command launch Chromium directly.** A shell toggle can start/stop a process, but it cannot safely coordinate Sway reconciliation, game-mode suspension, post-game Chromium relaunch, and authenticated launch delegation.
- **Killing broad process patterns during relaunch.** Earlier debugging showed that broad `pkill -f` patterns can match and kill the active SSH/session shell. Session ownership needs PID/window-aware control instead.

## Solution

Introduce a session supervisor (`korri-sessiond`) and route Odin launches through it when configured.

The important invariant is:

> When no game is running, exactly one Korri Chromium app window exists, it is focused, fullscreen, and pointed at the configured Korri URL.

The implementation added these pieces:

- `tools/odin/sessiond-state.ts` — pure state model for `stopped`, `starting`, `home`, `launching`, `game`, `restoring`, and `recovering`.
- `tools/odin/sessiond-chromium.ts` — builds the Chromium app/kiosk command, normalizes the dedicated profile, and launches/stops Chromium through injected process runners.
- `tools/odin/sessiond-sway.ts` — parses Sway tree/window events and builds focus/fullscreen/borderless repair commands.
- `tools/odin/sessiond.ts` — loopback-only daemon that starts/stops Korri mode, masks/restores `essway.service`, runs launch specs, and restores Chromium after game exit.
- `korri/shared/library/session-launcher.ts` — optional launcher implementation selected by `KORRI_SESSIOND_URL`, so Odin launch RPCs go through the supervisor while non-Odin runs keep using the shell launcher.
- `scripts/odin/run-sessiond.sh` and `scripts/odin/install-sessiond-service.sh` — `/storage`-owned service wrapper and installer.
- `scripts/odin/install-korri-toggle.sh` — keeps the existing toggle command contract, but delegates `start|stop|toggle|status` to sessiond instead of launching Chromium directly.
- `tools/odin/sessiond-smoke.ts` and `scripts/odin/smoke-sessiond.sh` — explicit smoke check for the supervised home invariant.

Sessiond uses a protected local capability token (`/storage/korri/sessiond.token`) for control and launch requests. Loopback-only HTTP is not treated as sufficient because the daemon can launch arbitrary `LaunchSpec` commands.

The high-level lifecycle is:

```text
Korri mode start:
  runtime-mask essway.service
  launch Chromium with dedicated Korri profile
  verify/repair Sway fullscreen + focus

Game launch:
  API app.library.launch -> SessionLauncher -> korri-sessiond /launch
  stop or park Chromium
  suspend home invariant repair
  run runemu.sh / emulator and wait for exit
  relaunch Chromium fresh
  repair Sway fullscreen + focus

Korri mode stop:
  stop Chromium
  unmask/restart essway.service
```

The session-aware launcher fails closed. If `KORRI_SESSIOND_URL` is configured but sessiond is unreachable or rejects the token, the launcher returns a structured launch failure and does **not** silently fall back to direct `runemu.sh`, because that would bypass the kiosk guarantee.

## Why This Works

The underlying issue is ownership. A kiosk flag tells Chromium how to start, but it does not make Chromium the owner of the compositor session. On ROCKNIX, the visible session is a negotiation among Sway, EmulationStation (`essway.service`), Chromium, the Korri API process, input policy, and the emulator launched by `runemu.sh`.

`korri-sessiond` makes the lifecycle explicit:

- **Home mode** enforces the Chromium/Sway invariant.
- **Game mode** intentionally suspends Chromium focus repair so the emulator can own the screen.
- **Restoring mode** relaunches Chromium fresh after the emulator exits instead of trusting the old browser window to preserve state.
- **Stop mode** restores EmulationStation through the same reversible `essway.service` runtime-mask pattern documented previously.

This also preserves GPU acceleration. The renderer is ROCKNIX-native Chromium, so it uses the device's coherent system graphics stack instead of mixing Nix WebKitGTK with ROCKNIX Mesa through `proot`.

## Prevention

- Treat kiosk/chromeless mode as a **session invariant**, not a browser launch flag.
- Put the game launcher under the same supervisor that owns browser restoration; otherwise the process that knows the game exited cannot repair the UI session.
- Suspend browser focus repair while a game is running. A watchdog that always focuses Chromium will fight the emulator.
- Relaunch Chromium from a dedicated, normalized profile after game exit. This avoids crash-restore bubbles and stale window state.
- Keep `essway.service` runtime-masked only while Korri mode is active, and provide a rollback command that unmask/restarts it.
- Protect any local daemon that can launch commands with a token or local capability file, even if it binds only to `127.0.0.1`.
- Avoid broad `pkill -f` process cleanup in session scripts. Prefer stored PIDs, child handles, and Sway window IDs.

## Related Issues

- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` — prerequisite pattern for stopping ES without mutating ROCKNIX root.
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md` — explains why Electrobun/WebKit is not the production GPU path on the Odin today.
- `docs/solutions/integration-issues/reverse-ssh-tunnel-for-odin-chromium-vite-2026-05-03.md` — prior Chromium kiosk validation path.
- `docs/development/odin-iterative-loop.md` — now documents Level 2 dev loop and Level 3 supervised Chromium session.
- `docs/plans/2026-05-04-004-feat-odin-chromium-session-supervisor-plan.md` — implementation plan for this supervisor.
