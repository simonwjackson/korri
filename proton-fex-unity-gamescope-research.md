# Research: Proton/Wine on ARM64 via FEX for Unity Windows games under DXVK/Vulkan, Xwayland, and Gamescope

## Summary
For ARM64 + FEX + Proton, a “process alive but no mapped window” failure is most likely in one of four seams: Proton/prefix bootstrap, FEX/pressure-vessel startup, Wine `winex11.drv` window creation, or Gamescope’s private Xwayland display not receiving/mapping the client window. The fastest path is to split diagnostics into: prove prefix readiness, prove Vulkan/DXVK device creation, prove X11 window mapping on the exact `$DISPLAY`, then reintroduce Gamescope.

## Findings
1. **Enable Proton’s own log first; it is the highest-signal launch transcript.** Valve documents `PROTON_LOG=1` for default logging, a string value to append Wine debug channels, and `PROTON_LOG_DIR` to control output location; Steam logs normally land as `steam-$APPID.log`. Use it before adding noisy `+all` Wine traces. [Valve Proton README](https://github.com/ValveSoftware/Proton)

2. **On FEX, first launch may look hung while Proton/pressure-vessel prepares the environment.** The FEX Proton wiki explicitly warns to be patient because pressure-vessel + FEX can take a few minutes building the chroot; watching processes in `htop` is recommended. Do not classify “alive/no window” as a render failure until the prefix/container bootstrap has clearly finished or stalled. [FEX Proton wiki](https://wiki.fex-emu.com/index.php/Proton)

3. **DXVK/Vulkan is mandatory for many Proton games under FEX; capture DXVK separately from Wine.** FEX notes many games require Vulkan because they run through DXVK; DXVK exposes `DXVK_HUD` and debug/log environment controls such as log level/path in its README. If DXVK never creates logs or a Vulkan device, investigate loader/ICD/driver visibility before Xwayland. [FEX Proton wiki](https://wiki.fex-emu.com/index.php/Proton), [DXVK README](https://github.com/doitsujin/dxvk/blob/master/README.md)

4. **For Wine window mapping failures, focus WINEDEBUG on X11/window/message channels, not `+all` first.** Wine’s developer debugging guide describes `WINEDEBUG` channels and recommends adding channels found in source traces, with `+all` only when needed. For “process alive, no mapped window,” start with `+timestamp,+pid,+tid,+x11drv,+event,+win,+msg,+seh` and only escalate to `+relay`/`+all` in a short timed run. [Wine debugging guide](https://gitlab.winehq.org/wine/wine/-/wikis/Wine-Developer's-Guide/Debugging-Wine.md)

5. **Gamescope intentionally runs the game in its own Xwayland sandbox.** Valve’s Gamescope README says the game runs in a personal Xwayland sandbox desktop, so the child process’ `$DISPLAY` is not necessarily the host desktop display. A launch can leave Wine/Unity alive while the window is mapped to the wrong display, not mapped at all, or hidden behind Gamescope’s child focus/fullscreen policy. [Gamescope README](https://github.com/ValveSoftware/gamescope/blob/master/README.md)

6. **Wayland clients need explicit Gamescope exposure; Wine/Proton normally uses Xwayland.** ArchWiki documents `--expose-wayland` for Wayland clients, while Gamescope’s core Proton path is Xwayland. For Wine/Unity diagnosis, prefer forcing X11 (`SDL_VIDEODRIVER=x11`, unset/avoid Wayland-only overrides) unless you are intentionally testing a Wayland-aware helper process. [ArchWiki Gamescope](https://wiki.archlinux.org/title/Gamescope)

7. **Prefix initialization hangs are a separate class from renderer/window bugs.** Community reports around Proton and Wine show launches stuck during new prefix creation or `wineboot`; practical triage is to run `wineboot -u`/a minimal executable against the exact prefix outside Gamescope, then retry with a warmed prefix. [Valve Proton issue #6859](https://github.com/ValveSoftware/Proton/issues/6859), [WineHQ forum example](https://forum.winehq.org/viewtopic.php?t=38007)

## Practical diagnostic commands and environment changes

### 1. Capture a baseline Proton/FEX launch
```bash
mkdir -p /tmp/proton-fex-logs
PROTON_LOG=1 \
PROTON_LOG_DIR=/tmp/proton-fex-logs \
DXVK_LOG_LEVEL=debug \
DXVK_LOG_PATH=/tmp/proton-fex-logs \
DXVK_HUD=devinfo,fps \
%command%
```

For a standalone Proton invocation, keep the same environment and pass the game through Proton exactly as your launcher does. After launch:

```bash
ls -lt /tmp/proton-fex-logs
pgrep -a -f 'wine|wineserver|FEX|Unity|\.exe|gamescope|Xwayland'
tail -n 200 /tmp/proton-fex-logs/steam-*.log
```

### 2. Separate prefix bootstrap from rendering
```bash
export STEAM_COMPAT_DATA_PATH=/path/to/that/compatdata_or_test_prefix
export WINEPREFIX="$STEAM_COMPAT_DATA_PATH/pfx"

# If using plain Wine for a control test:
wineboot -u
wineserver -w

# Inspect whether setup is still active or wedged:
pgrep -a -f 'wineboot|wineserver|services.exe|explorer.exe|FEX|pressure-vessel'
```

If a first launch is slow under FEX, wait a few minutes while watching CPU/disk activity. If it is idle with no new log lines, retry with a fresh compatdata directory and capture `PROTON_LOG=1`.

### 3. Focus Wine/X11 logging for “alive but no window”
```bash
mkdir -p /tmp/proton-fex-logs
PROTON_LOG='+timestamp,+pid,+tid,+x11drv,+event,+win,+msg,+seh' \
PROTON_LOG_DIR=/tmp/proton-fex-logs \
DXVK_LOG_LEVEL=debug \
DXVK_LOG_PATH=/tmp/proton-fex-logs \
%command%
```

Escalate only for a short run:
```bash
timeout 30s env \
  PROTON_LOG='+timestamp,+pid,+tid,+x11drv,+event,+win,+msg,+seh,+relay' \
  PROTON_LOG_DIR=/tmp/proton-fex-logs \
  %command%
```

Look for `winex11.drv`, window creation, display connection, X errors, unhandled exceptions, or a game loop running after failed X11 calls.

### 4. Prove the window is or is not mapped on the active X display
Run these while the stuck game is alive:
```bash
echo "host DISPLAY=$DISPLAY WAYLAND_DISPLAY=$WAYLAND_DISPLAY GAMESCOPE_WAYLAND_DISPLAY=$GAMESCOPE_WAYLAND_DISPLAY"
pgrep -a Xwayland
xwininfo -root -tree | grep -Ei 'unity|wine|proton|game|exe' || true
xlsclients -l || true
xprop -root _NET_CLIENT_LIST _NET_ACTIVE_WINDOW || true
```

Inside a Gamescope launch, inject a child-side environment dump before the game if your launcher allows it:
```bash
gamescope -w 1280 -h 720 -W 1280 -H 720 -- \
  sh -lc 'env | sort > /tmp/gamescope-child.env; exec "$@"' sh %command%
```

Then inspect:
```bash
grep -E '^(DISPLAY|WAYLAND_DISPLAY|GAMESCOPE|SDL_|WINE|PROTON|DXVK|VK_)=' /tmp/gamescope-child.env
```

If the child `$DISPLAY` differs from the host, run `xwininfo`/`xlsclients` against that display when possible:
```bash
DISPLAY=:N xwininfo -root -tree
DISPLAY=:N xlsclients -l
```

### 5. Reintroduce Gamescope with conservative X11 settings
```bash
SDL_VIDEODRIVER=x11 \
PROTON_LOG=1 \
PROTON_LOG_DIR=/tmp/proton-fex-logs \
DXVK_LOG_LEVEL=debug \
DXVK_LOG_PATH=/tmp/proton-fex-logs \
gamescope -w 1280 -h 720 -W 1280 -H 720 -f -- %command%
```

If the game is borderless/fullscreen-sensitive, try a non-fullscreen nested pass:
```bash
gamescope -w 1280 -h 720 -W 1280 -H 720 -b -- %command%
```

Avoid `--expose-wayland` during Wine/Unity Xwayland triage unless testing a known Wayland child; it adds another client path.

### 6. Vulkan/DXVK sanity checks
```bash
vulkaninfo --summary
VK_LOADER_DEBUG=all vulkaninfo --summary 2>&1 | tee /tmp/vulkan-loader.log
ls -l /usr/share/vulkan/icd.d /etc/vulkan/icd.d 2>/dev/null
```

If DXVK logs do not appear, the process may not reach D3D initialization, may be using WineD3D, or may fail before Vulkan loader setup. If DXVK logs appear but no X11 window appears, prioritize `winex11.drv`/Gamescope mapping.

### 7. Useful toggles to bisect the failure
```bash
# Disable DXVK to see whether a WineD3D/OpenGL path at least maps a window.
PROTON_USE_WINED3D=1 %command%

# Force a clean prefix for reproducibility.
rm -rf /tmp/proton-prefix-test
STEAM_COMPAT_DATA_PATH=/tmp/proton-prefix-test PROTON_LOG=1 %command%

# Wait for all Wine child processes before deciding launch is done.
wineserver -w
```

## Sources
- Kept: Valve Proton README (https://github.com/ValveSoftware/Proton) — primary source for Proton logging variables and Proton behavior knobs.
- Kept: FEX Proton wiki (https://wiki.fex-emu.com/index.php/Proton) — direct ARM64/FEX + Proton guidance, including pressure-vessel delay and Vulkan/DXVK requirement.
- Kept: DXVK README (https://github.com/doitsujin/dxvk/blob/master/README.md) — primary DXVK source for HUD/logging/debug environment.
- Kept: Wine Developer Guide: Debugging Wine (https://gitlab.winehq.org/wine/wine/-/wikis/Wine-Developer's-Guide/Debugging-Wine.md) — authoritative Wine debug-channel guidance.
- Kept: Gamescope README (https://github.com/ValveSoftware/gamescope/blob/master/README.md) — primary source for private Xwayland sandbox behavior.
- Kept: ArchWiki Gamescope (https://wiki.archlinux.org/title/Gamescope) — practical operational note on `--expose-wayland` and Gamescope usage.
- Kept: Valve Proton issue #6859 (https://github.com/ValveSoftware/Proton/issues/6859) — concrete prefix-creation hang symptom; useful as supporting evidence, not a general rule.
- Dropped: Reddit and general forum threads about Gamescope flags — anecdotal and not necessary once README/ArchWiki covered the behavior.
- Dropped: mirrored/old Wine source snippets — too stale for current Proton/Wine behavior.
- Dropped: SEO summaries of Proton/FEX — redundant with primary Proton/FEX documentation.

## Gaps
- I did not find a primary Unity-specific Proton/FEX issue matching exactly “Unity process remains alive but no Xwayland window maps.” Treat Unity as a likely workload shape, not a proven special case.
- Exact FEX log variables vary by FEX version/config; confirm with the installed FEX wiki/manpage or `FEXConfig` for the target device before standardizing FEX-specific logging.
- Gamescope child display numbering is runtime-dependent; the diagnostic should record the child environment instead of assuming a fixed `:N` display.
