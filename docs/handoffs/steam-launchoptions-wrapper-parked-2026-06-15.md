# Steam LaunchOptions Gamescope wrapper parked

Date: 2026-06-15

## Decision

The Korri per-game Steam LaunchOptions Gamescope wrapper is preserved for research, but it is no longer wired into default Steam AppID launches. The supported direction for Stray/controller-sensitive Steam games is to run Steam itself inside Gamescope and let Steam launch the game normally.

## Why

Bandai A/B testing isolated the failure boundary:

- normal Steam/no Korri wrapper: controls worked
- Korri wrapper without Gamescope: controls worked
- Korri wrapper with inline Gamescope: controls failed
- inline Gamescope plus `SDL_VIDEODRIVER=x11`: controls failed
- detached Gamescope plus `DISPLAY=:1`: controls failed
- Steam inside Gamescope, with Stray launched by Steam and native `/r`: controls worked

This makes the per-game Gamescope wrapper unsafe as a default materialization path for Steam Input-sensitive titles.

## What changed

- `services.korri.steam.enableExperimentalPerGameGamescopeWrapper` now defaults to `false`.
- `korri-steam-app` only materializes the per-game wrapper when that option is enabled or `KORRI_STEAM_APP_MATERIALIZE_GAMESCOPE_LAUNCH_OPTIONS=1` is set explicitly.
- `tools/device/steam/korri-steam-gamescope-launch.sh` is marked experimental/parked instead of deleted.
- The Nix module check asserts the experimental wrapper remains disabled by default.

## Preserved follow-ups

Keep these parked items linked before reactivating wrapper support:

- `work/items/parking-lot/01KV61NG0CZ35D01YWZTW80CR5-revisit-per-game-steam-launchoptions-wrapper-support.md`
- `work/items/parking-lot/01KV4YVV1ZMYTNB419WJ6E8CYW-preserve-existing-steam-launchoptions-when-wrapping-command.md`
- `work/items/parking-lot/01KV53R13F6YQPM170P1AVD0V0-preserve-steam-per-app-eula-state-during-materialization.md`

## Reactivation requirements

Do not enable the parked wrapper by default until a future design proves that it:

1. preserves existing app LaunchOptions such as Stray's `/r`;
2. preserves unknown per-app Steam state, including EULA keys;
3. is guarded by per-title validation for Steam Input, overlays, focus, and lifecycle cleanup;
4. is clearly opt-in/experimental when controller behavior is not proven.

## Preferred architecture to productize next

```text
gamescope --backend sdl -w 854 -h 480 -W 1920 -H 1080 -F fsr --mangoapp
  -> korri-steam-guest steam -gamepadui -steamos3 -steampal -steamdeck
  -> native Steam AppID launch and native per-game LaunchOptions
```
