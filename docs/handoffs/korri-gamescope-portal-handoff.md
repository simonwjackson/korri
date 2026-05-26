# Handoff — Gamescope portal blockage on Sobo / nix-on-rocks follow-up

## Next-session focus

Work in `../nix-on-rocks/` to find a substrate-level fix so Korri does **not** need the current `korri-gamescope-no-portal` workaround on ROCKNIX SM8550/Sobo.

The product requirement is clear: **Gamescope-wrapped apps are core to Korri and must work reliably.** The current Korri-side workaround proves the failure mode and restores Gamescope, but we should investigate whether nix-on-rocks can provide a clean kiosk session/portal environment instead.

## Repos / hosts

- Korri repo: `/home/simonwjackson/code/sandbox/korri`
- nix-on-rocks repo: `/home/simonwjackson/code/sandbox/nix-on-rocks`
- Sobo NixOS guest: `ssh -p 2222 root@sobo`
- Sobo ROCKNIX host: `ssh root@sobo`
- Source host: `ssh aka`

## Confirmed root cause

Client-side `gamescope -f -b -- moonlight ...` on Sobo was not failing because of Moonlight. Gamescope was blocking during its own nested Wayland/window startup before it created a Sway surface or promptly spawned the child.

Causal chain observed live:

1. Sobo kiosk session exports `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus`.
2. Gamescope starts and its Wayland/libdecor/desktop integration path contacts DBus.
3. Strace showed Gamescope calling:
   - object: `/org/freedesktop/portal/desktop`
   - interface-ish path: `org.freedesktop.portal.Desktop` / `org.freedesktop.portal.Settings`
   - method: `Read`
   - keys included `org.gnome.desktop.interface cursor-theme`, then `org.freedesktop.appearance color-scheme`.
4. `xdg-desktop-portal.service` in the guest is activatable but unhealthy/incomplete:
   - service stuck in `activating (start)`
   - logs: `Choosing gtk.portal ... as a last-resort fallback`
   - logs: `Failed to create settings proxy: Error calling StartServiceByName for org.freedesktop.impl.portal.desktop.gtk: Timeout was reached`
   - logs also mentioned document portal / RealtimeKit failures.
5. Gamescope waits on those DBus/portal replies for long timeouts. During this time Sway tree shows only Korri; no Gamescope surface.

Important framing: Gamescope does **not** need a portal for its core job. The portal lookup is opportunistic desktop settings integration. In this kiosk guest, the advertised portal path is worse than absent because it hangs.

## Live proof / prediction tests already run

### Failure with normal DBus

Running Gamescope with the normal session DBus caused it to hang before useful startup:

```bash
gamescope -f -b -- /run/current-system/sw/bin/true
```

Observed:

- process exists as `.gamescope-wrap` / `gamescope`
- no Gamescope Sway surface
- no child process in the simple test
- strace blocks in `ppoll` after sending `org.freedesktop.portal.Settings.Read`

### Success with fail-fast DBus

Running with a deliberately invalid DBus address made Gamescope proceed immediately:

```bash
DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/nonexistent-korri-bus \
  gamescope -f -b -- /run/current-system/sw/bin/sleep 5
```

Observed:

- Gamescope initializes Vulkan / Wayland backend
- `gamescopereaper` child appears
- child command appears
- Sway gets a Gamescope surface for graphical children

### Visible wrapped-app proof

A temporary wrapper was tested live on Sobo:

```bash
#!/usr/bin/env bash
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/0/korri-gamescope-no-portal-bus"
exec /root/.nix-profile/bin/gamescope "$@"
```

Then:

```bash
/tmp/korri-gamescope-no-portal -f -b -- /run/current-system/sw/bin/glxgears
```

Observed in Sway tree:

```text
name: "glxgears"
app_id: "gamescope"
focused: true
fullscreen_mode: 1
```

Gamescope logs included:

```text
wlserver: Running compositor on wayland display 'gamescope-0'
xdg_backend: Post-Initted Wayland backend
```

This proves Gamescope can shine on Sobo once the broken portal path is bypassed.

### Moonlight wrapped proof

The same wrapper around Moonlight got past the previous failure point:

```bash
/tmp/korri-gamescope-no-portal -f -b -- moonlight stream -platform v4l2m2m ...
```

Observed:

- Gamescope initialized
- Moonlight reached v4l2m2m decoder setup
- Moonlight display thread ran under X11 inside Gamescope

The run then ended with the known host-side Sunshine/video-capture error:

```text
Server notified termination reason: 0x80030023
The connection was unexpectedly terminated by the host due to a video capture error.
```

Treat that as separate from the Gamescope wrapping issue.

## Korri working-tree change already made

Uncommitted Korri changes implement the workaround so product behavior can move forward:

- `korri/shared/library/config/inheritable-fields.ts`
  - adds `gamescope.command` to `GamescopePolicy`
- `korri/shared/library/config/cascade-resolver.ts`
  - folds `gamescope.command` as a scalar, more-specific wins
- `tools/device/game-stream-launch-intent.ts`
  - preserves command-bearing gamescope policy in launch intents
- `tools/device/game-stream-runner.ts`
  - passes `gamescope.command` into `composeGamescopeLaunchSpec`
- `korri/deploy/desktop/main.ts`
  - local Moonlight Gamescope policy now includes command
- `nix/images/platforms/rocknix-sm8550.nix`
  - creates `korri-gamescope-no-portal`
  - seeds/repairs local Moonlight launcher config with:

```yaml
gamescope:
  enabled: true
  command: .../korri-gamescope-no-portal
```

Do not re-summarize diffs; inspect those files directly if needed.

## Tests already run in Korri

Passed:

```bash
bun test \
  korri/shared/library/config/inheritable-fields.test.ts \
  korri/shared/library/config/cascade-resolver.test.ts \
  tools/device/game-stream-launch-intent.test.ts \
  tools/device/game-stream-runner.test.ts \
  tools/device/game-stream-fullscreen.test.ts \
  tools/cli/moonlight-launcher.test.ts \
  tools/testing/nix/korri-rocknix-image-eval.test.ts

bun run tsc --noEmit --pretty false
```

Also after tweaking SM8550 preStart migration:

```bash
bun test tools/testing/nix/korri-rocknix-image-eval.test.ts
bun run tsc --noEmit --pretty false
```

## Suggested nix-on-rocks investigation

The cleanest way to remove the Korri workaround is probably one of these substrate fixes:

1. **Fix the portal stack in the guest**
   - Ensure the advertised session bus has a functional `xdg-desktop-portal` backend for Sway/wlroots.
   - Check whether `xdg-desktop-portal-wlr` is installed, activated, and selected.
   - Ensure the Settings portal does not fall back to `gtk.portal` if GTK portal cannot start in this constrained root/kiosk guest.

2. **Do not advertise broken portals to kiosk foreground apps**
   - If the ROCKNIX guest does not need desktop portals, make the portal DBus services unavailable or non-activatable in the kiosk session.
   - The live test showed “absent/fail-fast DBus target” is better than “present but hanging portal”.

3. **Provide a substrate-level Gamescope launcher environment**
   - If a fully functional portal is overkill, nix-on-rocks could provide a canonical wrapper/environment for Gamescope in kiosk sessions.
   - Korri could then depend on a substrate-provided `gamescope` that is already kiosk-safe, rather than carrying `korri-gamescope-no-portal`.

Concrete things to inspect in nix-on-rocks:

- The module that provides `rocknix-guest-base`.
- Any user/session DBus setup around `/run/user/0/bus`.
- Any `xdg-desktop-portal`, `xdg-desktop-portal-wlr`, `xdg-desktop-portal-gtk`, `xdg-document-portal`, `xdg-permission-store` packaging/services.
- Why `main-space-session-dbus.service` provides a bus where portal names are activatable but backend startup times out.
- Whether root-owned kiosk sessions need special portal configuration (`XDG_CURRENT_DESKTOP=sway`, portal config file, backend preference, user service env, etc.).

## Useful live commands

Check portal state:

```bash
ssh -p 2222 root@sobo 'systemctl --user status xdg-desktop-portal.service; busctl --address=unix:path=/run/user/0/bus list | grep portal || true'
```

Reproduce the bad path:

```bash
ssh -p 2222 root@sobo 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus gamescope -f -b -- /run/current-system/sw/bin/true'
```

Reproduce the good path:

```bash
ssh -p 2222 root@sobo 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/korri-gamescope-no-portal-bus gamescope -f -b -- /run/current-system/sw/bin/glxgears'
```

Use `SWAYSOCK=$(find /run/user/0 -maxdepth 1 -name "sway-ipc*" | head -n1)` and `swaymsg -t get_tree` to verify visible surfaces.

## Suggested skills for next session

- `se-debug` — primary; continue root-cause investigation in nix-on-rocks.
- `thinking-partner` — use if deciding between “fix portal properly” vs “make portals absent for kiosk apps”.
- `se-architecture-improvement` — use if the fix implies a reusable substrate-level kiosk/session contract between nix-on-rocks and Korri.
