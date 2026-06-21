# Steam AppID Launch UX Policy

Date: 2026-06-20
Last updated: 2026-06-20 — refreshed compatibility status and proof-gate capture tool after the move to the ARM64-native proton-cachyos default (see `docs/solutions/tooling-decisions/arm64-native-proton-cachyos-steam-runtime-bandai-2026-06-20.md`).

## Status

Accepted for the Bandai Steam AppID path. The compat-tool default referenced below is now ARM64-native proton-cachyos, not the x86 sniper/Proton/FEX stack.

## Context

Bandai now launches Steam games through Korrid/sessiond by Steam AppID using the service-wrapper envelope:

```text
/run/current-system/sw/bin/korri-steam-app <appid>
```

That wrapper keeps Steam as the install and launch authority while preserving the `korri-steam.service` environment, limits, FEX rootfs contract, Steam Runtime repair, and session cleanup hooks. The launcher must not be replaced by direct game executables, direct `steam -applaunch` calls, or ad-hoc SSH-started Steam processes for product proof.

The UX tension is visibility:

- During proof/debugging, Steam prompts and transitions must remain observable.
- In production, Steam should hand off to the game and get out of the way so the game owns focus/input.

## Policy

### Production default: hide Steam after handoff

`services.korri.steam.keepVisibleDuringLaunch` defaults to `false`.

In this mode `korri-steam-app` may use Sway to move the Steam client/hat away after launch progress and prompt handling, then focus the real game window:

```text
[class="steam_app_<appid>"] floating disable, move to workspace 1, move to output <target>, fullscreen enable, focus
```

Production hide mode is valid only when all of these stay true:

- Steam is still started through `korri-steam.service`.
- The product launch spec remains `korri-steam-app <appid>`.
- Steam AppID evidence appears in logs/processes as `SteamLaunch AppId=<appid>`.
- The game window class is `steam_app_<appid>` when a window is available.
- Focus/input land on the game after handoff.
- Session stop/cleanup removes the AppID process tree.

### Debug/proof mode: keep Steam visible explicitly

Steam visibility is a deliberate proof/debug switch, not a separate launcher:

- NixOS option: `services.korri.steam.keepVisibleDuringLaunch = true`
- Per-launch/env override: `KORRI_STEAM_KEEP_VISIBLE=1`

When enabled, the wrapper leaves the Steam client visible so operators can inspect prompts, Steam-owned state, interstitials, and AppID transitions. This is the supported replacement for earlier ad-hoc no-hide experiments.

Do not productize or depend on paths such as:

```text
/var/lib/korri/bin/korri-steam-app-debug-nohide
```

### Screenshot/proof gates

A launch is not a playable proof until it has fresh visual evidence:

1. Dry-run resolves to `/run/current-system/sw/bin/korri-steam-app ["<appid>"]`.
2. Launch is accepted by Korrid/sessiond.
3. A Steam-owned process tree is alive for more than 60 seconds.
4. A visible `steam_app_<appid>` window, or equivalent title/class evidence, is present.
5. A fresh screenshot is captured on Bandai. **Prefer `gamescopectl`, not `grim`** — once the
   DSI panel DPMS-blanks after idle, `grim -o DSI-2` returns an all-black frame even while the
   game is rendering, producing false negatives:

   ```text
   GAMESCOPE_WAYLAND_DISPLAY=gamescope-0 gamescopectl screenshot <out.png>   # immune to panel blanking; async — sleep 3-4s before reading
   # grim -o DSI-2 <out.png>   # legacy; only trust when the panel is known awake
   ```

6. The screenshot is pulled locally and visually inspected.
7. Black captures are rejected — but first confirm it is not a `grim` blanking artifact (re-capture
   with `gamescopectl`) or a stale last-presented gamescope surface (identical byte size across
   captures is the tell; restart the session to clear a stuck foreground surface).
8. `app.session.stop` returns the device to `home` with no residual AppID/game tree.

If fullscreen/direct-scanout makes the screenshot black, disable fullscreen/floating once through Sway before capture. That is a proof maneuver, not a product launch-path change.

## Current live evidence

Positive Steam AppID gates completed with local screenshot proof:

- `30XX` — AppID `1029210`, `SteamLinuxRuntime_sniper`, `Proton 10.0`, FEX, `30XX.exe`.
- `Downwell` — AppID `360740`, `SteamLinuxRuntime_4`, Proton Experimental, FEX, `Downwell.exe`.
- `Caveblazers` — AppID `452060`, `SteamLinuxRuntime_4`, Proton Experimental, FEX, `game.exe`.
- `Sonic Mania` — AppID `584400`, `SteamLinuxRuntime_4`, Proton Experimental, FEX, `SonicMania.exe`.

Previously failed/parked compatibility cases — **now resolved by the ARM64-native proton-cachyos
default** (these were x86 Proton/FEX OpenGL-wall failures; they render once the x86 stack is
bypassed). See the validation matrix and decision doc in Related:

- `Flinthook` — ✅ renders title screen under ARM64 proton-cachyos (was: black/unstable on x86 FEX).
- `VVVVVV` — ✅ renders under ARM64 proton-cachyos (was: exited before the gate on x86 FEX).
- `FEZ` — ✅ renders under ARM64 proton-cachyos (was: exited before the gate on x86 FEX).
- `Stray` — ✅ renders (UE4/D3D); the formerly deferred high-stress gate now passes under ARM64 proton-cachyos.

Still-open per-title regressions on the ARM64 default (not stack-level; see decision doc):

- `30XX` (1029210) — `E5033 'Unknown target profile __fx_2_0__'` (legacy D3DX9 d3dcompiler).
- `Vector` (248970) — renders black at ~140% CPU (likely intro-video codec).
- `Axiom Verge 2` (946030) — Unity exits ~13 s without drawing.

## Consequences

- Product launches stay scalable because Korrid addresses Steam AppIDs, not per-game binaries.
- Steam credentials and install authority remain inside Steam.
- Visibility is configurable without forked launchers.
- Debugging remains possible without weakening production focus/input behavior.
- Screenshot-backed proof remains stricter than process-only proof.

## Related implementation anchors

- `product/plugins/steam/nix/nixos-module.nix`
- `product/plugins/steam/nix/nixos-module.test.ts`
- `product/plugins/steam/src/materializer.ts`
- `product/plugins/steam/src/materializer.test.ts`
- `product/plugins/steam/packages/steam-korri/scripts/steam-guest-runtime-prep`
- `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`
- `docs/solutions/tooling-decisions/arm64-native-proton-cachyos-steam-runtime-bandai-2026-06-20.md`
- `docs/solutions/runtime-errors/steam-arm64-proton-cachyos-default-matrix-2026-06-20.md`
