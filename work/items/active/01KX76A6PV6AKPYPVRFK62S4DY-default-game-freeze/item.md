---
id: 01KX76A6PV6AKPYPVRFK62S4DY
slug: freeze-host-game-by-default-on-moonlight-disconnect-and-clie
title: Freeze host game by default on Moonlight disconnect and client lid-close
origin: parked
status: To Do
priority: high
labels:
  - freeze-resume
  - streaming
  - sunshine
  - fakesuspend
created: 2026-07-10
source: user
---

# Freeze host game by default on Moonlight disconnect and client lid-close

## Why it matters

When a Moonlight stream drops unintentionally (network) or the client lid closes, the host game today keeps burning CPU/GPU (or gets terminated by fakesuspend, losing state). Default behavior should be: freeze the host managed launch, thaw on reconnect. Both scenarios converge on one host-side watcher because a network-dropped client cannot signal; Sunshine on aka already logs CLIENT DISCONNECTED / New streaming session started, giving the detection signal. Mechanism already proven against Skate 3 (RPCS3+gamescope) on aka.

## Acceptance Criteria

- [ ] Host-side watcher (sessiond lifecycle hook or companion) observes Sunshine disconnect/reconnect signals and calls managed-launch freeze/thaw for the active launch.
- [ ] Hard network cut mid-stream results in the host game frozen (state T, ~0% CPU) within a bounded window; verify Sunshine's ungraceful-disconnect detection latency.
- [ ] Moonlight reconnect (New streaming session started) thaws the game before frames/input resume.
- [ ] bandai fakesuspend-controller sends best-effort remote freeze via the @korri:stream controlUrl instead of terminating the host game; falls back to host-side detection when network is already gone.
- [ ] Wake flow works end-to-end: lid open -> Moonlight relaunch -> session start -> host thaw -> gameplay resumes from frozen state.
- [ ] Long-freeze soak: game survives >=1h frozen and resumes cleanly (GPU fence/PipeWire recovery).
- [ ] Depends on: deploy of freeze endpoints to aka (push + mountainous flake bump) and RPC exposure item 01KX75XAWDVGPD7XW4V7MJ55EK.

## Related

- `product/services/device/fakesuspend-controller.ts`
- `product/services/device/overlay-remote-stop.ts`
- `product/services/device/sessiond.ts`
- `product/platform/plugin/session-lifecycle.ts`
- `work/items/parking-lot/01KX75XAWDVGPD7XW4V7MJ55EK-expose-managed-launch-freeze-thaw-through-effect-rpc-command.md`
- `work/items/parking-lot/01KX6M0HJK6AJCF7JC9XVKAZBH-upgrade-managed-launch-freeze-to-cgroup-v2-systemd-scopes.md`
