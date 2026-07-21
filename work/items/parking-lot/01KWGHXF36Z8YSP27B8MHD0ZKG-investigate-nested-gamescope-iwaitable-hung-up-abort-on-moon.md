---
id: 01KWGHXF36Z8YSP27B8MHD0ZKG
slug: investigate-nested-gamescope-iwaitable-hung-up-abort-on-moon
title: "Investigate nested gamescope 'IWaitable hung up' abort on Moonlight launch"
origin: parked
status: In Progress
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
