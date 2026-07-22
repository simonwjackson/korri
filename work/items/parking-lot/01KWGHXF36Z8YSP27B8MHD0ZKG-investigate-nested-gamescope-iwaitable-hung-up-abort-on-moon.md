---
id: 01KWGHXF36Z8YSP27B8MHD0ZKG
slug: investigate-nested-gamescope-iwaitable-hung-up-abort-on-moon
title: "Investigate nested gamescope 'IWaitable hung up' abort on Moonlight launch"
origin: parked
status: Resolved
priority: high
labels:
  - korri
  - gamescope
  - moonlight
  - steam
  - crash
  - sm8550
created: 2026-07-02
source: se-debug
---

# Investigate nested gamescope 'IWaitable hung up' abort on Moonlight launch

## Why it matters

The gamescope-korri 3.16.23 nested compositor wrapping Moonlight intermittently aborts with SIGABRT ('IWaitable hung up. Aborting.') shortly after the v4l2m2m decoder initializes. It reproduced on both Bandai (client) and aka (source-side) gamescope. When it fires it kills Moonlight/the stream. The trigger is not yet identified from logs; a preceding 'Failed to bind socket @/tmp/.X11-unix/X0: Address already in use' is only a benign fallback (collision with the compositor's own Xwayland :0). Manual runs with forced -codec h264 + fixed 720p have not reproduced it; the crashed runs negotiated HEVC via codec=auto. Needs isolation.

## Acceptance Criteria

- [ ] Root trigger of 'IWaitable hung up. Aborting.' is identified (fd/waitable that hangs up)
- [ ] Determine whether codec auto->HEVC vs forced h264 changes crash rate
- [ ] A reproducible minimal case or a fix/guard is documented

## Related

- `product/vendor/moonlight-embedded-korri/package.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/plugins/gamescope`

## Evidence 2026-07-04 (bandai, gba-anguna remote launch)

- Reproduced with **explicit `-codec h264`** at 1920x1080 — contradicts the earlier
  note that forced-h264 runs had not reproduced it. Codec is not the discriminator.
- Strong teardown-race correlation: fired ~1.1s after spawn on a launch made
  moments after quitting a previous stream session. The dying session still held
  X11 sockets (`X0`/`X1` bind failed → new Xwayland took `:2`); abort followed
  right after Xwayland/xkb init. Two earlier attempts in the same minute were
  rejected `session-busy` (121) — same stale-foreground window.
- Moonlight itself was fully up before the abort (local-control socket listening,
  v4l2m2m attached to iris, stream=1920x1080) — the wrapper died, not the client.
- Full stderr captured in bandai system journal Jul 04 02:48:51 (sessiond
  shell-launcher failed entry, exitCode=134); host side (aka sunshine):
  CLIENT CONNECTED 00:48:50 MT, DISCONNECTED :56, Initial Ping Timeout.
- Repro suggestion: quit an active stream and immediately relaunch another
  remote game; the race window appears to be the previous session's teardown.

## Evidence 2026-07-05 (bandai, Skate 3 / ps3-disc remote launch)

- Reproduced again post-pairing; full failed shell-launcher stderr in bandai
  system journal Jul 05 14:01:59 (exitCode 134). Sharper ordering marker: the
  abort fires IMMEDIATELY AFTER the second Xwayland/xkb compile that logs
  "Unsupported maximum keycode 709, clipping. X11 cannot support keycodes above
  255" (+ duplicate virtual-modifier Hyper/ScrollLock warnings) on the fallback
  `:1` Xwayland. Moonlight was fully up first (control socket listening,
  h264_v4l2m2m on /dev/video0 iris, stream=1280x720) -> aka encodes -> fans spin.
- Ruled OUT the X0 collision as the discriminator: `/tmp/.X11-unix/X0` is held by
  the OUTER kiosk compositor's Xwayland at all times (created at session start,
  owner korri), so "Failed to bind X0 -> fall back to :1" happens on EVERY nested
  launch, success or fail. The teardown-race framing should be re-centered on the
  `:1` Xwayland/xkb + input keymap path (keycode 709 device), not X0.
- Next probe: identify the input device exposing max keycode 709 (likely the
  `-input /dev/input/eventNN` controller mapped with high keycodes or libei), and
  whether removing/remapping it changes crash rate; capture which fd HUPs via
  gamescope verbose / strace on the `:1` Xwayland.
- Reproduction transport note: the `korri launch` CLI uses a "via nix" dev path
  that spawns a bare moonlight-embedded (NOT the kiosk gamescope wrapper) and does
  NOT reproduce this crash. The failing path is the renderer/daemon
  `app.library.launch` -> sessiond shell-launcher -> nested gamescope. Trigger it
  from the UI or the app RPC group, not the CLI.

## Input-device pinning 2026-07-05 (strong lead, not yet causally confirmed)

- The keycode-709 source is `/dev/input/event11` = the virtual "Microsoft X-Box
  360 pad" (ID_INPUT_JOYSTICK=1), which Moonlight is launched with via `-input
  /dev/input/event11`. Its KEY capability bitmask is 12 words wide (covers evdev
  codes up to ~767, including BTN_TRIGGER_HAPPY6 = 709); the keyboard (event9) is
  only 4 words (<=255). So this pad's >255 button codes are what make the nested
  Xwayland xkb compile log "Unsupported maximum keycode 709, clipping" right
  before the IWaitable abort.
- Disabling Xwayland is NOT a viable fix: moonlight-embedded links libX11 +
  libva-x11 (SDL2/X11 + VAAPI-X11), so the nested gamescope must keep Xwayland.
  The gamescope wrapper does expose `--xwayland-count` and an Xwayland mode
  control (GAMESCOPE_XWAYLAND_MODE_CONTROL=1), so the Xwayland path is
  configurable, but the fix must address the gamepad keymap, not remove Xwayland.
- Causation still unconfirmed: needs a controlled harness (run the nested
  gamescope+moonlight with vs without `-input event11`) to prove the pad triggers
  it. Deferred while operator is away (harness could wedge the kiosk).

## Hypothesis DISPROVEN 2026-07-05 (standalone harness)

Ran the exact nested gamescope + moonlight command STANDALONE (WAYLAND_DISPLAY=wayland-1,
hub still up, no sessiond handoff): `-app "Korri Stream" -input /dev/input/event11 -codec
h264 -platform v4l2m2m`. It reached the decode stage (v4l2m2m stream=1280x720), logged the
SAME "Unsupported maximum keycode 709, clipping" warning, and did NOT abort — it streamed
cleanly for the full 35s until timeout, then cleaned up gracefully. So the keycode-709 /
Xbox-pad (event11) is NOT the trigger; that xkb warning is benign as stated. The crash is a
kiosk-path TEARDOWN/HANDOFF RACE (renderer-stop + nested gamescope spawn, and/or the real
launch's `-O DSI-2` physical-output grab colliding with the outer compositor), which the
clean standalone harness does not exercise. Re-centers the fix on launch sequencing /
serializing the hub->stream handoff, matching the original teardown-race note. Next: capture
a real UI launch's timing (renderer-stop vs gamescope-spawn vs X-socket release).

## Evidence 2026-07-21 (bandai, Steam launch path — folds in 01KY3CACRF)

The SAME SIGABRT (systemd `status=134`) reproduces on the **Steam**
`korri-steam-gamescope` path, not just Moonlight — so this is one nested
gamescope-korri crash across both stream clients. Confirms the labels should
include `steam` as well as `moonlight`.

- Signature under Steam: `korri-steam-service-run: line 13: <pid> Aborted
  .../gamescope-korri-3.16.23-korri/bin/gamescope -f -W 1920 -H 1080 -O DSI-2 --`
  -> `korri-steam-gamescope.service: Main process exited, code=exited,
  status=134`; the `gamescopereaper` then "Killing children", tearing down
  Steam + the running game. Preceded by
  `[gamescope] [Error] xdg_backend: Compositor released us but we were not
  acquired. Oh no.` — the Steam-path manifestation of the same nested-backend
  waitable failure.
- **Strong support for the teardown/handoff-race conclusion above.** The aborts
  in this session all fired during **live sway surface reconfiguration** of the
  nested gamescope surface — `swaymsg` workspace moves, `fullscreen` toggles, and
  the pid-based `place_gamescope_workspace` move all reconfigure gamescope's xdg
  surface, and that is when it hit `Compositor released us`/`status=134`.
- On a **clean boot with NO live compositor poking**, gamescope did **not** abort
  across multiple Steam launches (only the benign `xwm: got the same buffer
  committed twice` + a non-fatal `Compositor released us` warning). So the crash
  is not intrinsic to gamescope-korri 3.16.23 startup — it is triggered by
  surface reconfiguration / the handoff race, exactly as the 07-05 standalone
  harness concluded. Corollary lesson (also `01KY2W3HG2`): do NOT debug this by
  poking the live compositor — it manufactures the very crash.
- The `-O DSI-2` physical-output grab colliding with the outer compositor (noted
  07-05) is consistent with the Steam path too: the Steam service's gamescope
  also grabs `-O DSI-2`.
- Cross-ref: this crash is symptom **S3** in the launch-failure epic
  `docs/plans/2026-07-21-001-fix-steam-fex-gamescope-launch-cluster-plan.md`.
  A separate resilience item (`01KWGHX442`) covers surviving the abort; a
  candidate mitigation is to avoid live surface moves during launch (the Steam
  workspace reconcile `ee3e1cfc` reconfigures the surface — evaluate placing via
  workspace assignment before the surface maps rather than a live move).
- Superseded/folded: `01KY3CACRF` (gamescope-korri SIGABRT under sway nested
  backend) — same crash, removed as a duplicate of this item.

## Evidence 2026-07-22 (bandai, Roundguard 848030 — Sway 1.12 disproven; Sway does NOT crash)

Reproduced the S3 abort on a **clean-boot Sway 1.12** generation (`1aa3fc85`,
gamescope-korri 3.16.23, explicit `--backend wayland`) during steady Roundguard
gameplay. Two prior back-to-back Roundguard runs this session also aborted
(~1 min and ~15 min). Key disproofs:

- **Sway 1.12 does NOT fix it.** Bumped outer Sway 1.11 -> 1.12 (wlroots 0.20.1)
  specifically to test the AKA hypothesis that the abort is downstream of a Sway
  segfault. Abort still fired at **elapsed ~640 s (~10.7 min)**, `status=134`.
- **Outer Sway did NOT crash.** `initial_sway=final_sway=1385` across the whole
  run; outer Xwayland (`1564`) also survived. Only the nested gamescope (`5099`)
  + its own Xwayland (`5209`) died. So on Bandai this is **not** the AKA
  Sway-segfault-at-0xb8 failure mode — the fault is internal to the nested
  gamescope, not the outer compositor. The Sway-crash hypothesis is disproven
  for this device.
- **Consistent precursor is the xwm double-commit, not IWaitable.** This abort
  had NO `IWaitable hung up` line — only
  `[gamescope] xwm: got the same buffer committed twice, ignoring` at
  11:05:15.189, then `5099 Aborted` at 11:05:15.275, then the nested Xwayland
  logged `failed to read Wayland events: Connection reset by peer` (a
  *consequence* of gamescope dying). Across all captured aborts the common
  denominator is `got the same buffer committed twice` (steamcompmgr/xwm
  buffer-commit path), not the waitable/input thread. Re-center the root-cause
  search on gamescope's XWM double-commit handling.
- **No kernel fault, no GMU stall, no DSI page-flip EBUSY, no coredump** in the
  abort window (11:04:30–11:05:40).
- **GPU clock is NOT causal.** This abort happened while GPU `max_freq` was
  capped at 220 MHz (a concurrent perf-bisection experiment); the earlier
  Sway-1.11 Roundguard abort happened at full 680 MHz. Same signature at both
  → clock ruled out.
- **Caveat re: the "only during live surface reconfiguration" 07-21 note.** No
  *manual* `swaymsg` poking occurred this run, yet it still aborted in
  steady-state. BUT the continuous `reconcile_gamescope_workspace()` reconciler
  (`ee3e1cfc`) may still issue periodic surface moves automatically — audit
  whether that reconciler is a live-reconfig source that keeps the surface
  churning during gameplay. If it is, the "teardown/handoff race" and
  "steady-state" framings converge on the same automatic-reconfig trigger.
- Sway 1.12 bump kept as a modernization (no regressions; device booted clean,
  all services `NRestarts=0`), NOT as the fix.
- **Next step:** symbolized gamescope-korri debug build to capture the `abort()`
  backtrace behind `got the same buffer committed twice`, rather than further
  config changes. Evidence file: `/tmp/korri-diag/sway112-abort-evidence.out`.

## ROOT CAUSE 2026-07-22 (symbolized gdb backtrace + DSI-2 flip-stall chain)

Deployed a symbolized gamescope-korri (`mesonBuildType=debugoptimized`,
`dontStrip`) + gdb, attached gdb to the nested gamescope during Roundguard
848030, and caught the SIGABRT. **This is the definitive root cause.**

### The abort site (proven)
```
Thread ".gamescope-wrap" received signal SIGABRT
#2  abort ()
#3  gamescope::CWaylandInputThread::ThreadFunc () at src/Backends/WaylandBackend.cpp:2880
```
The nested Wayland backend's **input thread** aborts when its poll on the
host-Wayland connection errors (`m_Waiter.PollEvents() < 0` or
`wl_display_read_events() < 0` -> `abort()`). This IS the historical
`IWaitable hung up. Aborting.` It is **upstream code** (matches
ValveSoftware/gamescope#1456 "wayland backend: high chance of aborting");
gamescope hard-`abort()`s on a host-connection error instead of recovering.

### The trigger (proven correlate)
At the abort instant the OUTER Sway compositor is in a sustained storm of
`connector DSI-2: Atomic commit failed: Device or resource busy` /
`Page-flip failed on output DSI-2`. No kernel DRM driver error accompanies it
-> EBUSY "previous page-flip still pending" (DSI-2 flip-done/vblank not
delivered in time). The display pipeline wedges -> the nested gamescope's
host-Wayland link errors -> input-thread `abort()`. Sway survives (PID
stable). Chain: **DSI-2 flip stall -> gamescope wl link error ->
CWaylandInputThread abort (status 134)**. gamescope is the victim.

### Presentation-path discriminator (proven)
- Plain Korri hub (Chromium, **direct to Sway**) ran 14 min this boot with
  **zero** DSI-2 EBUSY; the first EBUSY appeared the instant the nested
  gamescope `--backend wayland` Steam session started.
- `CWaylandInputThread` only exists in the nested `--backend wayland` config
  (Korri default) used by **Steam + Moonlight**. Direct-to-Sway apps never
  instantiate it. Ryubing/Switch and melonDS dual-screen present direct to
  Sway -> immune even under heavy load. **Raw thermal/CPU load is NOT the
  trigger; the nested-gamescope Wayland presentation path is.**

### Korri patches EXONERATED (device-verified)
- 0004 (wl_touch): abort documented 2026-07-13, patch dated 2026-07-20 -> cannot
  have introduced it.
- 0002 (explicit-sync) / 0003 (precompile): env gates set only in
  `rk3566RuntimeEnvironment` (Mali); confirmed UNSET on the deployed SM8550
  steam gamescope service -> inert on Bandai.
- 0001 (render-only device): Adreno has a primary node -> inert.
- Abort site is unmodified upstream code. No patch introduces this.

### Next levers (gamescope stays; fix must be in-path)
1. `GAMESCOPE_DISABLE_EXPLICIT_SYNC=1` experiment: explicit sync governs when
   Sway treats a gamescope buffer as ready to flip; test whether implicit
   dmabuf-fence sync changes the DSI-2 EBUSY/abort (patch 0002 already exposes
   it; zero new code).
2. Investigate why DSI-2 flip-done/vblank stalls under nested double-composite
   load (`irqaffinity=0-2` vs FEX core saturation; MDSS/DPU clock; wlroots
   commit pacing).
3. Upstream-hardening: gamescope should not `abort()` on a recoverable host-
   connection error (#1456).
Evidence: `/tmp/gamescope-abort-bt-20260722-112342.txt` (full symbolized bt).

### CORRECTION 2026-07-22 (explicit-sync experiment decouples EBUSY from abort)

Ran `GAMESCOPE_DISABLE_EXPLICIT_SYNC=1` (runtime drop-in) under Roundguard on
Adreno. Result **corrects the causal claim above**:
- DSI-2 EBUSY dropped from a ~50-68/min storm to **2 events total** ->
  explicit sync ON is what generates the DSI-2 flip-pacing EBUSY.
- **The abort STILL fired (~90 s), identical signature** (`xwm: got the same
  buffer committed twice` -> gamescope Aborted 134 -> nested Xwayland
  `Connection reset by peer`). So the **DSI-2 EBUSY storm is a correlated
  co-symptom of explicit-sync flip pacing, NOT the direct cause of the abort.**
- Disabling explicit sync is **not a fix**: on Adreno (working syncobj) it
  aborts sooner. Reverted.
- Sway logs **no** server-side protocol error to the gamescope client at the
  abort -> the connection is not killed by a Sway-side protocol rejection;
  gamescope's input thread aborts on a local `wl_display` error state.

**Revised lead:** the consistent direct precursor across every abort is
`xwm: got the same buffer committed twice, ignoring` immediately followed by
the gamescope<->Sway wl connection erroring. Next: re-capture under gdb and
inspect `wl_display_get_error()` / the errored proxy at the abort to learn WHY
the host connection enters an error state (candidate: gamescope's own
double-commit in its wayland-backend present path). Mitigation angle (keeps
gamescope): harden gamescope to not `abort()` on a recoverable host-connection
error (upstream #1456).

## RESOLVED 2026-07-22 (patch 0005 — commit `8ed348ea`)

Root cause (fully proven via symbolized gdb + `wl_display_get_error`): the
nested Wayland backend forwards a `wp_viewport` source/destination extent every
frame; when a game hangs/hiccups and re-commits a degenerate 0-height surface,
`ClipPlane` yields a non-positive extent (and divides the source scale by a zero
base). The host rejects it as a fatal `wp_viewport` `bad_value` (EPROTO, object
`wp_viewport`, code 0); the input thread's `wl_display_read_events()` returns
EPROTO and `CWaylandInputThread::ThreadFunc` `abort()`s (status 134). Present
and unfixed upstream through gamescope 3.16.25.

Fix `product/plugins/gamescope/packages/gamescope-korri/patches/0005-waylandbackend-guard-viewport-dimensions.patch`:
clamp `ClipPlane` clipped extents to non-negative, guard its divide against a
zero base, and **skip the entire per-frame present (viewport + attach) when the
source/destination width or height is not strictly positive**, keeping the last
valid frame. (An earlier viewport-only skip was insufficient — it shifted the
error to `out_of_buffer`; the whole degenerate present must be dropped.)

Validation on Bandai (SM8550):
- The exact killer frame recurred (`src 283x0 dst 283x0`, zero height) and was
  caught: `Korri: skipped present of degenerate frame ... keeping last frame`.
- gamescope did **not** abort (same PID, 0 restarts, Sway stable); Roundguard
  848030 ran **27+ min** under gdb watch and **35+ min** total (deploy ended
  it), versus 1-17 min crashes on every prior attempt. The degenerate frame was
  transient — the game recovered and kept playing.
- Landed as a stripped release build (debug symbols + gdb dropped) in generation
  `spvj60800hycrlxav8fabv4kgczh4jc9`.

Residual / follow-up (non-fatal now): the *reason* a game momentarily emits a
0-height frame (Unity/Mono/DXVK/FEX hiccup) is still uncharacterized, but it is
no longer fatal — the compositor survives it. Consider upstreaming patch 0005 to
ValveSoftware/gamescope#1456.
