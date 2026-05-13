---
title: Device iterative validation loop
date: 2026-05-02
category: development
module: scripts/device/*
---

## What this is

A two-machine dev loop where Korri's API server and input daemon run on the AYN Device 2 Portal
(so real `runemu.sh` launches against the real ROCKNIX library on the
handheld screen, controller/system input is read from `/dev/input/event*`, and the renderer still consumes the native input WebSocket endpoint) and the renderer runs on the dev machine under Vite (for
instant HMR). Vite proxies `/api/*` directly to the device over Tailscale.

This is "Level 2" of the deployment ladder.

Level 3 is the supervised Chromium session: the renderer runs on the Device in ROCKNIX-native Chromium for GPU acceleration, while `korri-sessiond` owns the Sway/Chromium/emulator lifecycle so Chromium returns as the focused fullscreen Korri surface after a game exits.

## Prerequisites

- SSH key auth to the Device, no password. Default target is `root@sm8550` via Tailscale MagicDNS.
- Device reachable over Tailscale. If MagicDNS is unavailable, set `DEVICE_HOST=root@100.84.208.48` or the current Device tailnet IP.
- EmulationStation **must be running** on the device when you bootstrap so
  the Wayland session env can be harvested from its `/proc/<pid>/environ`.
- `rsync`, `ssh`, `curl`, and `bun` on the dev machine.
- The Device doesn't need `tmux` for the dev loop: the API and Korri input daemon run as
  detached `setsid` processes that survive SSH disconnects. `just install-device` also installs `korri-inputd.service` so input ownership survives reboot before ROCKNIX `input.service` is masked.

Optional overrides (all read by the recipes):

| env var | default |
|---|---|
| `DEVICE_HOST` | `root@sm8550` |
| `DEVICE_APP_ROOT` | `/storage/.guest/korri/app` |
| `DEVICE_API_PORT` | `3001` |
| `DEVICE_INPUT_BRIDGE_PORT` | `3002` |
| `DEVICE_API_BASE_URL` | derived from `DEVICE_HOST` + `DEVICE_API_PORT` |
| `DEVICE_INPUT_BRIDGE_URL` | derived from `DEVICE_HOST` + `DEVICE_INPUT_BRIDGE_PORT` |

## Install/update

```bash
just install-device
```

What it ensures, idempotently:

1. Verifies SSH reachability.
2. Installs the latest aarch64 Bun to `/storage/bin/bun`.
3. Adds `/storage/bin` and `/storage/.nix-profile/bin` to PATH via
   `/storage/.profile`.
4. `rsync`s the project to `$DEVICE_APP_ROOT`, excluding `node_modules`,
   `out`, `.worktrees`, `.direnv`, `.tanstack`, `.git`, `.nix-bin`,
   the device's own `.env`, and Korri-owned device media under
   `$DEVICE_APP_ROOT/media`.
5. Runs `bun install` on the device (aarch64 native deps).
6. Reads `WAYLAND_DISPLAY` / `XDG_RUNTIME_DIR` / `DISPLAY` /
   `DBUS_SESSION_BUS_ADDRESS` / `XDG_SESSION_TYPE` from the live
   `emulationstation` process and writes them plus
   `KORRI_ROCKNIX_GAMELIST_ROOTS=/storage/roms` to
   `$DEVICE_APP_ROOT/.env`.
7. Installs or updates `/storage/bin/korri-session-toggle`. The old standalone `korri-toggle-daemon` is removed; the `L3+R3+Start` toggle chord is owned by Korri inputd.
8. Installs/restarts `korri-inputd.service`, checks its native input endpoint, then stops/masks ROCKNIX `input.service` so there is only one input policy owner. `inputplumber.service` remains required for controller normalization.

Run this on first setup and any time the Device-installed tooling should be refreshed.

If step 6 fails because EmulationStation isn't running, boot ROCKNIX so
its Sway session is alive, then re-run the recipe. As a fallback you can
hand-author `$DEVICE_APP_ROOT/.env` with at least `WAYLAND_DISPLAY` and
`XDG_RUNTIME_DIR` and re-run `bun install` manually.

## Daily loop

```bash
just dev-device
```

What you should see:

- Renderer at `http://localhost:3000` on the dev machine.
- The home rail populated by real games from the developer's Device
  (everything ROCKNIX has scraped a `gamelist.xml` for under
  `/storage/roms/<system>/`), sorted `lastPlayed` desc with the most
  recently played leftmost.
- Pressing **confirm** on a tile spawns the real `runemu.sh` and the
  game appears on the handheld screen.

Ctrl-C stops local Vite. The remote API and Korri input daemon processes keep running (they are in their own `setsid` sessions, detached from the SSH channel), so the next `just dev-device` simply replaces them in place.

## Editing server code

Save the file, then either:

- run `just dev-device` again (it always re-syncs and replaces the remote
  API and Korri input daemon processes), or
- run `just sync-device` and then restart the API in place:

  ```bash
  ssh "$DEVICE_HOST" "pkill -f 'bun run tools/http/server.ts'; \
    setsid bash -c 'exec /storage/.guest/korri/app/scripts/device/run-api.sh \
      >> /storage/.guest/korri/logs/api.log 2>&1 < /dev/null' & disown"
  ```

## Editing renderer code

Save and Vite HMRs the dev machine browser. No remote action required.

## Where logs live

- API server stdout/stderr: appended to `/storage/.guest/korri/logs/api.log` on
  the device.

  ```bash
  ssh "$DEVICE_HOST" tail -f /storage/.guest/korri/logs/api.log
  ```

- Korri input daemon stdout/stderr: appended to `/storage/.guest/korri/logs/inputd.log` on
  the device.

  ```bash
  ssh "$DEVICE_HOST" tail -f /storage/.guest/korri/logs/inputd.log
  ```

- Vite dev server: in the foreground terminal running `just dev-device`.

## Tearing down

- Local side only: Ctrl-C the foreground recipe. Vite stops; the device keeps serving.
- Whole loop: also `ssh "$DEVICE_HOST" "pkill -f 'bun run tools/http/server.ts'; pkill -f 'bun run tools/device/inputd.ts'"`.
- Roll back input ownership: `ssh "$DEVICE_HOST" "/storage/.guest/korri/app/scripts/device/install-inputd-service.sh rollback"` restores ROCKNIX `input.service` and stops `korri-inputd`.

## Smoke check

```bash
just check-device
```

Hits the device directly at `DEVICE_API_BASE_URL` and `DEVICE_INPUT_BRIDGE_URL`, checks `/api/health`, `/api/rpc` `app.library.list`, and Korri inputd's gamepad subscription path, then exits non-zero with a clear log line if any check breaks. Equivalent to `just desktop-runtime-check` for this loop.

## Supervised renderer session (Level 3 + Layer 8 Electrobun candidate)

`korri-sessiond` is installed by `just install-device` and managed by `/storage/bin/korri-session-toggle`.

- `L3+R3+Start` still toggles Korri mode through `korri-inputd`.
- The toggle command talks to `korri-sessiond`; it no longer launches a renderer directly.
- `korri-sessiond` starts the configured renderer, repairs Sway fullscreen/focus while Korri is home, and runtime-masks `essway.service` only while Korri mode is active.
- The default renderer remains ROCKNIX-native Chromium because it is the current smooth GPU path.
- `KORRI_SESSION_RENDERER=electrobun` opts into the Layer 8 Electrobun candidate. That path must use real `/nix` / a Nix-managed `korri-desktop-device` app and pass `just check-device-electrobun`; the old portable/proot WebKit path is diagnostic-only.
- During a game launch, sessiond suspends renderer focus repair until the launch process exits, then relaunches the renderer fresh and reapplies the Sway invariant.
- The sessiond control API is loopback-only and guarded by `/storage/.guest/korri/sessiond.token`.

Useful commands:

```bash
just device-sessiond-status
just check-device-sessiond
just device-desktop-preflight
KORRI_SESSION_RENDERER=electrobun just check-device-electrobun
ssh "$DEVICE_HOST" "/storage/bin/korri-session-toggle start"
ssh "$DEVICE_HOST" "/storage/bin/korri-session-toggle stop"
```

Recovery if Korri mode gets stuck:

```bash
ssh "$DEVICE_HOST" "cd /storage/.guest/korri/app && scripts/device/install-sessiond-service.sh rollback"
```

Electrobun remains an opt-in renderer candidate until it passes GPU acceptance on-device without cairo/compositing-disabled fallback flags. If it fails at WebKit/EGL/GBM under real `/nix`, the next fix belongs in the ROCKNIX/WebKit runtime layer rather than Korri launch-script tuning.

## Input ownership

Korri inputd owns:

- renderer native input streaming over the existing WebSocket contract
- kill-current-game (`L1+R1+Select+Start`) through `/tmp/.process-kill-data`
- Korri session toggle (`L3+R3+Start`) through `/storage/bin/korri-session-toggle`
- retained system actions: volume, brightness, power/lid, and screen switch via `/usr/bin/screen_switch`

Korri intentionally does not carry forward `input_sense` screenshots, game guide, MangoHud toggle, or touchscreen-keyboard shortcuts.

ROCKNIX still provides launcher scripts and `/tmp/.process-kill-data`, `/usr/bin/screen_switch`, and `inputplumber.service`.

## Known limitations

- Level 3 supervised rendering depends on the configured renderer path and Sway window identity; both are configurable because ROCKNIX updates may change them.
- The default daily loop still runs the renderer on the dev machine; Level 3 is an explicit supervised session path.
- `runemu.sh` blocks until the game exits, so the launching RPC sits open
  for the duration of gameplay. Documented in
  `korri/shared/library/shell-launcher.ts`.
