---
title: Launch Steam games on AKA via silent Steam + per-app LaunchOptions Gamescope wrap
date: 2026-05-27
category: architecture-patterns
module: Korri Steam launch chain on x86 AKA
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Korri owns the outer Wayland session (Sway) on AKA-class x86 handhelds and wants Gamescope around individual games rather than around the whole session."
  - "The target library includes Steam titles that call SteamAPI_Init at startup (achievements, leaderboards, cloud saves, friends, rich-presence handshake, in-game overlay)."
  - "Steam can run as a background daemon on the device, signed in, with the RAM headroom available."
  - "Per-game launches need to be deterministic from a service, not driven by a user clicking Play in Steam's UI."
related_components:
  - "tools/scripts/steam-manual-launch/launch-steam-game.sh"
  - "tools/scripts/steam-manual-launch/launch-steam-game-x86-aka.sh"
  - "nix/images/platforms/x86.nix"
  - "nix/modules/korri-compositor.nix"
tags: [steam, gamescope, proton, kiosk, launchoptions, applaunch, aka, steamworks-ipc]
---

# Launch Steam games on AKA via silent Steam + per-app LaunchOptions Gamescope wrap

## Context

Korri runs as the outer Wayland shell on AKA, an x86 NixOS handheld whose runtime surface is Sway + Gamescope + Steam + Proton. The product owns the home screen, the rest of the desktop never appears, and individual games render inside their own Gamescope-wrapped Wayland clients. The seam where Korri actually launches a Steam game has to satisfy three constraints at once:

1. Proton must run with full Steamworks IPC. Steamworks-heavy titles (Sonic Mania, anything that hits achievements/leaderboards/cloud saves/rich presence during startup) hard-abort if `SteamAPI_Init` cannot reach a live Steam client.
2. Gamescope must wrap the actual game window, not a Steam window or a Big Picture shell, because Korri owns the surrounding chrome.
3. The launch must be deterministic from a service. No human in the loop, no Steam UI click.

The earlier manual chain (`gamescope → steam-run → SteamLinuxRuntime_sniper → Proton → Game.exe`) on AKA satisfied constraint 2 and constraint 3 for IPC-light titles like Balatro (validated in `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md`), but not constraint 1. Sonic Mania reaches `App Running` in Steam's `content_log.txt`, then exits ~2 seconds later. No crash dialog, no core dump, no Proton error log entry beyond a clean exit. The same fail mode reproduced with `SteamLinuxRuntime_sniper`+`GE-Proton10-32` and `SteamLinuxRuntime_4`+`Proton Experimental`. (session history)

Cross-distro research converged on the same answer used by every shipping Linux-gaming kiosk (SteamOS Game Mode, ChimeraOS, Bazzite, HoloISO): the game must be launched **by Steam itself**, with Gamescope either wrapping `%command%` per-game (Path A, the desktop-mode-with-Gamescope pattern) or wrapping Steam as a whole (Path B, the SteamOS Game Mode pattern). This doc captures Path A, which is the surgical per-game seam.

## Guidance

Treat Steam as an always-on background daemon Korri talks to over `steam -applaunch`. Do not try to bypass it.

The shape of a single launch is four steps:

### 1. Run Steam silently

```text
/run/current-system/sw/bin/steam -silent -nofriendsui -noverifyfiles
```

Verified empirically on AKA Sway 1.12:

| Milestone | Elapsed from spawn |
|---|---|
| `steam` process visible | 287 ms |
| `steamwebhelper` up | 1.69 s |
| D-Bus `com.steampowered.PressureVessel.LaunchAlongsideSteam` owned | 1.69 s |
| `content_log` steady (no new lines for 2 s) | ~5.2 s |

Steam's window is unmapped under Sway throughout — `swaymsg -t get_tree` shows no `steam` class window. Big Picture must not be enabled (`-tenfoot`/`-gamepadui` always shows a fullscreen BP window).

### 2. Probe Steam readiness on D-Bus before `applaunch`

Watch for ownership of `com.steampowered.PressureVessel.LaunchAlongsideSteam` on the session bus:

```bash
dbus-send --session --dest=org.freedesktop.DBus --type=method_call \
  --print-reply /org/freedesktop/DBus org.freedesktop.DBus.NameHasOwner \
  string:com.steampowered.PressureVessel.LaunchAlongsideSteam \
  | grep -q "boolean true"
```

Early `steam -applaunch` calls fired before this name is owned are silently dropped. The earlier x86 readiness work in `steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md` documents the same probe and still applies to Path A — the readiness gate is the floor underneath both the manual chain and the LaunchOptions wrap.

### 3. Provision per-app `LaunchOptions` while Steam is fully shut down

Steam reads `~/.local/share/Steam/userdata/<steam-id>/config/localconfig.vdf` **once at startup** and rewrites it on shutdown, clobbering any external edits made while Steam was running (ValveSoftware/steam-for-linux#6443, open since 2019). The only safe write window is between `steam -shutdown` completing (including `steamwebhelper` exiting) and the next `steam` start. Mid-session edits are silently lost.

Provisioning sequence:

1. `steam -shutdown`
2. Wait for `steamwebhelper` to disappear from the process list (not just the main `steam` process).
3. Atomically rewrite `localconfig.vdf` with a real VDF parser. The reference implementation we used is the Python `vdf` package from nixpkgs, with `nix-shell -p 'python3Packages.vdf' -i python3`:

   ```python
   import os, tempfile, vdf

   path = f"/home/.../.local/share/Steam/userdata/{steam_id}/config/localconfig.vdf"
   with open(path) as f:
       data = vdf.load(f)

   apps = data['UserLocalConfigStore']['Software']['Valve']['Steam']['apps']
   apps.setdefault(str(appid), {})['LaunchOptions'] = wrap_string

   fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
   with os.fdopen(fd, 'w') as f:
       vdf.dump(data, f, pretty=True)
   os.replace(tmp, path)
   ```

4. Start `steam -silent -nofriendsui -noverifyfiles`, wait for the D-Bus readiness probe above.

The wrap string we used on AKA at 1080p120:

```text
/run/current-system/sw/bin/gamescope --backend wayland \
  -W 1920 -H 1080 -w 1920 -h 1080 -r 120 \
  --xwayland-count 1 \
  --force-windows-fullscreen \
  -f -b -- %command%
```

`%command%` is Steam's per-app substitution token for the Proton + game command line Steam would have run itself. By wrapping `%command%`, Gamescope sits **outside** the reaper/Proton chain and hosts the eventual game window directly.

### 4. Launch through Steam

```text
steam -applaunch <appid>
```

Steam constructs the full chain itself:

```text
gamescope
└── steam-launch-wrapper
    └── reaper SteamLaunch AppId=<appid>
        └── _v2-entry-point --verb=waitforexitandrun
            └── proton waitforexitandrun <GAME.exe>
```

Verified end-to-end timings on AKA (warm Steam, Sonic Mania AppID 584400 and Balatro AppID 2379780):

| | Sonic Mania | Balatro |
|---|---|---|
| `App Running` event after `applaunch` | 5.80 s | 4.76 s |
| Game window in Sway tree | 10.27 s | 8.40 s |
| Stable at t+10 s / t+20 s | yes / yes | yes / yes |
| Gamescope process tree | confirmed | confirmed |

Sonic Mania — the title that died at ~2 seconds through the manual chain — runs indefinitely through Path A. Steam stays invisible the whole time; the Sway tree shows only the game's own toplevel (`name=Sonic Mania, class=steam_app_584400`).

Cold-Steam to game-window worst case: ~14 s (~5 s Steam settle + ~9 s game window). Warm-Steam to game-window: ~9 s.

## Why This Matters

Proton ships `steam.exe` as a Win32 stub. The stub calls `SteamAPI_Init` early in process startup. `SteamAPI_Init` requires a live Steam client process **owned by the same UID**, reachable over `~/.steam/steam.pipe` (a FIFO that the running Steam client owns). If the handshake fails, the stub aborts, and the abort cascades through the entire game process tree (ValveSoftware/steam-runtime#291). This is the mechanism behind Sonic Mania's clean 2-second exit.

Environment variables cannot fix this. We confirmed empirically by mirroring 30+ Steam-injected variables — `SteamClientLaunch=1`, `SteamEnv=1`, `Steam3Master=127.0.0.1:<port>`, `SteamUser`, `SteamAppUser`, `STEAM_RUNTIME_LIBRARY_PATH`, `SteamVirtualGamepadInfo`, fossilize cache paths, overlay `LD_PRELOAD` + `WINE_LD_PRELOAD`, `steam_appid.txt` dropped next to the binary, even invoking `steam-launch-wrapper` with a synthesized `reaper SteamLaunch AppId=…` argv, disabling `xalia`. None made Sonic survive past Steamworks init. The pipe either exists with the right owner or it does not; no environment can substitute.

A related dead end documented in session history: trying to inject Steam's `gameoverlayrenderer.so` via `LD_PRELOAD` at the outer shell level breaks the surrounding shell environment immediately (the 32-bit `.so` is ELF-class-mismatched against 64-bit coreutils, and it depends on `libGL.so.1` that does not exist outside `steam-run`'s FHS envelope). The correct injection point is *inside* `steam-run`/`srt-bwrap`, which is exactly where Steam's own `pv-adverb` does it via `--ld-preload=`. (session history)

The Balatro-passes-Sonic-fails distinction is not a Steam-version or Proton-version fluke. Balatro is Lua-based and does not call `SteamAPI_Init` at startup; the manual chain succeeds because Steamworks is never on the hot path. Sonic Mania calls it during its first frame, so the manual chain dies at the first frame. (session history) This means any prior manual-chain validation that used only Balatro is not evidence the chain generalizes — Sonic Mania (or any title with Steamworks features active during startup) is the canary that exposes the structural ceiling.

Path A satisfies the precondition the direct way: Steam **is** the launcher, so the pipe exists, the UID matches, and the sandboxed `steam.exe` finds exactly what `SteamAPI_Init` expects. Gamescope wraps `%command%` inside `LaunchOptions`, so the game window — but nothing else in the Steam stack — ends up inside Gamescope. Steam stays alive and invisible in Sway.

The cost is a Steam process running in the background (silent, no window, ~150–200 MB RSS) plus the one-time provisioning bounce per `LaunchOptions` change. The benefit is that every Steam title, including ones that depend on Steamworks features Korri does not know about, works without per-title special-casing.

## When to Apply

Apply Path A when **all** of the following hold:

- Korri owns the outer Wayland session on AKA-class x86 and wants Gamescope per-game rather than per-session.
- The target library includes any Steam title that calls `SteamAPI_Init` at startup.
- Steam is acceptable as a background daemon — the device has the RAM headroom and the user is signed in.
- Per-game launches need to be deterministic from a service.

Prefer **Path B (outer-gamescope-with-Steam-inside, the SteamOS Game Mode pattern, e.g. `gamescope-session-plus` from ChimeraOS)** when:

- The product wants Steam Game Mode semantics, where Steam itself owns the top-level chrome, picker, and settings.
- A session-architecture change is acceptable. Path B is a session rewrite, not a per-game seam.

Do **not** apply Path A when:

- Steam cannot run as a daemon (locked-down kiosk, no account, offline-only device).
- The library is exclusively non-Steam (native Linux, emulators, GOG). Path A's daemon overhead is only worth paying for Steam titles.
- The target platform is ROCKNIX ARM64. On ARM64 the same `steam -applaunch <appid>` envelope was historically unreliable (a separate, ARM64-only manifest/Steam-desktop-UI issue, captured in `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` and the cross-arch best-practice doc). The ARM64 manual chain remains the documented path there. (session history)

A useful tell: if the answer to "who owns the home screen" is "our product", Path A is right. If the answer is "Steam, mostly", Path B is right.

## Examples

### Wrap string used on AKA

```text
/run/current-system/sw/bin/gamescope --backend wayland -W 1920 -H 1080 -w 1920 -h 1080 -r 120 --xwayland-count 1 --force-windows-fullscreen -f -b -- %command%
```

Set as `LaunchOptions` for both AppID 584400 (Sonic Mania) and AppID 2379780 (Balatro). Both launched stably wrapped in Gamescope.

### Runtime process tree (verified)

After `steam -applaunch 584400` with the above `LaunchOptions`:

```text
/run/current-system/sw/bin/gamescope --backend wayland ... -- \
  /home/.../Steam/ubuntu12_32/steam-launch-wrapper -- \
  /home/.../Steam/ubuntu12_32/reaper SteamLaunch AppId=584400 -- \
  /home/.../Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point \
    --verb=waitforexitandrun -- \
  /nix/store/.../proton-ge-bin-GE-Proton10-32-steamcompattool/proton \
    waitforexitandrun /home/.../Steam/steamapps/common/Sonic\ Mania/SonicMania.exe
```

The Sway tree at this point contains only the game window:

```text
"name": "Sonic Mania"
"class": "steam_app_584400"
```

Steam's own window is not present — `swaymsg -t get_tree | grep -i steam` returns no matches outside the `steam_app_<id>` class.

### Dynamic per-game state without bouncing Steam

The `LaunchOptions` write requires a Steam shutdown. For per-game settings that should change frequently (Gamescope resolution, refresh rate, env vars, winetricks verbs, Proton runtime tokens), pre-bake a stable wrapper in `LaunchOptions` once, then mutate a Korri-owned config file at runtime:

```text
LaunchOptions = korri-game-wrap %command%
```

`korri-game-wrap` reads `~/.config/korri/games/<appid>.yaml` on every launch and applies the right Gamescope/Proton/env settings before delegating to `%command%`. Per-game changes are YAML edits with no Steam restart. This is the same architectural seam SteamTinkerLaunch uses; the wrapper layers over Steam's own launch chain via the `LaunchOptions` extension point.

## Related

- `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md` — compositor + readiness preconditions for AKA Steam launches; bounded by this doc to IPC-light titles.
- `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md` — cross-arch manual chain; IPC-light envelope on ROCKNIX ARM64. ARM64 `steam -applaunch` is documented as historically unreliable; Path A's evidence is x86-only.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` — kiosk foreground policy lives in the session, not Gamescope. Path A composes cleanly with that two-layer model: Gamescope wraps the game surface; Sway/session policy still owns whether that surface is foreground.
- `docs/solutions/runtime-errors/steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md` — ARM64-only Steam desktop UI precondition; orthogonal to Path A but completes the cross-arch picture.
- `docs/acceptance/steam-manual-launch-x86-aka-2026-05-26.md` — predecessor acceptance evidence on AKA for the manual chain.
- ValveSoftware/steam-runtime#291 — Proton's `steam.exe` stub aborts the game tree on `SteamAPI_Init` failure. Root cause of the env-mirroring dead end.
- ValveSoftware/steam-for-linux#6443 — Steam clobbers external `localconfig.vdf` edits on shutdown; mid-session edits are silently ignored. Forces the shutdown-write-restart provisioning shape.
- ValveSoftware/steam-for-linux#12264 — `steam://run/<id>//<args>/` ignores args on Linux. Rules out URL-handler dynamic LaunchOptions injection.
- <https://apple1417.dev/posts/2025-01-01-proton-multiple-game-instances> — per-app launcher service architecture (`com.steampowered.App<appid>`); same family of solution applied to a different problem.
- <https://github.com/different-name/steam-config-nix> — reference implementation of the close-Steam, write-VDF, restart-Steam pattern from the Nix ecosystem.
- <https://github.com/ChimeraOS/gamescope-session-steam> — canonical Path B reference (outer-gamescope-with-Steam-inside, SteamOS Game Mode shape). Read before deciding to rewrite Korri's session model.
