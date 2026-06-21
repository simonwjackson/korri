---
title: "ARM64-native proton-cachyos as the Korri Steam compat-tool default on Bandai"
date: 2026-06-20
category: tooling-decisions
module: product/plugins/steam
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Running x86 Steam games on an ARM64 NixOS handheld (SM8550 / Adreno 740)
  - The x86 Proton + FEX + Steam Runtime (sniper/SLR) path yields no working OpenGL renderer
  - "Choosing or wiring a Steam compatibility tool under compatibilitytools.d"
  - Setting a global default CompatToolMapping in config.vdf for the product Steam path
  - Validating or headlessly installing Steam titles, or bypassing first-launch gates
tags:
  - proton-cachyos
  - fex
  - steam-runtime
  - arm64
  - opengl
  - gamescope
  - korri-steam
  - bandai
---

# ARM64-native proton-cachyos as the Korri Steam compat-tool default on Bandai

> This is the durable decision + playbook for the Steam-on-ARM64 venture. The blow-by-blow
> evidence (29-game screenshot matrix, per-game results, ops notes, VDF-bypass proofs) lives in
> `docs/solutions/runtime-errors/steam-arm64-proton-cachyos-default-matrix-2026-06-20.md`. This
> doc is the headline; that doc is the evidence body.

## Context

Bandai is an ARM64 NixOS handheld (Qualcomm SM8550 / Adreno 740). The goal is to run x86 Steam
titles on it through the product path (`korrid steam-gamescope` → `steam://rungameid/<appid>` →
compat tool, with Steam owning install/launch and running inside a gamescope session that
preserves Steam Input).

The obvious approach — x86 Proton driven through FEX emulation inside Valve's `sniper`
SteamLinuxRuntime — hits an **unsolvable OpenGL wall**:

- FEX's GL support is a **query/thunk overlay**, not an on-disk `libGL.so` the game can `dlopen`.
  It answers GL queries but provides no loadable client driver.
- The `sniper` pressure-vessel runtime **isolates** the x86 `libGL` namespace from the host
  thunk, so even the partial thunking FEX offers never reaches the game.

The result: x86 Proton + FEX + sniper can launch a process but cannot present GL. 32-bit FNA
titles (Flinthook, VVVVVV, FEZ) fail at graphics init with
`err:wgl:X11DRV_WineGL_InitOpenglInfo couldn't initialize OpenGL` →
`NoSuitableGraphicsDeviceException: OpenGL 2.1 support is required!`. No configuration of the
x86-Proton-on-FEX stack closes the gap — the missing piece is a real x86 GL driver inside an
isolated runtime, which neither FEX nor sniper supplies. (Cross-session: the same path also
needed a three-part `srt-bwrap` wrapper just to cross the ARM64-host/x86-rootfs boundary without
`Exec format error` — it is fragile end to end. _(session history)_)

## Guidance

**Default the Steam compatibility tool to ARM64-native proton-cachyos**, not x86 Proton + FEX +
sniper. The native build emulates only the game's x86 executable (via wine WoW64
`libwow64fex.dll`) while running wine, GL, audio, and Steamworks as native ARM64 code. The GL wall
disappears because GL is never emulated — it runs against the real Adreno (Turnip/Mesa) driver.

### Install + default-mapping mechanics

Install the build into the Korri-owned compat-tools directory and strip its app-pinning so it can
serve as the global default:

```
/var/lib/korri/steam/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64/
```

- Remove `require_tool_appid` from `toolmanifest.vdf` so the tool is selectable globally rather
  than pinned (the ARM64 sniper appid `4185400` is not a registered tool here, so the chain would
  otherwise dead-end; stripping it lets proton run directly inside the Steam FHS).
- Set it as the device-wide default in `config.vdf` via the `CompatToolMapping` `"0"` entry (the
  catch-all applied to every AppID without a per-game override):

```
"CompatToolMapping"
{
    "0"
    {
        "name"     "proton-cachyos-11.0-20260601-slr-arm64"
        "config"   ""
        "priority" "250"
    }
}
```

### NixOS FHS invariant (non-negotiable)

The native build **must** run inside the Korri Steam FHS bwrap (`steam-arm64-fhs`). That env is
the contract:

- provides `/usr/bin/python3.13` (Proton's launcher needs a stable interpreter path),
- provides a consistent `glibc`,
- binds `/run/opengl-driver` so the native Adreno GL stack is visible inside the sandbox.

Running the tool **outside** this FHS bwrap fails (nix-ld stub for `pressure-vessel-wrap`, nix
python3 GLIBC mismatch, missing `libvulkan.so.1`). Start Steam through `korri-steam.service`, which
supplies the correct `HOME`/`STEAM_HOME`/`XDG_RUNTIME_DIR`/`FEX_ROOTFS`/`LimitNOFILE`/group access;
ad-hoc SSH `steam` starts produce false failures (`socket(): Too many open files`, `std::bad_alloc`).
_(session history)_

### Validation playbook

Validate through the **product path**, not ad-hoc Steam invocations:

- Launch success is **observable rendering**, not `Install=1` or an `iscriptevaluator` response.
- Detect running game processes by full argument line, not `comm` (which truncates at 15 chars and
  splits on spaces):

  ```
  ps -o args= | grep '/steamapps/common/' | grep '[.]exe' \
    | grep -viE 'steam.exe|services.exe|winedevice|DXSETUP|vcredist|xalia|UnityCrashHandler'
  ```

- Fresh prefixes run one-time `DXSETUP`/`vcredist` installers that eat the observation window — do
  a **warm-up launch** first, then a separate **test launch** to measure real rendering.

### Headless-ops + VDF first-launch-gate bypass

**Headless install (no UI click).** With Steam stopped, write the appmanifest directly, then start
Steam to auto-download. `StateFlags 1026` marks "update required"; install success = `StateFlags=4`
plus full byte count on disk. (`steam://install/<id>` always opens a confirm dialog and does **not**
work headless.)

```
# steamapps/appmanifest_<appid>.acf
"AppState"
{
    "appid"      "<appid>"
    "Universe"   "1"
    "StateFlags" "1026"
    "installdir" "<InstallDirName>"
}
```

**First-launch gate bypass via VDF.** `ShowEula`, `ShowInterstitials`, and `SynchronizingCloud` are
CEF overlays unreachable by injected input from the game-surface layer. Pre-seed them with Steam
**stopped** (Steam rewrites `localconfig.vdf` on exit), then restart:

- **Cloud** — `~/.steam/registry.vdf`, under `HKCU > Software > Valve > Steam`: `"CloudEnabled" "0"`.
- **EULA** (`ShowEula`) — in `userdata/<id>/config/localconfig.vdf`, inside the **first** app block
  under `apps` (Steam reads the first occurrence and ignores duplicates):

  ```
  "apps"
  {
      "<appid>"
      {
          "<appid>_eula_0" "1"
      }
  }
  ```

- **Configurator interstitials** (`ShowInterstitials`) — append the AppID to each
  `Deck_ConfiguratorInterstitialApps_<Type>` array.

**Screenshots: use gamescope's own tool, not `grim`.** Once the DSI panel DPMS-blanks,
`grim -o DSI-2` captures pure black even while the game renders. Use:

```
GAMESCOPE_WAYLAND_DISPLAY=gamescope-0 gamescopectl screenshot <path>
# async: sleep 3-4s before stat-ing the file
```

`gamescopectl screenshot` reads the compositor's last-presented surface and is immune to DPMS
blanking. Caveat: gamescope keeps the **last-presented** surface, so a non-presenting game shows
the previous game's stale frame — identical byte sizes between two captures are the tell; restart
the session to clear a stuck foreground surface.

## Why This Matters

- **It eliminates an otherwise unsolvable failure mode.** No amount of x86-Proton/FEX/sniper tuning
  produces a working x86 `libGL` inside the isolated runtime. Switching the default removes the
  wall structurally rather than patching around it.
- **Broad coverage.** 26 of 29 validated titles render, including D3D/DXVK games (Portal 2 — full
  3D Source menu, Sonic Mania, SteamWorld Dig 2, Stray/UE4) and the previously-broken FNA/OpenGL
  set (Flinthook, VVVVVV, FEZ). Engines proven: Source, Unity, FNA/XNA, Heaps, MonoGame,
  GameMaker, Serious Engine, custom.
- **It scales the kiosk story.** A single global `CompatToolMapping "0"` default means
  launch-by-AppID "just works" for the catalog, with no per-game compat configuration.
- **It sets the right fallback policy.** The x86 per-game override (`proton_experimental`) is
  **non-functional today**: it fails device-wide with `AppError_51` (nested pressure-vessel cannot
  spawn inside the gamescope FHS). Invest in per-game ARM64 fixes, not the x86 safety net.

Remaining regressions are per-title, not stack-level: **30XX** (`E5033 'Unknown target profile
__fx_2_0__'`, legacy D3DX9 `d3dcompiler` — fix by installing `d3dcompiler_43`/`d3dx9` into the
prefix), **Vector** (renders black at ~140% CPU, likely an intro-video codec), and **Axiom Verge 2**
(Unity exits ~13 s — capture `Player.log`).

## When to Apply

Apply when **all** of the following hold:

- the device is ARM64 (here SM8550 / Adreno 740) and is being asked to run **x86** Steam games;
- launches go through **gamescope / a kiosk** path (`korrid steam-gamescope` → `steam://rungameid`);
- the runtime is **NixOS with an FHS bwrap** Steam environment (`steam-arm64-fhs`).

In that situation, default the compat tool to ARM64-native proton-cachyos and fix failures
per-game rather than enabling the x86 override.

## Examples

**Flinthook — x86 GL failure vs ARM64 success.** Under x86 Proton + FEX + sniper, Flinthook
(FNA/OpenGL) could not obtain a real `libGL` inside the pressure-vessel and never presented a
frame. Under `proton-cachyos-11.0-20260601-slr-arm64`, only its x86 executable is emulated; wine
and GL run native against Adreno, and the game renders its title screen.

**grim-black vs gamescopectl-real (false-negative lesson).** Early validation used `grim -o DSI-2`
and reported games as "black / not rendering." The black frame was a capture artifact — the DSI
panel had DPMS-blanked, so `grim` returned black while gamescope was presenting correctly.
Switching to `gamescopectl screenshot` (then `sleep 4 && stat`) revealed the games were rendering.
Validate presentation with the compositor's own screenshot tool, and watch for identical byte
sizes that indicate a stale last-presented surface.

**VDF EULA bypass (Undertale, AppID 391540).** With Steam stopped, setting the EULA flag in the
**first** app block of `userdata/<id>/config/localconfig.vdf` let Undertale skip `ShowEula` and
reach its character-naming screen on next launch:

```
"apps"
{
    "391540"
    {
        "391540_eula_0" "1"
    }
}
```

Comparable proofs: Talos Principle (257510) and Hades (1145360) skipped `ShowInterstitials` via the
`Deck_ConfiguratorInterstitialApps_<Type>` arrays — Hades reached full in-game; Talos then hit its
own Serious-Engine "unable to detect graphics hardware, continue anyway?" dialog (a separate
per-title gate, not a Steam/Proton problem).

## Related

- `docs/solutions/runtime-errors/steam-arm64-proton-cachyos-default-matrix-2026-06-20.md` — the
  full 29-game validation matrix, per-game results, ops notes, and VDF-bypass proofs (evidence body).
- `docs/solutions/runtime-errors/flinthook-arm64-proton-fna-opengl-2026-06-20.md` — the FNA/OpenGL
  founding case that motivated the ARM64-native default.
- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md` — why the
  x86 Proton + FEX + sniper path hits the GL wall (thunk vs on-disk libGL; pressure-vessel
  isolation; `srt-bwrap` architecture-crossing repair).
- `docs/solutions/architecture-patterns/fex-substrate-and-steam-runtime-boundary-2026-06-20.md` —
  where to encode this default in code: `@korri:proton` owns the Proton default; `@korri:steam`
  owns the `CompatToolMapping` wiring; `@korri:fex` owns the FEX rootfs/Vulkan ICD.
- `docs/solutions/architecture-patterns/steam-appid-launch-ux-policy-2026-06-20.md` — the
  screenshot-backed proof-gate methodology (note: its "known failed" list — Flinthook/VVVVVV/FEZ —
  is now stale and should be refreshed; those titles render under the ARM64 default).
- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`
  — the `steam-gamescope` launch environment used for the whole matrix.

### Productization follow-ups (backlog)

- `01KVJSZTH66G6R06AC46TR53Y3` — encode the ARM64-Proton payload + per-game mapping into the Korri
  repo (currently on-device mutable state in `compatibilitytools.d`; a Steam reseed would wipe it).
- `01KVJZ1KJBM8WV7H4ATZHMTMFK` — fix the 3 ARM64 regressions + repair the x86 `AppError_51` override path.
- `01KVK8BWNQ7942E3KKNS92DSJZ` — pre-seed the Steam first-launch gates in the kiosk AppID launch path.
