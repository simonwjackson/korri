# Research: Unity 2019.4 Linux Vulkan WSI errors

## Summary
Unity 2019.x Linux Vulkan failures that log `Error getting system window info: Invalid window` and `Unsupported windowing backend 0` most likely happen before or during Vulkan surface/swapchain creation, when Unity/SDL cannot map the game window to a supported native WSI handle such as X11/Xlib or Wayland. For a Unity 2019.4 x86_64 game under emulation, the most actionable first-pass workaround is to force an X11/Xwayland path under Gamescope, then fall back to OpenGL (`-force-glcore`) if Vulkan WSI remains broken.

## Findings
1. **The exact log signature exists in a Unity Vulkan + `-batchmode` failure.** Unity Technologies' Render Streaming issue #811 shows a Linux player starting Vulkan successfully, then logging `Error getting system window info: Invalid window`, `Unsupported windowing backend 0`, and `Missing Vulkan framebuffer attachment image?` when launched with Vulkan and `-batchmode`. This is direct evidence that Unity can reach Vulkan device initialization but fail when it needs a valid system window/backend for framebuffer/swapchain work. [UnityRenderStreaming issue #811](https://github.com/Unity-Technologies/UnityRenderStreaming/issues/811)
2. **SDL2 is a likely WSI seam: Vulkan surfaces require a window created for Vulkan and the native video backend matters.** SDL documents that `SDL_VIDEODRIVER` can force a backend such as `x11` or `wayland`, and `SDL_Vulkan_CreateSurface` requires a window created with `SDL_WINDOW_VULKAN` plus the instance extensions returned for that window/backend. If Unity's bundled SDL selects an unexpected backend, cannot get WM info, or has no real window in batch/headless mode, Vulkan surface creation can fail after device selection. [SDL2 FAQ: SDL_VIDEODRIVER](https://wiki.libsdl.org/SDL2/FAQUsingSDL), [SDL2 Vulkan surface docs](https://wiki.libsdl.org/SDL2/SDL_Vulkan_CreateSurface)
3. **Unity command-line graphics fallbacks are valid diagnostics/workarounds.** Unity's standalone player accepts launch arguments that alter graphics startup; the relevant practical flags are `-force-vulkan` to force Vulkan, `-force-glcore` to force desktop OpenGL Core, `-batchmode` for non-interactive mode, and `-nographics` for no graphics device. Unity Issue Tracker notes a Linux Vulkan startup crash where `-force-glcore` lets the player start properly, supporting OpenGL as a useful Vulkan-bypass test. [Unity Player command-line arguments](https://docs.unity3d.com/Manual/PlayerCommandLineArguments.html), [Unity Linux Vulkan issue tracker](https://issuetracker.unity3d.com/issues/linux-vulkan-crash-on-vkenumeratephysicaldevices-when-starting-the-player-without-vulkan-drivers-installed-on-the-system)
4. **Gamescope should be treated as an Xwayland/Vulkan compositor boundary, not just a resolution wrapper.** Gamescope is a SteamOS session compositing window manager and exposes Vulkan-device and nested-size controls; ArchWiki notes that Gamescope can cause some Vulkan environment variables to be ignored. If the game is emulated x86_64, Gamescope, FEX/box64, SDL, and the host Vulkan ICD must agree on the visible display/backend. Prefer launching the emulated game inside Gamescope with an explicit SDL X11 backend and fixed nested size before trying Wayland. [ValveSoftware/gamescope README](https://github.com/ValveSoftware/gamescope), [ArchWiki: Gamescope](https://wiki.archlinux.org/title/Gamescope)
5. **Wayland is a weaker hypothesis for Unity 2019.4 than X11/Xwayland.** Unity 2019.4-era Linux players commonly shipped around SDL/X11 assumptions; even if SDL2 has a Wayland backend, Unity's internal Vulkan WSI path may not recognize the returned subsystem and may collapse to backend `0`. For this class of error, `SDL_VIDEODRIVER=x11` under an Xwayland-capable Gamescope session is a safer first experiment than forcing `SDL_VIDEODRIVER=wayland`. [SDL2 video driver docs](https://wiki.libsdl.org/SDL2/SDL_HINT_VIDEODRIVER)

## Actionable hypotheses for Korri / x86_64 emulation
1. **Backend mismatch:** SDL is selecting Wayland or no usable backend under Gamescope/emulation, while Unity 2019.4's Vulkan path expects X11/Xlib. Try:
   ```sh
   env SDL_VIDEODRIVER=x11 DISPLAY=:0 ./Game.x86_64 -force-vulkan
   ```
   or inside Gamescope:
   ```sh
   gamescope -W 1280 -H 720 -- env SDL_VIDEODRIVER=x11 ./Game.x86_64 -force-vulkan
   ```
2. **Headless/batchmode invalid-window path:** If the launch wrapper passes `-batchmode`, remove it for interactive rendering. If the intent is a non-rendering server/test run, add `-nographics` and do not expect Vulkan swapchain creation:
   ```sh
   ./Game.x86_64 -batchmode -nographics
   ```
3. **Vulkan WSI incompatible but OpenGL works:** Use OpenGL Core to prove that the failure is Vulkan surface/swapchain-specific rather than general emulation/runtime failure:
   ```sh
   env SDL_VIDEODRIVER=x11 ./Game.x86_64 -force-glcore
   ```
4. **Gamescope device/display mediation:** If host Vulkan device selection env vars are involved, prefer Gamescope's own device/options and keep the child process simple. First test without Gamescope on a plain X11/Xwayland display, then with Gamescope fixed-size nesting, then with Vulkan-device selection only if needed.
5. **Bundled SDL2 incompatibility:** If the game ships an old `libSDL2-2.0.so.0`, test whether using the host/system SDL2 changes backend detection. Treat this as a diagnostic only unless ABI compatibility is confirmed.

## Suggested test matrix
| Test | Command shape | Expected signal |
|---|---|---|
| Plain X11 Vulkan | `SDL_VIDEODRIVER=x11 ./Game.x86_64 -force-vulkan` | If it works, Gamescope/Wayland wrapper is the issue. |
| Gamescope X11 Vulkan | `gamescope -W 1280 -H 720 -- env SDL_VIDEODRIVER=x11 ./Game.x86_64 -force-vulkan` | If it works, keep Xwayland forced in launcher. |
| Wayland forced | `SDL_VIDEODRIVER=wayland ./Game.x86_64 -force-vulkan` | If it reproduces backend `0`, do not use Wayland for this game. |
| OpenGL fallback | `SDL_VIDEODRIVER=x11 ./Game.x86_64 -force-glcore` | If it works, mark Vulkan WSI as the blocker and ship GL fallback if acceptable. |
| Batch/headless diagnostic | `./Game.x86_64 -batchmode -nographics` | Should avoid swapchain expectations; only valid for non-interactive runs. |

## Sources
- Kept: UnityRenderStreaming issue #811 (https://github.com/Unity-Technologies/UnityRenderStreaming/issues/811) — direct matching log signature for Unity + Vulkan + `-batchmode`.
- Kept: SDL2 FAQ / `SDL_VIDEODRIVER` (https://wiki.libsdl.org/SDL2/FAQUsingSDL) — official SDL backend override mechanism.
- Kept: SDL2 `SDL_Vulkan_CreateSurface` docs (https://wiki.libsdl.org/SDL2/SDL_Vulkan_CreateSurface) — explains Vulkan surface dependency on a Vulkan-capable SDL window and extensions.
- Kept: SDL2 `SDL_HINT_VIDEODRIVER` docs (https://wiki.libsdl.org/SDL2/SDL_HINT_VIDEODRIVER) — documents explicit backend forcing such as `x11`.
- Kept: Unity Player command-line arguments (https://docs.unity3d.com/Manual/PlayerCommandLineArguments.html) — official source for standalone launch flags.
- Kept: Unity Issue Tracker Linux Vulkan crash (https://issuetracker.unity3d.com/issues/linux-vulkan-crash-on-vkenumeratephysicaldevices-when-starting-the-player-without-vulkan-drivers-installed-on-the-system) — supports `-force-glcore` as a real Linux Vulkan bypass.
- Kept: ValveSoftware/gamescope README (https://github.com/ValveSoftware/gamescope) — official Gamescope project context and options entrypoint.
- Kept: ArchWiki Gamescope (https://wiki.archlinux.org/title/Gamescope) — practical note that Gamescope can mediate/ignore Vulkan env selection.
- Dropped: Reddit Unity/Wayland posts — useful anecdotes, but not stable or primary enough for launcher policy.
- Dropped: Generic Stack Overflow SDL/Vulkan questions — helpful for background, but less directly applicable than SDL's own docs.

## Gaps
- I did not find an official Unity 2019.4 source defining `Unsupported windowing backend 0`; the mapping is inferred from the adjacent `Invalid window` log and SDL/Vulkan WSI behavior.
- The exact emulation layer matters: FEX, box64, Proton, or a custom wrapper may change library loading, Vulkan ICD visibility, and X11 socket access. Next step is to capture `Player.log`, environment, `ldd`/loaded `libSDL2`, `DISPLAY`, `WAYLAND_DISPLAY`, and whether the process sees the host Vulkan ICDs.