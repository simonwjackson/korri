---
id: 01KWN0ZJ6NY1FX3KKNF292J04R
slug: quitting-a-game-doesn-t-auto-return-the-compositor-to-the-hu
title: "Quitting a game doesn't auto-return the compositor to the hub workspace"
origin: parked
status: In Progress
priority: high
labels:
  - korri
  - compositor
  - sessiond
  - workspace
  - return-to-home
  - sm8550
created: 2026-07-03
source: se-work
---

# Quitting a game doesn't auto-return the compositor to the hub workspace

## Why it matters

After hold-to-quit (or any game exit) on the new Bandai/Chromium-kiosk trunk, sessiond correctly returns to mode=home and the hub renderer stays alive, but the compositor does NOT refocus/switch back to the hub workspace — the user is left on the now-empty game workspace (looks like a black screen / 'the GUI died') and has to manually use the workspace-swap chord to get back to the hub. The return-to-home path must also bring the hub workspace/output back to focus so quitting a game lands you on the hub with no manual step. Closely related to hub/game lane pinning (01KWFRBABT) and hub self-recovery (01KWGHX442).

## Acceptance Criteria

- [ ] Quitting a game (hold-to-quit or normal exit) returns focus to the hub workspace automatically — no manual workspace swap
- [ ] sessiond mode=home coincides with the hub workspace being visible/focused on the home output
- [ ] Verified on Bandai for both a local game and a stream exit

## Related

- `01KWFRBABT3ETSRZTMRCD04H3N`
- `01KWGHX442E8ZNEYWA16E1VZAK`
- `product/services/device/sessiond-lanes.ts`

## Root cause + fix 2026-07-22 (in progress, commit 6ac6449b)

Confirmed on Bandai with live evidence. There is **no korri-sessiond lane
service** running on Bandai, so the lane-based return-to-hub never applied here.
Instead the managed Steam service owns Sway placement via
`reconcile_gamescope_workspace()` (product/plugins/steam/nix/nixos-module.nix),
which only re-focuses `korri:steam-debug` when the gamescope window *drifts off*
it and has no return-to-hub path. In warm-Steam, quitting a game exits the game
process but leaves Steam alive on `korri:steam-debug`, so nothing switched focus
back to `korri:hub` — the user was stranded on the gameless Steam workspace
(korrid flips `mode=home` but does not drive Sway on Bandai).

Fix (`6ac6449b`): the Steam supervisor loop now detects the game-running ->
idle transition using Steam's reaper marker `SteamLaunch AppId=` (verified
present only while a game runs; absent for the idle Steam client,
steamwebhelper, gamescopereaper, and background winedevice.exe) and focuses
`korri:hub` once on the falling edge, leaving Steam warm on steam-debug for a
fast relaunch. Overridable via `KORRI_HUB_WORKSPACE`. Behavioral test added.

Remaining: on-device validation on Bandai (launch -> in-menu quit -> lands on
hub) for both a local Steam game and a stream exit, then mark Resolved.
