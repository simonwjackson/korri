---
title: Steam Inside Gamescope Preserves Steam Input
date: 2026-06-15
category: architecture-patterns
module: Bandai Steam launches
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - Steam games need Gamescope resolution control without breaking Steam Input
  - Proton games depend on Steam Input or Steam Deck-style controller routing
  - Per-game Gamescope launch options cause controller focus or input loss
tags: [steam, gamescope, steam-input, proton, bandai, fsr, mangohud]
---

# Steam Inside Gamescope Preserves Steam Input

## Context

Bandai needed Stray (`1332010`) to run at a 480p-ish render cost while preserving controller input. Per-game Gamescope wrapping looked attractive because it could put `gamescope -w 854 -h 480 ... -- %command%` into Steam Launch Options, but it broke Stray controls even when Steam itself was in Big Picture or desktop mode.

The useful boundary turned out to be the Steam Deck-style one: run Steam itself inside the Gamescope session, then let Steam launch the game normally. Stray kept its native Steam LaunchOptions (`/r`) and Steam Input stayed in the same compositor/session boundary as the game.

## Guidance

Prefer **Steam inside Gamescope** for Steam/Proton games that rely on Steam Input. Avoid per-game `gamescope %command%` wrappers for those titles unless the game has been verified not to need Steam Input routing.

Working Bandai shape:

```sh
SDL_VIDEODRIVER=x11 gamescope \
  --backend sdl \
  -w 854 -h 480 \
  -W 1920 -H 1080 \
  -F fsr \
  --mangoapp \
  -- \
  korri-steam-guest /var/lib/korri/steam/steamrtarm64/steam \
    -gamepadui -steamos3 -steampal -steamdeck \
    -noverifyfiles -nobootstrapupdate -skipinitialbootstrap -norepairfiles
```

Then launch the game through Steam, not by replacing its command with another Gamescope wrapper:

```sh
korri-steam-guest /var/lib/korri/steam/steamrtarm64/steam \
  steam://rungameid/1332010
```

Keep game-specific LaunchOptions owned by Steam. For Stray, the native option remained:

```text
/r
```

Do not globally hard-code `/r`; product materialization should preserve existing app LaunchOptions around `%command%` when wrapping is used elsewhere.

For 480p internal render with FSR output, use different internal and output sizes:

```text
-w 854 -h 480      # internal/app resolution target
-W 1920 -H 1080    # Gamescope output/upscale target
-F fsr             # FSR upscale filter
--mangoapp         # Gamescope-level Mango overlay
```

A single `--mangoapp` overlay reports the Gamescope/output side. It can show output resolution and FSR status, but it should not be treated as a live measured report of the game's inner swapchain resolution. If the internal render size needs to be shown without a second MangoHud layer, add a static overlay label such as `Render: 854x480 -> 1920x1080 FSR` from the known launch plan.

## Why This Matters

Steam Input is part of the Steam session architecture, not just an input device visible to the game. Putting only the game inside a nested or detached Gamescope instance can move the game across a focus/input boundary that Steam Input does not bridge reliably.

The A/B result on Bandai was:

- normal Steam/no Korri wrapper: controls worked
- Korri wrapper without Gamescope: controls worked
- Korri wrapper with inline Gamescope: controls failed
- inline Gamescope plus `SDL_VIDEODRIVER=x11`: controls failed
- detached Gamescope plus `DISPLAY=:1`: controls failed
- Steam inside Gamescope, with Stray launched by Steam: controls worked

That isolates the failure line to the per-game Gamescope boundary, not to Korri's wrapper or Stray's `/r` option.

## When to Apply

- Use this for Steam/Proton games where controller behavior depends on Steam Input.
- Use this when matching Steam Deck Gaming Mode semantics is more important than independently wrapping each app.
- Use per-game Gamescope wrappers only for titles that have been validated with controls, overlays, and focus.
- Preserve app-owned Steam LaunchOptions before materializing Korri launch state.

## Examples

### Avoid: per-game nested Gamescope for Steam Input-sensitive games

```text
LaunchOptions = "gamescope -w 854 -h 480 -W 854 -H 480 -- %command% /r"
```

This launched Stray, but controller input failed because the game was inside a per-game Gamescope boundary while Steam/Steam Input lived outside it.

### Prefer: Steam owns the Gamescope session

```text
gamescope -w 854 -h 480 -W 1920 -H 1080 -F fsr --mangoapp -- steam -gamepadui -steamos3 -steampal -steamdeck
Steam LaunchOptions for Stray = "/r"
Steam URL launch = steam://rungameid/1332010
```

This preserved controller input while allowing Gamescope to control the render/output path.

## Related

- `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`
