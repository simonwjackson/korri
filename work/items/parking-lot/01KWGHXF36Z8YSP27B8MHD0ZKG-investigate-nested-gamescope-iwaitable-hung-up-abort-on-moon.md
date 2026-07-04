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
