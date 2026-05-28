---
title: Kiosk renderer ownership belongs to sessiond, not the compositor
last_updated: 2026-05-27
date: 2026-05-27
category: architecture-patterns
module: nix/images + nix/modules + tools/device/sessiond
problem_type: architecture_pattern
component: device
severity: high
applies_when:
  - "A foreground-session supervisor (sessiond) exists, but the renderer is still launched by the windowing compositor"
  - "Two units want to own the same singleton process (Electrobun) and race each other"
  - "Migrating a renderer-launch path from `sway exec` to a systemd-sibling spawner"
  - "Empirical Sobo / RockNix kiosk deploys surface a chain of latent PATH / env / hardening gaps"
tags: [nix, nixos, sessiond, electrobun, sway, kiosk, korri, supervisor, lifecycle]
---

# Kiosk renderer ownership belongs to sessiond, not the compositor

## Context

Phase 4C of the foreground-session-lifecycle rollout (commit `7f4547a`
in `docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md`)
shipped a role-pluggable sessiond supervisor and stated that
"`kiosk role keeps today's Electrobun + essway + Korri-home behavior`."
That sentence was aspirational: on Sobo the kiosk image was still
launching Electrobun from `korri-compositor.service` via a sway
`exec --no-startup-id` line, and sessiond had never actually been
invoked end-to-end on a kiosk host.

When sessiond's NixOS module finally landed in the kiosk image (`2d333ff` →
`bce343a`), the two supervisors collided. `korri-compositor.service`
spawned an Electrobun via sway; `korri-sessiond.service`'s `enterIdle`
tried to spawn a SECOND Electrobun and failed with cascading errors
that masked each other.

This doc captures the architectural cut that resolves the collision
and the runtime contract sessiond's kiosk role actually needs.

## Problem

Two-supervisor ownership is broken by construction:

```
korri-compositor.service                korri-sessiond.service
  └─ sway                                  └─ enterIdle
      └─ exec --no-startup-id                  └─ realRendererController.launch()
          └─ korri-desktop-device                  └─ Bun.spawn("korri-desktop-device")
              └─ Electrobun #1                          └─ Electrobun #2  ⚠ race
```

The renderer is a singleton (it binds a port, writes a status file,
holds the foreground in sway). Two owners means: who kills it on
game launch? Who restores it on game exit? Who reaps an orphan? The
TypeScript role (`createKioskSessionRole`) is already designed for
single-owner sessiond, but that design is meaningless if a second
spawner (the compositor) keeps an unmanaged Electrobun alive in
parallel.

## Solution

Move renderer-launch ownership entirely to sessiond. The compositor
becomes Sway-only. Concretely:

1. **Sessiond owns the renderer process tree.** `enterIdle` spawns
   Electrobun via `realRendererController` (`tools/device/sessiond-electrobun.ts`).
   `beforeChildLaunch` kills it before a game launch. `restoreIdleAfterLaunch`
   spawns it again after the child exits. `reconcileIdle` polls sway for
   matching windows so the supervisor can detect orphans.

2. **Compositor owns only Sway.** Delete `services.korri.compositor.kiosk.command`
   and `services.korri.compositor.kiosk.launcher` outright (zero-back-compat
   per [docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md]).
   Strip the kiosk-renderer env from the compositor unit's `sessionEnvironment`;
   sessiond carries it now.

3. **`services.korri.compositor.kiosk.enable` remains as the kiosk-shape
   selector.** It still auto-enables `client`, `cli`, and `input.inputd`;
   it just no longer auto-spawns the renderer.

## Why this is right (preserved invariants)

- **Server-as-source-of-truth, dumb-client renderer.** The renderer still
  only speaks to `korri-server` over RPC. Who supervises it is invisible
  to UI code.
- **One foreground-session owner per host** (origin R14). The compositor-as-
  spawner shape violated this; the sessiond-owns shape restores it.
- **Role-pluggable supervisor stays untouched.** Source-machine role
  (gamescope-bearing, no Electrobun) is unaffected. Kiosk role now
  actually drives what its TypeScript was designed to drive.

## What this actually requires on the kiosk image

The migration commit `cb7c973` shipped the architectural cut. Bringing
the cut to a working end-to-end state on Sobo took **eleven empirical
fixes** layered on top of it, each surfaced only by a real deploy
because each was masked by the previous failure. Document them as the
runtime contract every kiosk sessiond install has to satisfy:

| # | Gap | Fix | Commit |
|---|---|---|---|
| 1 | `services.korri.sessiond.path` only listed gamescope + retroarch + client; the renderer-resolve path calls `Bun.spawn(["sh", "-lc", ...])` which can't find `sh` | Add `pkgs.bashInteractive` to kiosk-image sessiond PATH | `6637ce5` |
| 2 | GTK fell through to X11 with empty DISPLAY (`Gtk-WARNING: cannot open display:`); WAYLAND_DISPLAY alone wasn't enough | Carry `XDG_SESSION_TYPE=wayland`, `XDG_CURRENT_DESKTOP=sway`, `DISPLAY=:0`, `DBUS_SESSION_BUS_ADDRESS` on the sessiond unit env; sway used to provide all of these to its exec children for free | `58ec066` |
| 3 | `/control/start` curl `--max-time 5` was shorter than the renderer's cold-cache startup; each retry spawned ANOTHER renderer, piling up tens of zombies | `--connect-timeout 1 --max-time 30` so the retry loop addresses the bind race but not the server-side stall | `3bc159e` |
| 4 | Renderer stdout/stderr were piped to `Bun.file(path)` which truncates on open; every spawn wiped the previous child's diagnostic before flushing | Append-mode FD via `fs.openSync(path, "a")` so multi-spawn loops accumulate | `70ea2e7` |
| 5 | Ad-hoc systemd drop-ins for `KORRI_ELECTROBUN_LOG` evaporated on reboot (ROCKNIX `/etc` is read-only, `/run/systemd` is tmpfs) | Bake `KORRI_ELECTROBUN_LOG` into the kiosk image's sessiond env so the log survives reboots and is ready for any future investigation | `7f4547a` |
| 6 | Sessiond's `ProtectSystem=strict` mounts `/storage` read-only; the renderer's status.json, persistent log, and XDG state all live under `compositor.home` (= `/storage` on Sobo); every renderer spawn died with EROFS on its first persistent write | Add `ReadWritePaths = [ compositorCfg.home ]` to sessiond's serviceConfig on the kiosk image — carves a hole in the hardening without disabling it | `c001efb` |
| 7 | Kiosk role's `reconcileIdle` shells out to `swaymsg`; sway's package wasn't on sessiond's PATH | Add `compositorCfg.sway.package` to the kiosk-image sessiond PATH | `70674dd` |
| 8 | Even with `swaymsg` on PATH, it refused to run with "Unable to retrieve socket path"; sessiond runs as a sibling of sway and doesn't inherit `SWAYSOCK` | Discover SWAYSOCK at spawn time in `realSwayController.run` by globbing `$XDG_RUNTIME_DIR/sway-ipc.*.sock` | `4679ac3` |
| 9 | Shell launcher hardcodes `setsid` to detach the spawned child into its own session/process group; `util-linux` wasn't on sessiond's unit PATH | Bake `pkgs.util-linux` into the module's default unit path (not the user-toggleable `cfg.path`) — sessiond's shell launcher cannot run without it | `7437082` |
| 10 | sessiond's `Bun.serve` default `idleTimeout: 10s` closed the long-lived `/managed-launch/events` SSE stream during quiet launches; the launcher's `observe()` misread the close as launch failure and SIGTERM'd the live gamescope process group ~15-24s in. Looked like a gamescope crash; was sessiond killing its own supervised process. See [runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27](../runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md). | SSE heartbeats every 5s on the lifecycle stream + `idleTimeout: 0` on `Bun.serve` as defense in depth + bounded reconnect loop in `observe()` (5 attempts × 200ms backoff) | `f6783e2` |
| 11 | `composeGamescopeLaunchSpec` emitted `gamescope -f -b -- <child>` with no `--backend`. Gamescope's `auto` picked `drm` and looped forever trying to take DRM master from sway (`[libseat] Could not make device fd drm master: Device or resource busy`). Game audio worked; no frames ever reached the panel. See [runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27](../runtime-errors/gamescope-backend-auto-fights-sway-for-drm-master-2026-05-27.md). | First-class `GamescopePolicy.backend` cascade field with default `backend: "wayland"` for nested deployments; composer emits `--backend <value>` strictly from policy | `0854900` |

These are the runtime invariants the kiosk image / sessiond module / TS
code must collectively satisfy. The SM8550 config check
(`nix/tests/korri-rocknix-sm8550-config-check.nix`) and the sessiond
module check (`nix/tests/korri-sessiond-module-check.nix`) guard most of
them at eval time so a future regression fails at `nix build` rather
than at the device's white-flash-every-10-seconds boot loop.

## How a missed fix manifests at runtime

When sessiond's `enterIdle` -> renderer.launch sequence fails, the
visible symptom on the kiosk is **sway up with a black screen, broken
by a brief white flash every ~10 seconds**. That cadence matches
`waitForStatusFile`'s default timeout: spawn → renderer briefly draws a
window → renderer dies (for whatever Layer-N reason) → timeout fires
→ `/control/start` returns 500 → curl retry → spawn again. The flash is
the renderer's GTK window briefly appearing before it crashes.

The systemd-managed renderer log (`KORRI_ELECTROBUN_LOG`, baked into
kiosk.nix via fix #5) is the only diagnostic that survives the loop.
`journalctl -u korri-sessiond` shows the *sessiond-side* failure but
not the renderer's stderr, because the spawn redirects child stdio to
the log path (#4).

## Operator runbook (post-migration)

| Symptom | First-stop diagnostic |
|---|---|
| No UI on screen | `systemctl status korri-sessiond` (was: korri-compositor) |
| 10-second white-flash loop | `tail -200 /storage/.local/state/korri/electrobun.log` |
| `sessiond request failed` in journal | grep stack trace for `enterHome`/`reconcileIdle`; the function name names the missing piece |
| Renderer up but launch fails | `journalctl -u korri-sessiond | grep 'shell-launcher: launched'` for exit-code + stderrTail |
| Federation visible but local UI missing | sessiond's `/control/start` ExecStartPost timed out — `systemctl reset-failed korri-sessiond && systemctl restart korri-sessiond` |

## Consequences

- **The renderer process tree's parent moved.** Pre-migration: child of
  sway, in `korri-compositor.service` cgroup. Post-migration: child of
  bun, in `korri-sessiond.service` cgroup. `KillMode=control-group`
  (systemd default) handles orphan reaping on sessiond restart.

- **Boot-window posture changed.** Sway comes up first (black screen),
  sessiond comes up shortly after, sessiond's `enterIdle` spawns the
  renderer (~2-4s after sway). Operators looking at "no UI" should now
  look at sessiond first, not compositor.

- **The `services.korri.compositor.kiosk.{command, launcher}` options
  are gone.** Any downstream pinning them gets an evaluation error.
  The only known in-tree consumer was the live-USB VM smoke test;
  it was migrated to override `services.korri.client.package` instead.

## Related work

- Origin brainstorm: [docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md]
- Migration plan: [docs/plans/2026-05-27-004-feat-kiosk-renderer-ownership-sessiond-plan.md]
- Phase 4C source-machine plan: [docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md] (the "kiosk role keeps today's behavior" line this doc retires)
- Phase 4 adapter rollout: [docs/plans/2026-05-26-011-feat-foreground-session-adapter-rollout-plan.md]
- Hardening + ProtectSystem: [docs/solutions/integration-issues/supervise-chromium-kiosk-session-after-game-exit-2026-05-04.md]
- Wayland env on systemd units: [docs/solutions/integration-issues/one-command-odin-electrobun-deploy-needs-device-nix-and-session-env-2026-05-06.md]

## When this pattern generalizes

The same shape applies any time a singleton GUI process is being moved
from "compositor exec'd child" to "systemd-sibling spawned by a
supervisor unit". The sway-exec environment that the GUI used to
inherit transparently has to be **re-asserted on the supervisor unit's
declarative environment**, including:

- `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` (the wayland socket coordinates)
- `XDG_SESSION_TYPE`, `XDG_CURRENT_DESKTOP` (GDK backend selection)
- `DISPLAY` (Xwayland fallback paths used by sub-features like global hotkeys)
- `DBUS_SESSION_BUS_ADDRESS` (AT-SPI / dconf / portals)
- `SWAYSOCK` (discoverable at spawn time, not on the unit, since the
  PID varies)

And the supervisor's filesystem hardening has to be relaxed
(`ReadWritePaths`) for every persistent path the GUI process writes —
status files, logs, XDG state, app-specific caches.
