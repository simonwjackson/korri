---
id: 01KWJJVSJZ1VYDPG238K5Y5K7V
slug: fix-korri-sunshine-xdg-runtime-dir-pulse-server-so-it-starts
title: Fix korri-sunshine XDG_RUNTIME_DIR/PULSE_SERVER so it starts and gets audio
origin: parked
status: To Do
priority: high
labels:
  - korri
  - aka
  - sunshine
  - audio
  - streaming
  - regression
created: 2026-07-02
source: se-debug
---

# Fix korri-sunshine XDG_RUNTIME_DIR/PULSE_SERVER so it starts and gets audio

## Why it matters

The current korri-sunshine user unit on aka sets XDG_RUNTIME_DIR=/run/user/1000 (intended to reach the PipeWire-Pulse socket at /run/user/1000/pulse/native for stream audio). But the compositor's Wayland socket lives at /run/user/1000/korri-compositor/wayland-1, so the wait-for-wayland ExecStartPre times out ('timed out waiting for /run/user/1000/wayland-1') and Sunshine fails to start entirely -- no stream host at all. The two sockets live under different runtime dirs, so a single XDG_RUNTIME_DIR can't satisfy both. Correct fix: keep XDG_RUNTIME_DIR on the compositor dir (video capture) and set PULSE_SERVER=unix:/run/user/1000/pulse/native explicitly (audio). Verified live: a Pulse client connects with that exact env, and Sunshine boots cleanly. Currently patched only via a temporary runtime drop-in (~/.config/systemd/user/korri-sunshine.service.d/override.conf) that must be replaced by a proper config change and then removed.

## Acceptance Criteria

- [ ] korri-sunshine starts cleanly from a fresh nixos switch/reboot with no runtime drop-in
- [ ] Sunshine finds the compositor Wayland socket (video) AND connects to PipeWire-Pulse (audio) on stream start -- no 'Couldn't connect to pulseaudio: Access denied'
- [ ] The env is set in the korri daemon module (or mountainous aka config) via XDG_RUNTIME_DIR=<compositor runtime dir> + PULSE_SERVER=unix:/run/user/1000/pulse/native
- [ ] Temporary drop-in override.conf removed from aka once the config fix lands

## Related

- `product/systems/nixos/modules/korri-daemon.nix`
- `product/systems/nixos/modules/korri-game-stream.nix`
- `hosts/aka/default.nix (mountainous)`
- `~/.config/systemd/user/korri-sunshine.service.d/override.conf (aka, temporary)`
