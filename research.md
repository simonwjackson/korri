# Research: Valve Gamescope runtime resolution changes

## Summary
Public Gamescope documentation treats `-w/-h` (game/nested size) and `-W/-H` (Gamescope output size) as startup/window-sizing parameters, not as a documented runtime API for changing a running game's advertised resolution. The only clearly documented runtime controls are hotkeys for fullscreen/filter/upscaler/sharpness and `gamescopectl` controls for backend/debug/refresh-related state; I found no public evidence that `-w/-h/-W/-H` can be changed without restarting the game, except that resizing a nested Gamescope window updates the output-size side (`-W/-H`) for that window.

## Findings
1. **Gamescope distinguishes game/nested resolution from output resolution.** The current help text exposes `-w, --nested-width` as “game width”, `-h, --nested-height` as “game height”, `-W, --output-width` as “output width”, and `-H, --output-height` as “output height”; it also exposes `-S, --scaler` and `-F, --filter` for scaling/filter choice. [Valve `src/main.cpp`](https://github.com/ValveSoftware/gamescope/blob/master/src/main.cpp)

2. **The README documents `-W/-H` as output-size settings and says window resize updates them, but only for nested/windowed behavior.** Valve’s README says `-W, -H` “set the resolution used by gamescope”, “Resizing the gamescope window will update these settings”, and that they are “Ignored in embedded mode.” That is evidence for runtime output-window resize in nested mode, not for changing the game-visible `-w/-h` virtual display without restart. [Valve Gamescope README](https://github.com/ValveSoftware/gamescope)

3. **The canonical command pattern is startup-time composition.** Valve’s README examples launch a game with fixed internal and output sizes, e.g. upscale a 720p game to 1440p with `gamescope -h 720 -H 1440 -U -b -- %command%`, or run a 1080p game scaled to a 3440×1440 output with `gamescope -w 1920 -h 1080 -W 3440 -H 1440 -b -- %command%`. [Valve Gamescope README](https://github.com/ValveSoftware/gamescope/blob/master/README.md)

4. **Runtime upscaler/filter toggles are documented via hotkeys.** Public help/README-derived sources list `Super+F` for fullscreen, `Super+N` for nearest-neighbor filtering, `Super+U` for FSR upscaling, `Super+Y` for NIS upscaling, and `Super+I`/`Super+O` for FSR sharpness adjustment. [Valve `src/main.cpp`](https://github.com/ValveSoftware/gamescope/blob/master/src/main.cpp), [ArchWiki Gamescope](https://wiki.archlinux.org/title/Gamescope)

5. **FSR and NIS are exposed as filters/upscalers, not resolution mutation APIs.** Valve’s README documents `-F fsr` for AMD FidelityFX Super Resolution 1.0 and `-F nis` for NVIDIA Image Scaling v1.0.3. ArchWiki likewise describes `-F fsr` / `-F nis` for upscaling. These change how a lower-resolution rendered image is scaled; they do not change the game-visible virtual mode. [Valve Gamescope README](https://github.com/ValveSoftware/gamescope), [ArchWiki Gamescope](https://wiki.archlinux.org/title/Gamescope)

6. **A direct public issue asks whether an already-running Gamescope instance can change refresh/resolution; the reported `xrandr` attempt failed.** Issue #1016 asks if Gamescope can be modified after launch and shows `gamescope -w 896 -h 560 -W 1280 -H 800 -r 40 -U -f`, then `xrandr` seeing current `896x560` plus a `1280x720_60.00` mode, but `xrandr --output XWAYLAND0 --mode "1280x720_60.00"` fails with `BadValue`. I did not find a public maintainer-confirmed command in that issue showing successful live `-w/-h` mutation. [ValveSoftware/gamescope issue #1016](https://github.com/ValveSoftware/gamescope/issues/1016)

7. **`gamescopectl` exists publicly, but the public examples I found do not include a resolution setter.** Public references show commands such as `gamescopectl backend_info`, `gamescopectl debug_set_fps_limit`, `gamescopectl shutdown`, and `gamescopectl adaptive_sync 1`; search did not surface `gamescopectl set-resolution`, `output-width`, `nested-width`, or equivalent. [Gamescope Deep Dive gist](https://gist.github.com/dsrtfbbg379/bf8f637797952906b78ee62e0a440476), [ValveSoftware/gamescope issue #1479](https://github.com/ValveSoftware/gamescope/issues/1479)

8. **Third-party DBus work exists, but it is not evidence of upstream live resolution mutation.** ShadowBlip’s `gamescope-dbus` describes itself as a daemon providing a UI-agnostic DBus way to interact with Gamescope, with XML interface specs, but search results did not expose an upstream Valve DBus/IPC method for changing `-w/-h/-W/-H` on a running game. [ShadowBlip/gamescope-dbus](https://github.com/ShadowBlip/gamescope-dbus)

9. **Steam Deck exposes per-game resolution as a Steam UI setting before launch.** Valve’s Steam Deck client update added “Game Resolution” in App Properties, “allowing players to override the max display resolution for games, on a per-game basis.” That supports selecting the virtual/display resolution a game sees, but it is an app property/launch setting, not documented as a mid-session Gamescope resize API. [Steam Deck client update](https://store.steampowered.com/news/app/1675200/view/3328736287861418016)

10. **Practical Steam Deck reports suggest games may not automatically adapt to display changes mid-session.** A Factorio Steam Deck thread reports that the game “doesn't detect, or at least readjust, if the resolution changes by connecting/disconnecting an external display.” Reddit users commonly work around dock/undock by preselecting a higher per-game resolution so the game can choose among modes itself. These are practical reports, not upstream Gamescope guarantees. [Factorio forum](https://forums.factorio.com/viewtopic.php?t=104261), [Steam Deck Reddit discussion](https://www.reddit.com/r/SteamDeck/comments/1iulbej/when_docked_changing_steam_game_resolution_from/)

## Sources
- Kept: ValveSoftware/gamescope README (https://github.com/ValveSoftware/gamescope) — primary source for command examples, `-W/-H`, FSR/NIS options, and resize note.
- Kept: ValveSoftware/gamescope `src/main.cpp` (https://github.com/ValveSoftware/gamescope/blob/master/src/main.cpp) — primary source for current help text and hotkeys.
- Kept: ValveSoftware/gamescope issue #1016 (https://github.com/ValveSoftware/gamescope/issues/1016) — direct public question about live refresh/resolution mutation with failed `xrandr` evidence.
- Kept: Steam Deck client update (https://store.steampowered.com/news/app/1675200/view/3328736287861418016) — official evidence for per-game resolution override behavior.
- Kept: ArchWiki Gamescope (https://wiki.archlinux.org/title/Gamescope) — practical secondary source for Gamescope commands and hotkeys.
- Kept: ValveSoftware/gamescope issue #1479 (https://github.com/ValveSoftware/gamescope/issues/1479) — public evidence of `gamescopectl debug_set_fps_limit` usage.
- Kept: Gamescope Deep Dive gist (https://gist.github.com/dsrtfbbg379/bf8f637797952906b78ee62e0a440476) — non-authoritative but useful list of publicly observed `gamescopectl` commands.
- Kept: ShadowBlip/gamescope-dbus (https://github.com/ShadowBlip/gamescope-dbus) — third-party DBus/IPC project; useful to distinguish from upstream Gamescope support.
- Dropped: SEO/how-to articles about Steam Deck FSR/resolution — redundant with Valve README, ArchWiki, and Steam official update.
- Dropped: Reddit-only Gamescope setup threads — useful anecdotal context but too noisy unless directly about Steam Deck dock/undock resolution behavior.
- Dropped: DeepWiki mirror pages — convenient summaries, but less authoritative than Valve README/source.

## Gaps
- I did not find an upstream Valve document, PR, or accepted issue comment that explicitly says “live `-w/-h` changes are impossible”; the conclusion is based on absence of a documented IPC/API, startup-oriented docs, and failed public attempts.
- I could not confirm the full `gamescopectl` command surface from an official manpage/help page in public search results. Next step: build/run current Gamescope and capture `gamescopectl --help`, then inspect source for control methods.
- Steam Deck’s closed Steam UI may use private integration paths not documented in public Gamescope docs. Next step: observe a Deck/SteamOS session with logs while changing App Properties and scaling filters.
