---
title: Make manual Steam launches repeatable on x86 with eager Xwayland and Steam readiness probes
date: 2026-05-26
category: runtime-errors
module: Korri manual Steam launcher and compositor
problem_type: runtime_error
component: tooling
symptoms:
  - "Nested Gamescope under sway 1.11 segfaulted while launching Balatro through Proton."
  - "Steam's 32-bit launcher sometimes segfaulted in libX11.so.6.4.0 during cold start."
  - "pgrep-based Steam readiness reported Steam running before it could reliably launch games."
  - "Repeated launch attempts left gamescope-wl processes alive and made later attempts fail misleadingly."
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [steam, gamescope, sway, xwayland, proton, nix, launcher, aka]
---

# Make manual Steam launches repeatable on x86 with eager Xwayland and Steam readiness probes

## Problem

Manual Steam game launching on x86/AKA needed to run the same core chain that already worked on Snapdragon/ROCKNIX: Steam Runtime sniper -> Proton -> `Game.exe`, bypassing the Steam app launcher UI. The first successful x86 launch was not enough; the chain had to survive cold Steam startup, nested Gamescope under Sway, and repeated launch/stop/launch cycles.

The final validation was four consecutive Balatro launches through the unified launcher under nested Gamescope, each confirmed by Steam's own `content_log.txt`:

```text
AppID 2379780 state changed : Fully Installed,App Running,
```

Each cycle reached `App Running` in 4-6 seconds, then returned to `Fully Installed` after the Gamescope wrapper was reaped.

## Symptoms

- Sway 1.11 crashed while nested Gamescope handled the Wine/Proton workload:

  ```text
  sway[*]: segfault at b8 ... in sway
  ```

- Steam's 32-bit launcher sometimes crashed during cold start:

  ```text
  steam[*]: segfault at 4d0 ... in libX11.so.6.4.0
  ```

- `pgrep -x steam` reported Steam as running immediately after the wrapper process forked, before Steam could reliably service game launches.
- `xwayland enable` looked like the right fix for the libX11 race, but live validation showed no `Xwayland` process after Sway startup; Sway itself owned the X11 listen socket and still spawned Xwayland lazily.
- Repeated tests appeared inconsistent until the leftover process names were inspected. Failed runs had left `gamescope-wl` and `gamescopereaper` processes alive; `pkill -x gamescope` did not match them.

## What Didn't Work

- **Pinning sway and Gamescope in `nix/images/platforms/x86.nix`.** The build and module checks passed, but the pin never reached AKA. Mountainous imports `inputs.korri.nixosModules.korri` directly and bypasses `lib.korriImages`, which is the only consumer of the platform module path.

- **Setting `services.korri.compositor.sway.package` from a platform module.** AKA's host config already assigned `services.korri.compositor.sway.package = pkgs.sway` directly, not via `mkDefault`, so an option-level platform default would lose the override war.

- **Using `xwayland enable` as the eager-Xwayland fix.** In Sway 1.12, `xwayland enable` is the default lazy mode: Sway holds the X11 listen socket and forks Xwayland only when the first X client connects. Live validation showed `pgrep -x Xwayland` returned nothing until an X client probed `DISPLAY=:0`. The correct directive is `xwayland force`.

- **Treating `pgrep` as Steam readiness.** `pgrep -x steam` matches the Steam wrapper process as soon as it forks. That is earlier than Steam's runtime-launcher service and earlier than the point where Proton/Wine can reliably talk to Steam APIs. A fixed 20-second settle worked only when it happened to be long enough.

- **Killing only `gamescope`.** The long-lived worker process name is often `gamescope-wl`, and the reaper is `gamescopereaper`. Test cleanup that only ran `pkill -x gamescope` left stale wrappers alive, causing misleading later failures and resource pressure.

- **Over-reading Gamescope's `-R` startup socket pattern.** SteamOS/ChimeraOS use `gamescope -R <fifo>` because they start Gamescope first and then launch Steam into the reported display. Korri's launcher uses `gamescope -- cmd`; in that shape, Gamescope already waits for its own Xwayland before execing the child. The `-R` signal solves a different architecture than the one Korri uses for nested per-game Gamescope.

## Solution

### 1. Pin the x86 compositor packages at the package layer

Commit `2694f93` added an x86-only overlay and attached it to `nixosModules.korri-compositor`, so downstream hosts get the package fix automatically when they consume Korri's compositor module.

```nix
# nix/overlays/korri-x86-compositor.nix
final: prev:
prev.lib.optionalAttrs prev.stdenv.hostPlatform.isx86_64 (
  let
    swayGamescopePin =
      import
        (builtins.fetchTarball {
          url = "https://github.com/NixOS/nixpkgs/archive/0c6db2b5d257d845bbee67a38dee43bbca3bd462.tar.gz";
          sha256 = "0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3";
        })
        {
          system = prev.stdenv.hostPlatform.system;
          config.allowUnfree = true;
        };
  in
  {
    inherit (swayGamescopePin) sway sway-unwrapped gamescope;
  }
)
```

Important details:

- Gate on `prev.stdenv.hostPlatform.isx86_64` so Snapdragon/ROCKNIX/aarch64 stays untouched.
- Read `prev.stdenv`, not `final.stdenv`, to avoid infinite recursion while constructing the overlay.
- Substitute `sway`, `sway-unwrapped`, and `gamescope` at the `pkgs` layer. This reaches hosts that set `services.korri.compositor.sway.package = pkgs.sway` directly, because `pkgs.sway` itself now resolves to the pinned package.

### 2. Force eager Xwayland in the Korri compositor

Commit `283c710` corrected the Sway config from `xwayland enable` to `xwayland force`:

```nix
# nix/modules/korri-compositor.nix
swayConfigPrelude = ''
  # Generated by services.korri.compositor. Platform modules may append
  # display/input fragments through services.korri.compositor.sway.extraConfig.
  default_border none
  default_floating_border none
  hide_edge_borders both

  # Start Xwayland eagerly. `xwayland enable` (sway's default) is lazy:
  # sway itself holds the X11 listen socket and only forks Xwayland on the
  # first client connect. That spawn races with Steam's 32-bit launcher,
  # which issues libX11 calls during init and has been observed to segfault
  # at libX11.so.6.4.0 when Xwayland isn't yet accepting connections.
  # `xwayland force` starts the Xwayland process at sway startup so no
  # client ever pays the cold-start cost.
  xwayland force
'';
```

Validation on AKA after rebuild:

```text
sway PID       490295  Tue May 26 23:05:15 2026
Xwayland PID   490384  Tue May 26 23:05:16 2026
Xwayland :0 -rootless -core -terminate -listenfd 44 -listenfd 45 ...
```

The `-terminate` flag had no numeric grace period, unlike lazy mode's `-terminate 10`, which showed Xwayland was resident for the Sway session.

### 3. Wait on Steam's runtime-launcher D-Bus name instead of `pgrep`

Commit `5ea93f0` added the platform-agnostic launcher and x86/ROCKNIX adapters. The core launcher waits for Steam's runtime-launcher service, not merely a `steam` process:

```bash
#! nix-shell -p bash coreutils procps glib

STEAM_READY_DBUS_NAME="${STEAM_READY_DBUS_NAME:-com.steampowered.PressureVessel.LaunchAlongsideSteam}"

is_steam_dbus_ready() {
  command_available gdbus || return 2
  gdbus call --session \
    --dest org.freedesktop.DBus \
    --object-path / \
    --method org.freedesktop.DBus.NameHasOwner \
    "$STEAM_READY_DBUS_NAME" 2>/dev/null \
    | grep -q 'true,'
}

wait_for_steam_ready() {
  local timeout_seconds="$1"
  if command_available gdbus; then
    gdbus wait --session --timeout "$timeout_seconds" "$STEAM_READY_DBUS_NAME"
    return $?
  fi
  # Fall back to pgrep only when gdbus is unavailable.
}
```

The x86 adapter defaults to `AUTO_START_STEAM=1`, `STEAM_START_COMMAND=/run/current-system/sw/bin/steam -silent`, and `STEAM_READY_SETTLE_SECONDS=0`. The D-Bus acquisition is the readiness signal; the previous fixed sleep is not part of the contract anymore.

### 4. Validate repeatability with Steam's own state transition

Host process names are not reliable proof because the game runs inside pressure-vessel. The durable success signal is Steam's content log:

```text
[2026-05-26 23:23:10] AppID 2379780 state changed : Fully Installed,App Running,
[2026-05-26 23:23:19] AppID 2379780 state changed : Fully Installed,
[2026-05-26 23:23:43] AppID 2379780 state changed : Fully Installed,App Running,
[2026-05-26 23:23:50] AppID 2379780 state changed : Fully Installed,
[2026-05-26 23:24:14] AppID 2379780 state changed : Fully Installed,App Running,
[2026-05-26 23:24:22] AppID 2379780 state changed : Fully Installed,
[2026-05-26 23:24:45] AppID 2379780 state changed : Fully Installed,App Running,
[2026-05-26 23:24:52] AppID 2379780 state changed : Fully Installed,
```

That is the final acceptance bar: launch Balatro again, and again, and again, and again, without relying on stale wrappers or optimistic process greps.

## Why This Works

The final fix closes three independent timing/version gaps in the launch stack:

1. **Sway no longer crashes under nested Gamescope.** Sway 1.12 includes fixes in the crash class hit by Sway 1.11 when nested Gamescope and Xwayland handled Wine/Proton surfaces. Pinning Gamescope 3.16.23 alongside Sway keeps the compositor pair coherent.

2. **Steam's first X11 connection no longer pays the Xwayland cold-start cost.** With lazy Xwayland, Sway accepts the first X11 connection and forks Xwayland on demand. That path is usually fine for desktop applications, but it raced Steam's 32-bit launcher in libX11. `xwayland force` starts the real Xwayland process at Sway startup, before Steam connects.

3. **The launcher waits for Steam's runtime-launcher service, not just a process.** `steam` appearing in the process table only means the wrapper forked. The D-Bus name `com.steampowered.PressureVessel.LaunchAlongsideSteam` is claimed by `steam-runtime-launcher-service --alongside-steam`, which is a better boundary for the Steam Runtime / Proton launch path.

4. **Package substitution happens below downstream option assignments.** Mountainous/AKA explicitly set `services.korri.compositor.sway.package = pkgs.sway`. A platform module default would not win that merge. The overlay changes what `pkgs.sway` means for x86 compositor hosts, so downstream consumers get the fix without knowing about the implementation detail.

## Prevention

- When pinning compositor packages that downstream NixOS hosts consume through a Korri module, prefer a module-attached overlay over an option-level default:

  ```nix
  nixpkgs.overlays = [ (import ../overlays/korri-x86-compositor.nix) ];
  ```

  This avoids `mkDefault`/`mkForce` merge fights and keeps the fix transparent to consumers.

- Use `prev.stdenv`, not `final.stdenv`, inside overlays that branch on host platform:

  ```nix
  prev.lib.optionalAttrs prev.stdenv.hostPlatform.isx86_64 { ... }
  ```

- Validate Xwayland mode by checking for a real process, not just an X11 socket:

  ```bash
  pgrep -x Xwayland
  sudo ss -lxp | grep X11-unix/X0
  ```

  Lazy mode can show Sway owning `/tmp/.X11-unix/X0` without any `Xwayland` process. Eager mode shows a resident `Xwayland` process and shared `-listenfd` sockets.

- Treat `pgrep -x steam` as a liveness fallback only. Prefer the D-Bus readiness name when `gdbus` is available:

  ```bash
  gdbus call --session \
    --dest org.freedesktop.DBus \
    --object-path / \
    --method org.freedesktop.DBus.NameHasOwner \
    com.steampowered.PressureVessel.LaunchAlongsideSteam
  ```

- Use Steam's `content_log.txt` as the launch truth when validating manual game launches:

  ```bash
  grep 'AppID 2379780 state changed' ~/.local/share/Steam/logs/content_log.txt
  ```

- Cleanup scripts and manual test loops must target the actual Gamescope process names:

  ```bash
  pkill -TERM -x gamescope-wl
  pkill -TERM -x gamescopereaper
  ```

  `pkill -x gamescope` can miss the processes that matter.

## Related Issues

- [Manually launch Steam games on ROCKNIX ARM64 without Steam GamepadUI](../best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md) — ARM64 sibling. The x86 path reuses the Steam Runtime -> Proton -> game shape but does not need FEX, Box64, ARM64 manifests, `/host/lib`, or freedreno ICDs.
- [Fix Steam desktop UI infinite spinner on ROCKNIX ARM64](steam-desktop-ui-arm64-manifest-spinner-rocknix-2026-05-04.md) — ARM64-only precondition for the sibling doc; not required on x86/AKA.
- [Kiosk foreground app policy belongs to the session, not Gamescope](../architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md) — foreground-policy backdrop. Nested Gamescope under Sway still needs a stable compositor/version envelope before foreground policy can matter.
- `docs/acceptance/steam-manual-launch-x86-aka-2026-05-26.md` — acceptance notes from the x86/AKA validation session.

## Session History

Session history search was requested, but the session historian found no relevant prior session files available under the expected Claude Code, Codex, Cursor, or Agents session-history locations for the repo and time window.
