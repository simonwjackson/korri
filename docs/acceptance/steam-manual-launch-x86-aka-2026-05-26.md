---
title: Steam manual launch x86 AKA evidence
status: completed
date: 2026-05-26
---

# Steam manual launch x86 AKA evidence

## Result

Phase 3 succeeded on `aka` (`x86_64`) with Balatro AppID `2379780`: Balatro was launched manually outside Steam's app-launcher/reaper path by invoking SteamLinuxRuntime_sniper -> GE-Proton -> `Balatro.exe` from the active Sway session.

The successful x86/NixOS command needs the generic NixOS Steam FHS envelope (`steam-run`). It does not need Snapdragon/ARM64-specific pieces such as FEX rootfs setup, Box64, `steamrtarm64`, ARM64 manifest repair, `/host/lib` overlays, aarch64 dynamic loader shims, or SM8550 Vulkan/audio/power workarounds.

## Environment

- Host: `aka`
- Architecture: `x86_64`
- Steam root: `/home/simonwjackson/.local/share/Steam`
- AppID: `2379780`
- Game: `/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe`
- Runtime: `/home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point`
- Proton: `/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton`
- Evidence directory on AKA: `/tmp/korri-steam-manual-balatro-phase3-20260526-190914-steam-run`

## Attempts

### Attempt 1: direct runtime command from Sway

The first manual command launched the runtime directly from Sway with the captured Steam compatibility environment. It failed before Proton because `_v2-entry-point` could not find `getopt` in the sparse Sway service path:

```text
/home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point: line 93: getopt: command not found
```

### Attempt 2: direct runtime command with PATH repaired

Adding `PATH=/run/current-system/sw/bin:/usr/bin:/bin` fixed `getopt`, but failed on NixOS's generic dynamic linker boundary:

```text
Could not start dynamically linked executable: /home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap
NixOS cannot run dynamically linked executables intended for generic
linux environments out of the box.
```

This is not a Steam-specific or Snapdragon-specific failure. It is the normal NixOS FHS/stub-ld boundary for generic Linux binaries.

### Attempt 3: runtime command inside `steam-run`

Wrapping the same Runtime -> Proton -> Game command in `steam-run` succeeded.

Command shape:

```bash
export PATH=/run/current-system/sw/bin:/usr/bin:/bin
export HOME=/home/simonwjackson
export USER=simonwjackson
export XDG_RUNTIME_DIR=/run/korri-compositor
export WAYLAND_DISPLAY=wayland-1
export DISPLAY=:0
export DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-xH2FMsgZDf,guid=0e5870ff673554cfb8ca54fd6a163b60

export STEAM_ROOT=/home/simonwjackson/.local/share/Steam
export APP_ID=2379780
export GAME_DIR="$STEAM_ROOT/steamapps/common/Balatro"
export GAME_EXE="$GAME_DIR/Balatro.exe"
export RUNTIME="$STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point"
export PROTON_ROOT=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool
export PROTON="$PROTON_ROOT/proton"

export STEAM_COMPAT_CLIENT_INSTALL_PATH="$STEAM_ROOT"
export STEAM_COMPAT_DATA_PATH="$STEAM_ROOT/steamapps/compatdata/$APP_ID"
export STEAM_COMPAT_INSTALL_PATH="$GAME_DIR"
export STEAM_COMPAT_LIBRARY_PATHS="$STEAM_ROOT/steamapps"
export STEAM_COMPAT_TOOL_PATHS="$PROTON_ROOT:$STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper"
export STEAM_COMPAT_MOUNTS="$STEAM_ROOT/steamapps/common/Steamworks Shared:$STEAM_ROOT/steamapps/common/SteamLinuxRuntime_sniper"
export STEAM_COMPAT_PROTON=1
export STEAM_COMPAT_APP_ID="$APP_ID"
export SteamAppId="$APP_ID"
export SteamGameId="$APP_ID"
export SteamOverlayGameId="$APP_ID"
export PROTON_LOG=1
export WINEDEBUG=-all
export PROTON_USE_XALIA=0
export XALIA_SUPPORTED_ONLY=0

exec steam-run "$RUNTIME" --verb=waitforexitandrun -- \
  "$PROTON" waitforexitandrun "$GAME_EXE"
```

The command was handed to the active compositor with `swaymsg exec`, not through Steam's game launcher.

## Evidence

### Launch log

```text
started_at=2026-05-26T19:09:14-06:00
launcher=steam-run
runtime=/home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point
proton=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton
game=/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe
ProtonFixes[321798] INFO: Running protonfixes on "GE-Proton10-32", build at 2026-02-16 15:28:04+00:00.
ProtonFixes[321798] INFO: Running checks
ProtonFixes[321798] INFO: All checks successful
```

### Process chain

The resulting process chain does not include Steam's `reaper SteamLaunch AppId=2379780` app-launcher process. It is rooted in Sway's manual `swaymsg exec` command and the `steam-run` FHS wrapper:

```text
sway
└── steam-run / bwrap FHS envelope
    └── SteamLinuxRuntime_sniper / pressure-vessel
        └── GE-Proton10-32/proton waitforexitandrun
            └── Balatro.exe
```

Observed process excerpts:

```text
321626 srt-bwrap ... SteamLinuxRuntime_sniper ... GE-Proton10-32 ... Balatro.exe
321762 pv-adverb ... GE-Proton10-32/proton waitforexitandrun ... Balatro.exe
321798 python3 /nix/store/...GE-Proton10-32.../proton waitforexitandrun ... Balatro.exe
321806 c:\windows\system32\steam.exe ... Balatro.exe
321889 Z:\home\simonwjackson\.local\share\Steam\steamapps\common\Balatro\Balatro.exe
```

### Window evidence

Sway mapped a visible Xwayland game window:

```text
name: Balatro
class: steam_app_2379780
shell: xwayland
visible: true
output: HDMI-A-1
```

### Steam log evidence

Steam's content log transitioned the app back to running after the manual launch:

```text
[2026-05-26 19:05:03] AppID 2379780 state changed : Fully Installed,
[2026-05-26 19:09:17] AppID 2379780 state changed : Fully Installed,App Running,
```

## Phase 4: Steam background dependency

Phase 4 tested whether the manual Runtime -> Proton -> Balatro path depends on the Linux Steam client remaining alive in the background.

### Steam running: succeeds

With the normal Linux Steam client and `steamwebhelper` still running, the same `steam-run` wrapped manual launcher succeeded again from the active Sway session.

Evidence directory on AKA:

```text
/tmp/korri-steam-manual-balatro-phase4-steam-running-20260526-191751
```

Signals:

```text
steam_processes_before=yes
SteamLinuxRuntime_sniper -> GE-Proton10-32/proton -> Balatro.exe
class: steam_app_2379780
title: Balatro
output: HDMI-A-1
```

Steam's content log recorded the manual relaunch:

```text
[2026-05-26 19:17:54] AppID 2379780 state changed : Fully Installed,App Running,
```

### Steam closed: fails to produce a game window

Balatro was closed, then Steam was shut down with the NixOS Steam wrapper:

```bash
steam -shutdown
```

A direct attempt to run the mutable Steam binary's shutdown command (`~/.local/share/Steam/ubuntu12_32/steam -shutdown`) hit the same NixOS generic dynamic-linker boundary as the earlier direct runtime attempt, so the wrapper is the correct x86/NixOS control surface.

After shutdown, there were no Linux `steam`, `steamwebhelper`, or `steam-runtime-launcher-service` processes. The same manual launcher was then invoked from Sway.

Evidence directory on AKA:

```text
/tmp/korri-steam-manual-balatro-phase4-steam-closed-20260526-191906
```

The launcher reached GE-Proton setup, but exited without a visible Balatro window, without a surviving `Balatro.exe` process, and without a new `App Running` transition in `content_log.txt`:

```text
steam_processes_before=no
ProtonFixes[326744] INFO: Running protonfixes on "GE-Proton10-32", build at 2026-02-16 15:28:04+00:00.
ProtonFixes[326744] INFO: Running checks
ProtonFixes[326744] INFO: All checks successful
ProtonFixes[326744] INFO: Using global defaults for UNKNOWN (2379780)
ProtonFixes[326744] INFO: No global protonfix found for UNKNOWN (2379780)
```

The latest content log stayed at the prior shutdown transition:

```text
[2026-05-26 19:18:13] AppID 2379780 state changed : Fully Installed,
```

### Phase 4 conclusion

For Balatro on AKA/x86, the manual Runtime -> GE-Proton -> Game command is not fully independent of the Linux Steam client. The working shape still requires Steam to be running in the background, even though the game is not launched through Steam's app launcher/reaper path.

This matches the earlier Thor/ARM64 lesson at the generic Steamworks layer: Steam Runtime + Proton can be invoked manually, but this Steam game still expects a live Steam client context.

## Phase 5: Reproducible launcher script

Phase 5 captured the working command shape as a reusable script:

```text
tools/scripts/launch-steam-game-manual.sh
```

The script is intentionally generic and parameterized through environment variables:

```bash
APP_ID=2379780 \
GAME_EXE=/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe \
PROTON=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton \
tools/scripts/launch-steam-game-manual.sh
```

It resolves and exports the same Steam compatibility contract used in the successful AKA launch:

```text
STEAM_COMPAT_CLIENT_INSTALL_PATH
STEAM_COMPAT_DATA_PATH
STEAM_COMPAT_INSTALL_PATH
STEAM_COMPAT_LIBRARY_PATHS
STEAM_COMPAT_TOOL_PATHS
STEAM_COMPAT_MOUNTS
STEAM_COMPAT_APP_ID
SteamAppId / SteamGameId / SteamOverlayGameId
PROTON_LOG / PROTON_LOG_DIR
PROTON_USE_XALIA=0
```

On NixOS/x86 it automatically uses `steam-run` when available, which preserves the Phase 3 finding that Steam Runtime's generic Linux helper binaries need a generic FHS/dynamic-linker envelope. Set `STEAM_RUN_WRAPPER=none` to run the runtime directly on non-NixOS systems.

The script also has a non-launching check mode:

```bash
APP_ID=2379780 \
GAME_EXE=/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe \
PROTON=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton \
tools/scripts/launch-steam-game-manual.sh --check
```

Validation performed:

```text
bash -n tools/scripts/launch-steam-game-manual.sh
```

The script was copied to AKA as `/tmp/korri-launch-steam-game-manual.sh` and `--check` passed against the real Balatro/GE-Proton/Steam Runtime paths:

```text
mode=check
steam_running=no
steam_root=/home/simonwjackson/.local/share/Steam
app_id=2379780
runtime=/home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point
proton=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton
game=/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe
steam_run_wrapper=steam-run
```

With `REQUIRE_STEAM=1`, `--check` correctly fails while the Linux Steam client is stopped:

```text
launch-steam-game-manual: Steam is not running; start Steam first or unset REQUIRE_STEAM
```

### Phase 5 live run findings

The script was then used to open Balatro visibly on AKA from the active Sway session. The successful final run used:

```bash
APP_ID=2379780 \
GAME_EXE=/home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe \
PROTON=/nix/store/4rs08c11akpkmznhnid754g1spw9739y-proton-ge-bin-GE-Proton10-32-steamcompattool/proton \
STEAM_RUN_WRAPPER=/run/current-system/sw/bin/steam-run \
/tmp/korri-launch-steam-game-manual.sh
```

Evidence directory on AKA:

```text
/tmp/korri-steam-manual-2379780-20260526-192938
```

The live run produced the expected process/window/log shape:

```text
SteamLinuxRuntime_sniper -> GE-Proton10-32/proton -> Balatro.exe
pid: 334440
name: Balatro
class: steam_app_2379780
output: HDMI-A-1
[2026-05-26 19:29:41] AppID 2379780 state changed : Fully Installed,App Running,
```

New findings from the live run:

- **`steam-run` is required on AKA/NixOS for this manual Runtime -> Proton path.** It is not conceptually part of Steam's launch contract, but it is the NixOS FHS/dynamic-linker envelope that lets Steam Runtime's generic Linux helper binaries run. Direct runtime execution failed earlier at `pressure-vessel-wrap`; a later Sway-launched run where the script resolved `steam_run_wrapper=<none>` also failed to open Balatro. Forcing `STEAM_RUN_WRAPPER=/run/current-system/sw/bin/steam-run` produced the visible game window.
- **The active session PATH is sparse.** When launched through Sway, `steam-run` was not discoverable by PATH auto-detection. The productized wrapper should either pass an absolute `STEAM_RUN_WRAPPER` or normalize PATH before invoking the generic launcher.
- **Starting Steam is a separate session concern.** `nohup steam` from SSH was not reliable enough; Steam briefly bootstrap-verified and exited. Starting Steam in the active compositor/session context was more reliable, but `swaymsg exec` only proves Sway accepted the command — it does not prove Steam is ready.
- **Steam readiness must be polled.** `REQUIRE_STEAM=1` can fail if the launcher races ahead of Steam startup. A higher-level AKA/Korri wrapper should start Steam, wait for real `steam`/`steamwebhelper`/`steam-runtime-launcher-service` evidence, then run this manual game launcher.

The reliable AKA sequence observed in this phase is:

```text
active Sway session
└── start Steam through the session
    └── wait for Steam client/runtime processes
        └── launch manual script with absolute steam-run wrapper
            └── SteamLinuxRuntime_sniper
                └── GE-Proton10-32
                    └── Balatro.exe visible as class=steam_app_2379780
```

## Phase 6: Unified platform launcher and Steam auto-start

The launcher was then split into a colocated Steam manual-launch script family:

```text
tools/scripts/steam-manual-launch/
  launch-steam-game.sh
  launch-steam-game-x86-aka.sh
  launch-steam-game-snapdragon-rocknix.sh
```

The previous entrypoint remains as a compatibility wrapper:

```text
tools/scripts/launch-steam-game-manual.sh
```

Responsibilities:

- `launch-steam-game.sh` is the platform-agnostic core. It owns the Steam compatibility environment and the `SteamLinuxRuntime_sniper -> Proton -> Game.exe` command construction.
- `launch-steam-game-x86-aka.sh` is the AKA/NixOS adapter. It supplies the Balatro/GE-Proton paths, uses `/run/current-system/sw/bin/steam-run`, and now handles the Steam background-client requirement.
- `launch-steam-game-snapdragon-rocknix.sh` is the ROCKNIX/Snapdragon adapter. It supplies the `/storage` Steam root defaults, prefers the known GE-Proton/Proton paths, and enables the documented nested Gamescope SDL/X11 shape.

All scripts now use nix-shell shebangs so they carry their own shell/coreutils/procps tool contract instead of depending on the caller's sparse compositor PATH:

```bash
#!/run/current-system/sw/bin/nix-shell
#! nix-shell -i bash
#! nix-shell -I nixpkgs=flake:nixpkgs
#! nix-shell -p bash coreutils procps
```

The explicit `-I nixpkgs=flake:nixpkgs` is required for launches from the Sway compositor environment on AKA: `NIX_PATH` was absent there, so a plain nix shebang could not resolve `<nixpkgs>` even though the same script worked from an interactive shell.

### Unified script launch evidence

The x86 adapter was copied to AKA under `/tmp/korri-steam-manual-launch/` and successfully delegated into the unified core script. A successful rerun produced:

```text
run_dir=/tmp/korri-steam-manual-2379780-20260526-201137-rerun
pid=353111
window="Balatro"
```

The recorded command was still the expected generic launch shape:

```text
/run/current-system/sw/bin/steam-run
  /home/simonwjackson/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point
  --verb=waitforexitandrun
  --
  /nix/store/...GE-Proton10-32.../proton
  waitforexitandrun
  /home/simonwjackson/.local/share/Steam/steamapps/common/Balatro/Balatro.exe
```

### Steam stopped -> auto-start -> manual launch

The AKA adapter now accounts for the proven Steam background dependency directly:

```bash
REQUIRE_STEAM=1
AUTO_START_STEAM=1
STEAM_START_COMMAND="/run/current-system/sw/bin/steam -silent"
STEAM_READY_SETTLE_SECONDS=20
```

The first auto-start attempt proved that detecting a `steam` process is not enough: Steam appeared after roughly 2 seconds, but launching immediately was too early and Balatro did not become visible. The fix is to wait an extra settle period after process readiness so Steam's runtime/session context is initialized.

After closing Balatro and stopping Steam, the updated launcher handled the full sequence itself:

```text
balatro_closed_after=2
steam_stopped_after=1
```

Then the unified launcher was invoked through Sway and produced:

```text
launch-steam-game: Steam is not running; starting with: /run/current-system/sw/bin/steam -silent
launch-steam-game: Steam became ready after 2 seconds
launch-steam-game: waiting 20 extra seconds for Steam session readiness
```

Successful result:

```text
run_dir=/tmp/korri-steam-manual-2379780-20260526-202309-auto-start-settle
pid=361897
window="Balatro"
steam_running=yes
steam_started=yes
steam_ready_settle_seconds=20
```

This changes the AKA conclusion from "operator must start Steam first" to "the platform adapter can start and settle Steam before invoking the platform-agnostic manual Runtime -> Proton -> Game command."

## Conclusion

The x86 proof validates the core cross-platform recipe:

```text
manual launcher
└── Steam Runtime / pressure-vessel
    └── Proton compatibility tool
        └── game executable
```

On AKA/NixOS, the extra host-specific requirement is `steam-run`, which supplies a generic Linux/FHS envelope for Steam Runtime's dynamically linked helper binaries. This is an x86/NixOS integration seam, not a Snapdragon workaround.

The full AKA working shape is now:

```text
active Sway session
└── launch-steam-game-x86-aka.sh
    ├── start Steam if needed
    ├── wait for Steam process readiness
    ├── settle for Steam session/runtime readiness
    └── launch-steam-game.sh
        └── steam-run
            └── SteamLinuxRuntime_sniper / pressure-vessel
                └── GE-Proton10-32/proton waitforexitandrun
                    └── Balatro.exe visible as class=steam_app_2379780
```

## Phase 7: Gamescope path on AKA and a real sway crash

Phase 7 extended the proof to the Gamescope wrapper path on AKA, since Snapdragon/ROCKNIX requires nested Gamescope to ship a game window. The x86 adapter defaults `USE_GAMESCOPE=0`, but the unified script supports `USE_GAMESCOPE=1`, and the goal was to validate it on AKA so the recipe is symmetrical across platforms.

The gamescope path on AKA did not work on first attempt. Investigation revealed that the failure was not in the launcher.

### Architectural fix: `steam-run` is the inner wrapper, not the outer

The original `launch-steam-game.sh` wrapped the entire pipeline in `steam-run`:

```text
steam-run gamescope ... -- runtime -- proton -- game
```

That shape works for the non-gamescope path because steam-run's bwrap envelope is the only consumer. With gamescope inside, two FHS sandboxes nest (steam-run's bwrap, then pressure-vessel's bwrap), and pressure-vessel's `ldconfig` hits a symlink loop:

```text
pv-adverb: W: Cannot run /sbin/ldconfig: Failed to execute child process "/sbin/ldconfig" (Too many levels of symbolic links)
```

Moving `steam-run` to wrap only the inner Runtime -> Proton -> Game chain is the correct shape:

```text
gamescope ... -- steam-run runtime -- proton -- game
```

Without `steam-run` at all, pressure-vessel hits the NixOS generic dynamic-linker boundary that Phase 3 already documented (`pressure-vessel-wrap: Could not start dynamically linked executable ...`). With `steam-run` on the outside, the double sandbox breaks pressure-vessel's `ldconfig`. With `steam-run` on the inside, gamescope owns the outer process and `steam-run` envelopes only the generic Linux helper binaries that need it.

The fix is in `tools/scripts/steam-manual-launch/launch-steam-game.sh`: when both gamescope and a `STEAM_RUN_WRAPPER` are configured, the wrapper is prepended to the runtime command before gamescope nesting, not to the outer command.

### Real failure mode: sway 1.11 segfaults under nested gamescope + Wine

With the architectural fix in place, gamescope on AKA still failed, but with a different signature. Each attempt produced:

```text
[gamescope] [Error] waitable: IWaitable hung up. Aborting.
[gamescopereaper] [Info] reaper: Parent of gamescopereaper was killed. Killing children.
```

And in `dmesg`, on each attempt, a fresh sway crash:

```text
sway[291090]: segfault at b8 ip ... in sway[66788,...+5a000]
sway[398742]: segfault at b8 ip ... in sway[66788,...+5a000]
sway[402725]: segfault at b8 ip ... in sway[66788,...+5a000]
sway[404714]: segfault at b8 ip ... in sway[66788,...+5a000]
```

Four different sway PIDs, same fault address (`0xb8`), same code offset (`+5a000`). Deterministic. `korri-compositor.service: Main process exited, code=exited, status=139/n/a` (139 = SIGSEGV).

Isolation tests narrowed the trigger:

- `gamescope -- xclock` — works. Gamescope window appears in sway tree as `app_id: gamescope`. Sway survives.
- `gamescope -- vkcube` — works. Sway survives.
- `gamescope -- steam-run runtime -- proton -- Balatro.exe` — sway crashes within seconds.

The trigger is gamescope's nested Xwayland forwarding Wine's many rapid window creations and xrandr-emulation requests to the outer compositor. Trivial X clients and pure Vulkan clients do not exercise the failing code path.

The AKA compositor session is configured in unusual ways (sway runs as a systemd service, not a logind session; private dbus bus in `/tmp`; no `systemd --user` instance; custom `XDG_RUNTIME_DIR=/run/korri-compositor`), so the original suspicion was that the wrapping was at fault. Dispatching gamescope from an SSH login session, outside `korri-compositor.service`'s cgroup, reproduced the same sway crash. The wrapping is not the cause.

## Phase 8: Sway 1.12 + gamescope 3.16.23 fixes the crash

A quick test pinned newer versions of both components from nixpkgs master and ran the same gamescope + Balatro pipeline.

### Versions tested

| Component | AKA running | Tested |
|---|---|---|
| sway | 1.11 | 1.12 (released 2026-05-25, nixpkgs master) |
| gamescope | 3.16.20 | 3.16.23 (nixpkgs master / unstable) |

The sway 1.11 -> 1.12 changelog includes several fixes that match the crash class (deterministic null-deref at struct offset 0xb8 during xdg-toplevel handling):

- `desktop/xdg_shell: skip configure in request_maximize handler if unmapped`
- `tree/view: check for null workspace output`
- `tiling_resize: fix use-after-free on view unmap during resize`
- `Disable Xwayland restacking for toplevel capture scenes`
- `Use goto-based error handling in view_init()`
- `transaction: reparent scenes of containers behind fullscreen containers`

Gamescope 3.16.20 -> 3.16.23 includes a pipewire loop locking fix and a steamcompmgr overlay paint fix.

### Quick test via systemd drop-in

A temporary drop-in swapped sway 1.11 for sway 1.12 without rebuilding the host:

```text
/run/systemd/system/korri-compositor.service.d/sway-1.12-override.conf
  ExecStart=
  ExecStart=/nix/store/.../dbus-run-session -- /nix/store/...sway-1.12/bin/sway --config /nix/store/...korri-compositor-sway.conf
```

After `systemctl daemon-reload && systemctl restart korri-compositor.service`, the running compositor was sway 1.12. The launcher was invoked with `GAMESCOPE_BIN` pointing at the new gamescope:

```bash
GAMESCOPE_BIN=/nix/store/...gamescope-3.16.23/bin/gamescope \
USE_GAMESCOPE=1 GAMESCOPE_BACKEND=wayland \
REQUIRE_STEAM=1 AUTO_START_STEAM=1 \
/tmp/korri-steam-manual-launch/launch-steam-game-x86-aka.sh
```

Evidence directory on AKA:

```text
/tmp/korri-steam-manual-2379780-20260526-212844-aka-sway112-withsteam
```

### Quick test result: Balatro runs through nested gamescope

Full pipeline alive and stable:

```text
sway 1.12 (pid 410470)
├── gamescope 3.16.23 (pid 411462, wayland backend)
│   └── Xwayland :1
└── gamescopereaper (pid 413069)
    └── steam-run (bwrap FHS envelope)
        └── SteamLinuxRuntime_sniper / srt-bwrap
            └── pv-adverb -> GE-Proton10-32/proton
                ├── wineserver (pid 413231)
                ├── winedevice.exe (pid 413238, 413261)
                ├── c:\windows\system32\steam.exe (pid 413229)
                └── Z:\home\...\Balatro\Balatro.exe (pid 413305)
```

Steam content log:

```text
[2026-05-26 21:29:09] AppID 2379780 state changed : Fully Installed,App Running,
```

Sway tree shows the gamescope window owned by gamescope's pid on HDMI-A-1 workspace 1. `dmesg` shows no new sway segfaults after the upgrade. Sway PID unchanged for the duration of the test (no crash-and-restart cycle).

The runtime warnings about pressure-vessel temp dirs and ldconfig symlink loops are still present, but they are pre-existing harmless warnings; the chain reaches `App Running` regardless.

## Phase 9: Permanent pin in the x86 platform module

The quick test was promoted to a committed pin so AKA picks it up via the normal rebuild path instead of a systemd drop-in.

The fix is self-contained in `nix/images/platforms/x86.nix`:

- A `swayGamescopePin` inline `builtins.fetchTarball` against nixpkgs master commit `0c6db2b5d257d845bbee67a38dee43bbca3bd462` (sha256 `0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3`).
- The existing kiosk-only config block is wrapped in `lib.mkMerge` alongside a new `lib.mkIf compositor.enable` block that sets `services.korri.compositor.sway.package` and `services.korri.compositor.gamescope.package` to `lib.mkDefault` overrides from the pin.
- Gating on `compositor.enable` (not `kiosk.enable`) covers both the kiosk shape and the headless AKA shape, both of which run the compositor.
- ROCKNIX/aarch64 paths are untouched.

Validation:

- `korri-compositor-module`, `korri-input-module`, `korri-server-module`, `korri-game-stream-module`, and `korri-module-identity-audit` checks all pass.
- `korri-kiosk-system` dry-build resolves cleanly with sway 1.12 + gamescope 3.16.23 in the closure.
- The pin only affects hosts that enable `services.korri.compositor`, which includes both kiosk AKA and headless AKA shapes.

The inline pin is a temporary workaround. It can be removed once nixos-unstable picks up sway 1.12 and the project's main `nixpkgs` flake input is bumped.

## Updated conclusion

The AKA proof now covers both the non-gamescope path (Phase 5/6) and the nested-gamescope path (Phase 7/8), with the platform parity recipe:

```text
manual launcher
└── (optional) gamescope outer compositor
    └── steam-run FHS envelope
        └── Steam Runtime / pressure-vessel
            └── Proton compatibility tool
                └── game executable
```

Per-platform shape:

| Platform | Outer | FHS envelope | Notes |
|---|---|---|---|
| AKA / x86 / NixOS | sway directly (`USE_GAMESCOPE=0`) or nested gamescope (`USE_GAMESCOPE=1`) | `steam-run` (inner) | Requires sway >= 1.12 for the nested-gamescope path. |
| Snapdragon / ROCKNIX | nested gamescope (SDL/X11) | n/a | Existing platform-specific recipe unchanged. |

Key corrections to earlier phases:

- `steam-run` belongs inside the gamescope wrapper, not outside. The current launcher script handles this automatically when `USE_GAMESCOPE=1` and `STEAM_RUN_WRAPPER` is set.
- The crash signature `IWaitable hung up. Aborting.` from gamescope was a downstream symptom of sway segfaulting in nested mode, not a gamescope bug. Sway 1.12 fixes it.
- The unusual korri-compositor.service environment (systemd service, private dbus, custom XDG_RUNTIME_DIR) was suspected as the cause and ruled out by reproducing the crash from an SSH login dispatch outside the service cgroup.

## Still unproven

- Whether the same auto-start + settle sequence succeeds immediately after a cold boot.
- Whether a stronger Steam readiness signal can replace the fixed 20 second settle delay.
- Whether any game that does not require Steamworks can run without a live Linux Steam client.
- Whether the minimal environment can be reduced further from the captured Steam compatibility environment.
- Whether the nested-gamescope path on AKA produces a usable game window at the intended geometry (1920x1080 @ 120 Hz) when driven from the kiosk surface, as opposed to a manual `swaymsg exec` dispatch from a debug session.
- Whether the inline nixpkgs master pin can be removed safely once `nixpkgs-unstable` picks up sway 1.12.
