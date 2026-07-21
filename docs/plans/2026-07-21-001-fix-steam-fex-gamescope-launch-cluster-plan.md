# Epic Plan — Steam/FNA/SDL games under FEX + gamescope-korri fail to start (early-exit / black-screen)

- Date: 2026-07-21
- Status: Proposed (diagnosis-first; shared root not yet confirmed)
- Owner: unassigned
- Device: Bandai (SM8550 handheld, aarch64, Turnip/Adreno 740, gamescope-korri 3.16.23, FEX x86 emulation, SteamLinuxRuntime_sniper)

## 1. Problem

Multiple Steam / Windows / SDL titles launched on Bandai through the Korri-managed
`gamescope-korri` + FEX + Steam-runtime path fail in one of three correlated ways
instead of rendering playable gameplay. The failures have been captured per-title,
but the evidence now points at a **shared substrate root**, not per-title flakiness.

### Symptom taxonomy

- **S1 — Short-lived / instant exit before the liveness gate.** The game's process
  tree is added, lives a few-to-tens of seconds, then Steam removes all AppID
  processes, *with no crash signature in logs* (no FEX/Proton/wine/vk error).
  - Flinthook (401710): ~6 s, cold-boot correlated.
  - VVVVVV (70300): ~14 s. Native x86 Linux SDL binary under FEX (no Proton).
  - FEZ (224760): ~21 s. FNA/MonoGame `.exe` under Proton 10 + FEX.
- **S2 — Runs-but-black (window alive, no frames).** Game process stays alive but
  never presents; gamescope surface is black.
  - Flinthook (when it does *not* early-exit): main thread blocked in
    `wchan=anon_pipe_read` **before** any rendering init — GPU idle
    (`renderD128` 0 clients, 220 MHz), no GL/Vulkan context, zero FNA3D/SDL/GL
    output. Intermittent with S1 on the same title (a startup race).
  - Street Fighter X Mega Man: black gamescope surface, window never becomes
    focusable/visible (Wine, not Proton).
- **S3 — gamescope-korri SIGABRT under sway.** `status=134` /
  `IWaitable hung up. Aborting.` / `xdg_backend: Compositor released us but we
  were not acquired`. Kills Steam/game (and Moonlight) and can take the kiosk down.

### Common substrate

FEX (x86→aarch64) + SteamLinuxRuntime_sniper / pressure-vessel + gamescope-korri
(nested in sway) + Turnip. Notably **not Proton-specific**: VVVVVV is a native x86
SDL binary and SFxMM is Wine, yet both fail — so the shared root sits at or below
the Steam-runtime / FEX / gamescope layer, not in Proton.

## 2. Member backlog items

| Item | Title | Symptom |
|------|-------|---------|
| `01KY3GKE078` | Flinthook hangs black on `anon_pipe_read` before rendering | S1/S2 (best-instrumented) |
| `01KVHBZ2BB8Z` | VVVVVV Steam AppID instant exit | S1 (native x86 SDL + FEX) |
| `01KVHC64M78S` | FEZ Steam AppID short-lived exit | S1 (FNA + Proton + FEX) |
| `01KVDZ7JFJ3M80` | Street Fighter X Mega Man gamescope black screen | S2 (Wine + gamescope) |
| `01KVM8TD6VY4` | Bandai steam-gamescope Steam UI launch mismatch | context |
| `01KVHFVV6JRH` | Move FEX/Proton runtime defaults out of Steam state | infra enabler |
| `01KVGRZM0Y3C` | Steam Big Picture FEX runtime wrapper support | infra enabler |
| `01KVF07E2Z5N` | Steam lifecycle launchId correlation (30XX) | observability |

### Overlaps / dedup

- `01KY3CACRF` (gamescope-korri SIGABRT under sway) and the **in-progress**
  `01KWGHXF36` ("IWaitable hung up" abort on Moonlight) are the **same S3 crash**.
  Fold `01KY3CACRF` into `01KWGHXF36`; treat S3 as one workstream.
- `01KWGHX442` (recover kiosk hub when a nested gamescope launch aborts) is the
  *resilience* counterpart to S3 — keep separate (survivability, not root cause).

## 3. Hypotheses (ranked by leverage × concreteness)

- **H1 — Broken Steam overlay injection (concrete, highest leverage).**
  The Korri input-guard `LD_PRELOAD` is malformed: Steam concatenates its
  `ubuntu12_32/gameoverlayrenderer.so` with `/nix/store/…/libkorri-steam-input-guard.so`
  **without a colon**, so `ld.so` rejects the single bogus entry and **both** the
  overlay *and* the guard fail to load. Steam's overlay sets up a startup IPC pipe;
  a missing/half-initialized overlay is a plausible source of the `anon_pipe_read`
  hang (S2) and of early exits (S1). Applies to *every* Steam-launched title
  (FNA, native, Wine) — matching the cross-engine spread.
- **H2 — FEX + SDL/FNA3D display+GL init race under gamescope nested Vulkan/Turnip.**
  Games block or exit while creating the window / GL context (SDL video driver
  choice: wayland vs Xwayland; FNA3D backend: OpenGL-on-Zink vs Vulkan; Turnip
  quirks). Explains black-before-render and the cold-cache correlation.
- **H3 — gamescope-korri nested-in-sway surface fragility (S3).**
  `IWaitable hung up` / `not acquired` SIGABRT and focus/visibility failures.
  Candidate contributors: gamescope-korri 3.16.23 vs stock 3.16.17 delta, the
  `wl_touch` backend patch 0004, and live surface reconfiguration.
- **H4 — pressure-vessel/sniper + FEX (bwrap/seccomp) startup deadlock.**
  Lower prior, but the `anon_pipe_read` peer could be a pressure-vessel or FEX
  thunk pipe rather than the overlay.

## 4. Workstreams

### P0 — Instrumentation & shared repro harness (prerequisite)
- Persistent, reboot-surviving debug toggle for `PROTON_LOG`, `FEX` logging,
  `SDL_LOG_PRIORITY`, and overlay on/off — as a NixOS option, **not** a `/run`
  drop-in (which the reboot wipes; that repeatedly cost us the trace this session).
- Resolve `PROTON_LOG_DIR` to a host-visible path (pressure-vessel maps `/tmp`
  inside the sandbox, so logs land in the container, not the host).
- Correlate the `anon_pipe_read` fd on the blocked game thread to its **writer**
  (walk `/proc/<pid>/fd` + the pipe inode's peer) to name the stalled handshake.
- Wire the existing read-only observers (`korri_steam_app_observe` /
  `korri_steam_launch_supervise`) to the working SSH path (`korri@bandai -p 2222`);
  their default `bandai-guest-ip`/`ssh_config_ip` path was unreachable this session.

### P1 — Test H1: fix the overlay/guard `LD_PRELOAD` (cheap, concrete, first)
- Understand Steam's per-arch `LD_PRELOAD` prepend so our guard entry stays a
  distinct colon-separated token and `gameoverlayrenderer.so` loads.
- Verify on device: both `gameoverlayrenderer.so` (correct arch) **and**
  `libkorri-steam-input-guard.so` load (no `cannot be preloaded` for either).
- A/B across titles (Flinthook, FEZ, VVVVVV): overlay-fixed vs `GAMEOVERLAY`-disabled
  vs current-broken — does either extreme stop the `anon_pipe_read` hang / early exit?
- This also restores the chord-survival seccomp guard as a side effect.

### P2 — Test H2/H3 for black-screen (SFxMM, Flinthook-hung)
- SDL video driver + FNA3D backend matrix under gamescope (Xwayland vs wayland;
  OpenGL/Zink vs Vulkan) on Turnip; capture SDL/FNA3D/Mesa init logs.
- gamescope focusable-window / presentation signal for the game surface
  (reuse SFxMM's focus investigation; do **not** reintroduce its reverted
  `env -u DISPLAY` / Wine `Graphics=` experiments).

### P3 — S3 SIGABRT (fold with in-progress `01KWGHXF36`)
- Deterministic repro on a **clean boot with no live compositor poking**
  (this session showed live `swaymsg` surgery aggravates it).
- gamescope debug build / layers to get the abort site behind `IWaitable hung up`
  and `Compositor released us but we were not acquired`.
- Evaluate the gamescope-korri 3.16.23 vs stock delta and patch 0004.

### P4 — Validation matrix
- Per title (Flinthook, FEZ, VVVVVV, SFxMM), **cold and warm** boot: process
  stays alive > 60 s **and** a DSI-2 screenshot shows real gameplay (not black),
  with the workspace-reconcile (`ee3e1cfc`) keeping it on `korri:steam-debug`.
- Clean stop leaves no residual `SteamLaunch AppId=…` / game / `korri-steam-app` tree.

## 5. Sequencing & exit criteria

1. **P0** then **P1** first: P1 is the cheapest concrete lever and, if H1 holds,
   may collapse S1/S2 across the cluster at once.
2. If P1 does not resolve it, **P2** (black-screen) and **P4** narrow per-symptom.
3. **P3** proceeds in parallel under `01KWGHXF36` (crash workstream).
4. Epic done when the P4 matrix passes for at least Flinthook + one of {FEZ, VVVVVV}
   and SFxMM renders, with root cause(s) documented under
   `docs/solutions/runtime-errors/`.

## 6. Guardrails (carried from this device's hard-won lessons)

- Never prototype InputPlumber / live-compositor changes on the live daily-driver
  (`01KY2W3HG2`); validate via a deployed NixOS generation.
- Always Steam **and** Moonlight through gamescope-korri; do not revert that.
- Multi-step device automation goes through a copied Nix-shebang script, not
  multi-command SSH one-liners; `/sys` is read-only in the guest.
- Diagnosis + user approval before code edits; capture repro first.

## 7. Non-goals

- Broad Proton/FEX version bumps or a ROCKNIX pin bump (tracked separately:
  `01KY37Z75K`) — unless P1/P2 pin the root there.
- Kiosk-hub survivability on abort (`01KWGHX442`) — complementary, not root-cause.
