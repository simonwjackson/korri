# Flinthook (and 32-bit FNA OpenGL Steam games) run on Bandai via ARM64-native Proton

**Date:** 2026-06-20
**Device:** Bandai (SM8550 / Adreno 740, NixOS guest)
**Status:** Solved and verified — Flinthook (AppID `401710`) renders to its interactive title screen via the product Steam path.

## Problem

Flinthook is a **32-bit FNA game with a hardwired OpenGL renderer** (`FNA3D_FORCE_DRIVER` ignored). On the
x86-Proton-under-FEX path it always failed graphics init:

- `err:wgl:X11DRV_WineGL_InitOpenglInfo couldn't initialize OpenGL`
- `Microsoft.Xna.Framework.Graphics.NoSuitableGraphicsDeviceException: OpenGL 2.1 support is required!`

Root cause: **there is no working x86 OpenGL rendering path** in the x86 Steam/Proton/FEX stack on this device.
- Sniper/pressure-vessel supplies its own x86 libGL outside the FEX GL-thunk overlay → wine's x86 GLX probe fails before driver selection. Forcing Zink/llvmpipe did not help.
- The FEX GL host-thunk only services GL *queries*, not real context creation in a nested gamescope Xwayland.

(The misleading `Paris.Paris.UninitLeaderboards()` NullReferenceException in the game log is just shutdown noise after `game.Run()` exits.)

## Solution

Run the game through **ARM64-native Proton** (`proton-cachyos-11.0-*-arm64`), exactly as ROCKNIX does. The x86 game
exe is emulated by wine's bundled `libwow64fex.dll`, but **wine, GL, audio and Steamworks are all ARM64-native**, so
GL resolves to the host Turnip/Mesa stack and the x86-OpenGL wall disappears.

Key detail for **NixOS**: proton-cachyos must run inside Korri's existing Steam **FHS bubblewrap** env
(`steam-arm64-fhs`), which provides `/usr/bin/python3` (3.13), a consistent glibc, and binds
`/run/opengl-driver`. When Steam (already inside that FHS) launches the game, proton inherits the FHS — so the
proton script's `#!/usr/bin/env python3` and wine's libs all resolve correctly. Running proton *outside* that FHS
fails (nix-ld stub for `pressure-vessel-wrap`; nix-python3 vs runtime-glibc mismatch; missing `libvulkan.so.1`).

### On-device setup (kept as the working config)

1. Download `proton-cachyos-11.0-20260601-slr-arm64.tar.xz` from the CachyOS/proton-cachyos GitHub release and
   extract to `/var/lib/korri/steam/compatibilitytools.d/`.
2. Strip `require_tool_appid` from its `toolmanifest.vdf` (the ARM64 sniper runtime appid `4185400` is not a
   registered tool here; without the chain, proton runs directly inside the Steam FHS). Leave the proton shebang at
   the upstream `#!/usr/bin/env python3`.
3. Map the game to the tool in `config.vdf` `CompatToolMapping`:
   `"401710" { "name" "proton-cachyos-11.0-20260601-slr-arm64" ... }`.
4. Launch via the controller-safe `steam-gamescope` session (Steam-inside-Gamescope) → `steam://rungameid/401710`.

## Verification

- Launch chain: `reaper SteamLaunch AppId=401710 -- proton-cachyos-11.0-20260601-slr-arm64/proton waitforexitandrun Flinthook.exe`.
- Game log: `Setting backbuffer 854 by 480` (GraphicsDevice created — no OpenGL-2.1 error), `ParisSteam libs
  initialized successfully`, audio songs loaded, progression `LogoScreen → IntroCutscene → TitleScreen`.
- `Flinthook.exe` stable ~3 min at ~65% CPU, ~640 MB RSS.
- Screenshot proof of the rendered title screen (grim DSI-2 captured a real 130 KB frame, not the black
  direct-scanout frame): `/tmp/korri-proof/flinthook-arm64-RUNNING.png`.

## Productization follow-up

This was applied as on-device mutable state. To make it durable and general (VVVVVV, FEZ, other 32-bit FNA/GL
titles), encode an ARM64-Proton runtime payload + per-game compat mapping into the Korri repo. See backlog item for
"Productize ARM64-native Proton (proton-cachyos) for 32-bit OpenGL Steam games on Bandai".

## Related

- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`
- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`
- ROCKNIX reference: `start_steam.sh` (arm64 flavor) + `Install Steam.sh` (`install_proton_cachyos`).
