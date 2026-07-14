# Gamescope `IWaitable hung up` abort defeats cold-boot Steam AppID launches (SM8550)

- **Date:** 2026-07-13
- **Device:** SM8550 / Bandai (ROCKNIX guest, `korri-thor-kiosk`)
- **AppIDs seen:** Downwell `360740`
- **Backlog:** `01KWX5FYS5CB4S2ZQBABSCWBEA`

## Symptom

After a cold boot, the **first** `korrid launch <steam game>` frequently did nothing
useful: managed Steam started, the AppID was forwarded, but the game never
appeared and the wrapper exited `124` ("timed out waiting for Steam AppID … to
launch"). A **second** tap usually worked. This looked like a game-specific
Proton problem but was not.

## Root cause

Managed Steam runs inside gamescope, and gamescope runs **nested inside sway**
(Wayland backend — note the `sway-ipc.sock` placement and libei input
emulation). gamescope's nested Wayland backend has an input-thread abort race:
when a client rapidly creates and destroys a window during startup, the nested
Wayland connection hiccups and gamescope's waiter aborts the whole process:

```
[gamescope] [Error] waitable: IWaitable hung up. Aborting.
korri-steam-gamescope.service: Main process exited, code=exited, status=134/n/a
```

This is upstream **ValveSoftware/gamescope#1456** ("wayland backend: high chance
of aborting on subsequent attempts to create the gamescope window"). The
reporter notes it fires when *"games/game engines cause gamescope to open and
close a window very quickly before opening the main window"* — which is exactly
Steam's **cold-start updater UI** (`-child-update-ui`) flashing a window during
startup churn. It is intermittent and fires more on a cold boot (more churn);
a warm restart often does not reproduce it.

`Restart=on-failure` recovers gamescope in ~2s, but the **forwarded `-applaunch`
died with the aborted Steam instance**, so the launch wrapper sat waiting for a
game that would never start on the dead client and timed out.

## Diagnosis

Read-only classifier: `tools/testing/steam/diagnose-bandai-gamescope-abort.ts`
distinguishes a compositor abort from a real game exit. For this incident it
returned:

```json
{ "classification": "gamescope-abort-before-steam-ready",
  "assertionLines": ["… [gamescope] [Error] waitable: IWaitable hung up. Aborting."],
  "serviceExitLines": ["… korri-steam-gamescope.service: Main process exited, … status=134/n/a"] }
```

`gameReachedRunning: false` confirms the abort happened **before** the game
launched, not after — i.e. it killed the launch, not the game.

## Fix (mitigation)

We do not patch gamescope. Instead the AppID wrapper (`korri-steam-app`, in
`product/plugins/steam/nix/nixos-module.nix`) is made resilient to the abort:

- Record the managed Steam run that received the `-applaunch` via its systemd
  `InvocationID`.
- In the launch-observation loop, if the game has not appeared yet
  (`saw_added=0`) and the `InvocationID` changed (service restarted), wait for
  the recovered client and **re-forward** the AppID.
- Bound retries with `KORRI_STEAM_APP_REFORWARD_LIMIT` (default `3`) so a
  persistent crash still terminates instead of looping.

The wrapper already handled a gamescope abort *after* the game was running
(exit `126`); this closes the pre-launch gap.

Fix commit: `bdb8e3d6 fix(steam): re-forward AppID when gamescope aborts before
game launch`. Related: `e8dd18fd` (auto-start managed Steam via the user manager
for keepWarm=false hosts) is the other half of hands-off cold-boot launch.

## Validation

Cold boot → `korrid launch downwell` with **no manual intervention**. gamescope
aborted/restarted multiple times during startup (service `NRestarts` climbed to
3, four distinct `gamescope-0` compositor inits), and Downwell still launched on
a later gamescope instance than the one that received the original forward —
proving the re-forward carried the launch across the aborts. Before the fix, a
single abort was enough to time the launch out.

## If it regresses

- Re-run the classifier around the launch window:
  `bun tools/testing/steam/diagnose-bandai-gamescope-abort.ts --host bandai-ts-korri --ssh-config /tmp/bandai-deploy/ssh_config_tailscale_readonly --since '<HH:MM:SS>'`.
- A durable upstream fix would be a newer gamescope with the Wayland-backend
  input-thread abort race resolved, or running gamescope on the DRM backend
  instead of nested in sway (larger architectural change; conflicts with the
  KORRI GUI owning the display).
