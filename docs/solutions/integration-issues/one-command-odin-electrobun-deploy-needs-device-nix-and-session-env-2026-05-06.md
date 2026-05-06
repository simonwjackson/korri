---
title: One-command Odin Electrobun deploy needs device Nix and session env
date: 2026-05-06
category: integration-issues
module: scripts/odin + tools/odin/sessiond
problem_type: integration_issue
component: development_workflow
symptoms:
  - "ODIN_HOST=root@thor just deploy-odin failed with: nix is missing on the device"
  - "After installing the app, /control/start returned HTTP 500 because Electrobun did not write status.json"
  - "sessiond reconcile failed with swaymsg Unable to retrieve socket path"
  - "Electrobun logs showed Gtk-WARNING: cannot open display"
root_cause: incomplete_setup
resolution_type: tooling_addition
severity: medium
related_components:
  - tooling
tags: [odin, thor, electrobun, nix, systemd, sway, deploy, sessiond]
---

# One-command Odin Electrobun deploy needs device Nix and session env

## Problem

Korri needed a single command to make Thor match the current working tree for supervised Electrobun testing:

```bash
ODIN_HOST=root@thor just deploy-odin
```

The first version synced the repo and attempted to reinstall the Nix-managed `korri-desktop-odin` app, but validation exposed two device-environment gaps: Thor's Nix binary was available only through `/storage/.nix-portable/bin`, and the systemd-launched session supervisor did not reliably export the display/Sway environment required by Electrobun and `swaymsg`.

## Symptoms

- `just deploy-odin` failed during the app reinstall step with:

  ```text
  nix is missing on the device; cannot install .#korri-desktop-odin
  ```

- After adding a Nix path and rebuilding the app, session start failed:

  ```text
  curl: (22) The requested URL returned error: 500
  Electrobun did not write status file: /storage/.local/share/nix-apps/korri-electrobun/status.json
  ```

- Reconcile failed because the supervisor could not talk to Sway:

  ```text
  swaymsg/main.c:509] Unable to retrieve socket path
  ```

- Electrobun's own log showed the display env was missing for GTK:

  ```text
  Gtk-WARNING **: cannot open display:
  ```

## What Didn't Work

- **Only wrapping `sync-odin` and `install-odin`.** `install-odin` refreshes Bun, repo files, action scripts, Sway layout, and systemd services, but it does not update the Nix profile app at `/storage/.nix-profile/bin/korri-desktop-odin`. UI bundle changes can therefore be absent even when services are current.
- **Assuming `nix` is on root's SSH PATH.** On Thor, non-login SSH commands had `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. The Nix executable existed at `/storage/.nix-portable/bin/nix` and in `/nix/store/.../bin/nix`, but not on the default remote PATH.
- **Starting without stopping the existing Korri session.** Refreshing the profile and services while an old Electrobun process is still around can leave stale process/log/status state during validation. The deploy path should stop before refresh and start fresh afterward.
- **Relying only on harvested `.env`.** The harvested Wayland env can be minimal. If `DISPLAY` or `SWAYSOCK` are absent, GTK/Electrobun and `swaymsg` can fail even though `WAYLAND_DISPLAY` and `XDG_RUNTIME_DIR` are present.

## Solution

Add `deploy-odin` as the one-command convergence recipe and make the deploy script own the missing app-install step before refreshing services.

```just
# justfile
# Deploy the current repo, Electrobun app, and supervised Odin services for testing.
deploy-odin:
  scripts/odin/deploy.sh
```

The deploy script now:

1. probes SSH;
2. syncs the repo;
3. installs the current flake package into `/storage/.nix-profile`;
4. stops any existing Korri session;
5. runs the base Odin installer to refresh Bun, env, scripts, Sway layout, and services;
6. starts Korri fresh;
7. runs the sessiond smoke test.

The Nix step explicitly includes portable Nix on PATH and uses flakes/profile commands with experimental features enabled:

```bash
# scripts/odin/deploy.sh
export PATH="/storage/bin:/storage/.nix-portable/bin:/storage/.nix-profile/bin:$PATH"

nix_cmd() {
  nix --extra-experimental-features 'nix-command flakes' "$@"
}

nix_cmd profile remove --profile /storage/.nix-profile korri-desktop-odin >/dev/null 2>&1 || true
nix_cmd profile remove --profile /storage/.nix-profile korri-desktop >/dev/null 2>&1 || true

nix_cmd profile install --profile /storage/.nix-profile .#korri-desktop-odin
```

The deploy flow also stops and restarts the supervised session around the service refresh:

```bash
# scripts/odin/deploy.sh
ssh_odin '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true'
ODIN_HOST="$ODIN_HOST" ODIN_PROJECT="$ODIN_PROJECT" "$SCRIPT_DIR/install.sh"
ssh_odin '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true; /storage/bin/korri-session-toggle start >/dev/null'
```

Finally, the sessiond launcher now supplies stable display defaults after sourcing `/storage/korri/.env`:

```bash
# scripts/odin/run-sessiond.sh
export DISPLAY="${DISPLAY:-:0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/run/0-runtime-dir}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export SWAYSOCK="${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.0.sock}"
```

Validation passed with:

```bash
ODIN_HOST=root@thor just deploy-odin
```

and ended with:

```text
[sessiond-smoke] ok: electrobun renderer home invariant holds
[odin-deploy] Deploy complete.
```

## Why This Works

There are two distinct deployment surfaces on Thor before the future custom ROCKNIX image exists:

- mutable repo/service state under `/storage/korri`, `/storage/bin`, and `/storage/.config/systemd/system`;
- the Nix profile app that points `/storage/.nix-profile/bin/korri-desktop-odin` at a concrete `/nix/store/...-korri-desktop-1.0.0` build.

A service refresh alone cannot update the UI bundle because sessiond launches the Nix profile executable, not source files directly. Installing `.#korri-desktop-odin` from the synced repo before restarting sessiond makes the renderer binary and bundled portal match the working tree being tested.

The display defaults address the other half of the integration boundary. `korri-sessiond.service` is launched by systemd, not an interactive Sway shell, so it must carry enough Wayland/Sway environment for both children:

- Electrobun/GTK needs a display/runtime environment to create the native window and write `status.json`.
- `sessiond-sway` needs `SWAYSOCK` to run focus/fullscreen reconciliation commands.

Stopping first and starting after the install gives the smoke test a clean process, status-file, and service state to verify.

## Prevention

- Treat Thor deploy as convergence, not just sync: repo files, Nix profile app, `/storage/bin` action scripts, systemd units, and running session state all need to agree.
- Keep `just install-odin` as the base bootstrap/update primitive, but use `just deploy-odin` when testing the latest Electrobun UI on-device.
- In systemd wrappers that need Sway/WebKit/GTK, export conservative display defaults after sourcing the harvested `.env`; do not assume root's service environment has `DISPLAY` or `SWAYSOCK`.
- Validate deploy commands on the real device, not only with shell syntax checks. The failures here only appeared when Thor's actual SSH PATH and systemd environment were used.
- End deploy with a smoke check that proves the supervised home invariant, not just that files copied successfully.

## Related Issues

- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md` — broader Electrobun/WebKit runtime history, including the transition from portable/proot experiments toward a real `/nix` and Nix-managed `korri-desktop-odin` app.
- `docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md` — original session supervisor invariant and smoke-test pattern; now conceptually applies to the Electrobun renderer.
- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` — packaging background for the Nix-managed Electrobun desktop app.
- `scripts/odin/deploy.sh`, `scripts/odin/run-sessiond.sh`, `scripts/odin/install.sh`, and `scripts/odin/smoke-sessiond.sh` — current implementation entry points.
