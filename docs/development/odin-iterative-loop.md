---
title: Odin iterative validation loop
date: 2026-05-02
category: development
module: tools/scripts/odin-*
---

## What this is

A two-machine dev loop where Korri's API server runs on the AYN Odin 2 Portal
(so real `runemu.sh` launches against the real ROCKNIX library on the
handheld screen) and the renderer runs on the dev machine under Vite (for
instant HMR). Vite proxies `/api/*` directly to the device over Tailscale.

This is "Level 2" of the deployment ladder. Level 3 (renderer also running
on the Odin under a kiosk browser) is intentionally out of scope here.

## Prerequisites

- SSH key auth to the Odin, no password. Default target is `root@sm8550` via Tailscale MagicDNS.
- Odin reachable over Tailscale. If MagicDNS is unavailable, set `ODIN_HOST=root@100.84.208.48` or the current Odin tailnet IP.
- EmulationStation **must be running** on the device when you bootstrap so
  the Wayland session env can be harvested from its `/proc/<pid>/environ`.
- `rsync`, `ssh`, `curl`, and `bun` on the dev machine.
- The Odin doesn't need `tmux` or any other supervisor: the API runs as
  a detached `setsid` process that survives SSH disconnects.

Optional overrides (all read by the recipes):

| env var | default |
|---|---|
| `ODIN_HOST` | `root@sm8550` |
| `ODIN_PROJECT` | `/storage/korri` |
| `ODIN_API_PORT` | `3001` |
| `ODIN_API_BASE_URL` | derived from `ODIN_HOST` + `ODIN_API_PORT` |

## Setup (run once)

```bash
just bootstrap-odin
```

What it does, idempotently:

1. Verifies SSH reachability.
2. Installs `/storage/bin/bun` (aarch64) if missing or broken.
3. Adds `/storage/bin` and `/storage/.nix-profile/bin` to PATH via
   `/storage/.profile`.
4. `rsync`s the project to `$ODIN_PROJECT`, excluding `node_modules`,
   `out`, `.worktrees`, `.direnv`, `.tanstack`, `.git`, `.nix-bin`,
   the device's own `.env`, and Korri-owned device media under
   `$ODIN_PROJECT/media`.
5. Runs `bun install` on the device (aarch64 native deps).
6. Reads `WAYLAND_DISPLAY` / `XDG_RUNTIME_DIR` / `DISPLAY` /
   `DBUS_SESSION_BUS_ADDRESS` / `XDG_SESSION_TYPE` from the live
   `emulationstation` process and writes them plus
   `KORRI_ROCKNIX_GAMELIST_ROOTS=/storage/roms` to
   `$ODIN_PROJECT/.env`.

If step 6 fails because EmulationStation isn't running, boot ROCKNIX so
its Sway session is alive, then re-run the recipe. As a fallback you can
hand-author `$ODIN_PROJECT/.env` with at least `WAYLAND_DISPLAY` and
`XDG_RUNTIME_DIR` and re-run `bun install` manually.

## Daily loop

```bash
just dev-odin
```

What you should see:

- Renderer at `http://localhost:3000` on the dev machine.
- The home rail populated by real games from the developer's Odin
  (everything ROCKNIX has scraped a `gamelist.xml` for under
  `/storage/roms/<system>/`), sorted `lastPlayed` desc with the most
  recently played leftmost.
- Pressing **confirm** on a tile spawns the real `runemu.sh` and the
  game appears on the handheld screen.

Ctrl-C stops local Vite. The remote API process keeps running (it's in its own `setsid` session, detached from the SSH channel), so the next `just dev-odin` simply replaces it in place.

## Editing server code

Save the file, then either:

- run `just dev-odin` again (it always re-syncs and replaces the remote
  API process), or
- run `just sync-odin` and then restart the API in place:

  ```bash
  ssh "$ODIN_HOST" "pkill -f 'bun run tools/http/server.ts'; \
    setsid bash -c 'exec /storage/korri/tools/scripts/odin-run-api.sh \
      >> /storage/korri-api.log 2>&1 < /dev/null' & disown"
  ```

## Editing renderer code

Save and Vite HMRs the dev machine browser. No remote action required.

## Where logs live

- API server stdout/stderr: appended to `/storage/korri-api.log` on
  the device.

  ```bash
  ssh "$ODIN_HOST" tail -f /storage/korri-api.log
  ```

- Vite dev server: in the foreground terminal running `just dev-odin`.

## Tearing down

- Local side only: Ctrl-C the foreground recipe. Vite stops; the device keeps serving.
- Whole loop: also `ssh "$ODIN_HOST" "pkill -f 'bun run tools/http/server.ts'"`.

## Smoke check

```bash
just check-odin
```

Hits the device directly at `ODIN_API_BASE_URL`, checks `/api/health` and `/api/rpc` `app.library.list`, and exits non-zero with a clear log line if either breaks. Equivalent to `just desktop-runtime-check` for this loop.

## Known limitations

- Level 3 (renderer on the device's screen under a kiosk browser) is not
  implemented here.
- The renderer still runs on the dev machine; cross-arch packaging is
  deferred.
- `runemu.sh` blocks until the game exits, so the launching RPC sits open
  for the duration of gameplay. Documented in
  `korri/shared/library/shell-launcher.ts`.
