---
title: Stop Steam ARM64 stable self-update relaunch loops on Bandai
date: 2026-06-27
category: runtime-errors
module: Korri Steam ARM64 runtime
problem_type: runtime_error
component: tooling
symptoms:
  - "Steam repeatedly logs `uninstalled manifest found` and `Update complete, launching Steam` without reaching a usable client."
  - "Bandai only shows the Korri UI or a blank Sway workspace while Steam update helper processes run."
  - "The Steam service exits with status 42 after an update pass, then restarts into another update pass."
  - "The installed and remote `steamdeck_stable` versions can match while Steam still reinstalls the same pending package."
root_cause: config_error
resolution_type: environment_setup
severity: high
related_components:
  - "korri-steam-guest"
  - "korri-steam-seed.service"
  - "Sway compositor visibility"
tags: [steam, arm64, bandai, nixos, steamdeck-stable, self-update, gamescope]
---

# Stop Steam ARM64 stable self-update relaunch loops on Bandai

## Problem

Bandai's mutable Steam ARM64 client can get stuck reinstalling the same Steam client update on every launch. The user-visible result is confusing: the screen keeps showing Korri or black, while Steam only runs its updater and never reaches a normal Steam window.

This is not caused by Korri hiding Steam once the direct `korri-steam-guest` path is used and the Korri GUI is killed. In the observed Bandai spike, Sway had no Steam window mapped because Steam was still inside the updater/relaunch phase.

## Symptoms

- Steam logs repeat:

  ```text
  Downloaded new manifest: /steam_client_steamdeck_stable_linuxarm64 version 1782533657, installed version 1782533657, existing pending version 0
  uninstalled manifest found in /var/lib/korri/steam/package/steam_client_steamdeck_stable_linuxarm64 (1).
  Extracting package...
  Installing update...
  Cleaning up...
  Update complete, launching Steam...
  Shutdown
  ```

- The transient spike service exits with `status=42` after the update pass.
- With `Restart=on-failure`, the transient service restarts, but Steam repeats another update pass instead of settling.
- Sway's tree shows only the workspace and no Steam client window:

  ```text
  name: "DSI-2"
  name: "1"
  focused: true
  ```

- `steamrtarm64/steam` updates to the current stable binary, but the loop can persist:

  ```text
  package/beta = steamdeck_stable
  steam_client_steamdeck_stable_linuxarm64.manifest version = 1782533657
  steam_client_steamdeck_stable_linuxarm64.installed present
  ```

## What Didn't Work

- **Treating ARM64 as requiring `publicbeta`.** Validation showed Valve currently publishes `steam_client_steamdeck_stable_linuxarm64`; generic `steam_client_linuxarm64` is missing, but `publicbeta` is not required.
- **Partially rolling back only `steamrtarm64/steam`.** Replacing only the core binary left Bandai with a mixed Steam tree and did not fix thread/synchronization crashes.
- **Launching with update suppressors during recovery.** Flags such as `-nobootstrapupdate`, `-skipinitialbootstrap`, and `-norepairfiles` prevent Steam from completing the repair pass after the mutable tree has drifted.
- **Assuming Korri was covering Steam.** After killing the Korri GUI and checking active Sway rules, there was no Steam-specific scratchpad/hide rule. Steam simply had not mapped a normal client window yet.
- **Using a non-restarting transient service for update passes.** Steam's `Update complete, launching Steam` exit needs either Steam's own restart wrapper or a service restart. A one-shot `systemd-run` exits before the real client appears.
- **Running `steam-guest-runtime-prep --apply` before every client start.** This rewrote Steam Runtime / pressure-vessel files under Steam-owned directories. Steam then detected wrong installed-file sizes and repaired/relaunched on every startup.

## Solution

Use the model where NixOS owns the launcher, permissions, Proton runtimes, and pre-start VDF/config writing, while Steam owns its mutable client folder.

On current Korri builds, use the explicit recovery helper instead of hand-editing package state:

```sh
korri-steam-recover
```

The helper stops the managed Steam services, backs up `package/`, writes the configured channel to `package/beta`, removes only the configured channel's pending marker, and clears stale Valve IPC shared-memory handles. It does not remove `.installed` or `.manifest` metadata.

For older builds without the helper, start by stopping all Steam entry points and removing stale shared-memory handles:

```sh
systemctl stop korri-steam-gamescope.service || true
systemctl stop korri-steam.service || true
systemctl stop korri-steam-stable-spike.service || true
pkill -TERM -f steamwebhelper || true
pkill -TERM -f steamrtarm64/steam || true
pkill -TERM -f gamescope || true
rm -f /dev/shm/u0-ValveIPCSharedObj-Steam /dev/shm/u2000-ValveIPCSharedObj-Steam
```

Set the ARM64 client channel to Steam Deck stable, not the generic ARM channel and not public beta by default:

```sh
printf 'steamdeck_stable\n' >/var/lib/korri/steam/package/beta
```

Keep the stable installed and manifest files:

```text
/var/lib/korri/steam/package/steam_client_steamdeck_stable_linuxarm64.installed
/var/lib/korri/steam/package/steam_client_steamdeck_stable_linuxarm64.manifest
```

If Steam keeps reporting an already-installed version as an `uninstalled manifest`, remove only the stale pending marker and let Steam start again:

```sh
cp -a /var/lib/korri/steam/package \
  /var/lib/korri/steam/package.backup-before-pending-marker-clear-$(date +%Y%m%d%H%M%S)
rm -f /var/lib/korri/steam/package/steam_client_steamdeck_stable_linuxarm64
```

Normal managed startup now avoids `steam-guest-runtime-prep --apply` and treats Steam's exit-42 relaunch as restartable. If you are still doing a manual repair spike, launch Steam directly, without GamepadUI and without update suppressors, so it can finish any remaining self-repair:

```sh
systemd-run \
  --unit=korri-steam-stable-spike \
  --property=User=korri \
  --property=Group=korri \
  --property=SupplementaryGroups=korri-steam-input \
  --property=WorkingDirectory=/var/lib/korri/steam \
  --property=LimitNOFILE=524288 \
  --property=Restart=on-failure \
  --property=RestartSec=2 \
  --setenv=HOME=/home/korri \
  --setenv=USER=korri \
  --setenv=STEAM_HOME=/var/lib/korri/steam \
  --setenv=STEAM_GAMES_ROOT=/var/lib/korri/content/games/steam \
  --setenv=STEAM_DOT=/home/korri/.steam \
  --setenv=FEX_ROOTFS=/var/lib/korri/steam/fex-rootfs \
  --setenv=XDG_RUNTIME_DIR=/run/user/2000 \
  --setenv=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/2000/bus \
  --setenv=WAYLAND_DISPLAY=wayland-1 \
  --setenv=DISPLAY=:0 \
  --setenv=PULSE_SERVER=unix:/run/user/2000/pulse/native \
  /run/current-system/sw/bin/korri-steam-guest -steamos3 -steampal -steamdeck
```

For visibility debugging, remove Korri from the screen and verify Steam is not being hidden by Sway:

```sh
uid=2000
sock=$(find /run/user/$uid -maxdepth 1 -name 'sway-ipc.*.sock' -type s | head -1)
XDG_RUNTIME_DIR=/run/user/$uid WAYLAND_DISPLAY=wayland-1 SWAYSOCK=$sock \
  swaymsg '[title="Korri"] kill'

grep -RInE 'steam|scratchpad|move.*scratchpad|hide' \
  /nix/store/*korri-compositor-sway.conf /etc/sway /home/korri/.config/sway 2>/dev/null || true
```

The expected healthy outcome is that Steam stops reinstalling the pending package, `steamwebhelper` stays alive, and Sway gains a Steam window or the service can act as a hidden broker for later AppID forwarding.

## Why This Works

Steam's Linux updater uses files under `package/` to decide whether a client package is installed, pending, or needs to be applied. The log line:

```text
uninstalled manifest found .../package/steam_client_steamdeck_stable_linuxarm64 (1)
```

means Steam found a pending package marker, not just the installed-version manifest. If that marker survives after `Update complete, launching Steam`, Steam can reinstall the same already-current package every launch.

The stable ARM64 manifest is valid today:

```text
https://client-update.fastly.steamstatic.com/steam_client_steamdeck_stable_linuxarm64
```

The generic ARM64 manifest is not valid:

```text
https://client-update.fastly.steamstatic.com/steam_client_linuxarm64  # 404
```

So the durable policy is to keep Steam on an explicit ARM64-capable channel such as `steamdeck_stable`, let Steam update its own mutable folder, and keep Korri focused on pre-start environment and VDF preparation.

## Prevention

- Default Korri's ARM64 Steam channel to `steamdeck_stable` unless there is a deliberate reason to opt into `publicbeta`.
- Do not run update-suppressing launch flags while recovering a broken mutable Steam tree.
- Treat `status=42` plus `Update complete, launching Steam` as a relaunch request, not necessarily as the final failure.
- Keep the Steam client folder mutable and Steam-owned; declare Proton runtimes and VDF state from Nix/Korri before startup.
- Use `korri-steam-recover` for package-marker recovery instead of hand-removing files.
- Keep `steam-guest-runtime-prep --apply` out of normal startup. It is an explicit legacy/manual repair path only.
- During foreground debugging, kill the Korri GUI and verify Sway has no Steam-specific scratchpad/hide rule before blaming visibility.

## Related Issues

- ValveSoftware/steam-for-linux#2502 — matching Linux updater loop shape with `uninstalled manifest found` and `Update complete, launching Steam`.
- ValveSoftware/steam-for-linux#6492 — Steam runtime/bootstrap repair case where a missing runtime folder caused repeated update/startup failure.
- Steam Client Beta discussion “Update Loop on Linux After Enabling Proton for all Games” — matching public beta loop where Steam repeatedly found `steam_client_publicbeta_ubuntu12` pending.
- `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` — earlier ROCKNIX ARM64 note on recreating the ARM64 Steam client manifest before desktop launch.
