---
id: 01KWSW2PACX853A43EKWTCB897
slug: rethink-remote-stream-launch-to-avoid-the-nested-compositor-
title: Rethink remote-stream launch to avoid the nested-compositor teardown/handoff race
origin: parked
status: To Do
priority: medium
labels:
  - streaming
  - moonlight
  - gamescope
  - sessiond
  - architecture
  - design
  - reliability
created: 2026-07-05
source: user
---

# Rethink remote-stream launch to avoid the nested-compositor teardown/handoff race

## Why it matters

The current remote-stream launch tears down the kiosk home renderer (Chromium hub) and, in its place, spawns a whole SECOND nested compositor (gamescope) wrapping Moonlight to display the remote video. The teardown of the home display and the spin-up of the nested compositor race over the same screen, and the nested gamescope intermittently SIGABRTs (~1s in, "IWaitable hung up") before showing any frame — Moonlight connects fine and aka encodes (fans spin), but the display engine dies, leaving a black screen; a retry with different timing usually works. Device evidence + harness (2026-07-05) proved it is NOT the input device / keycode-709 / -O DSI-2 (a clean standalone stream runs fine) but a kiosk hub->stream handoff race. The just-shipped sessiond self-heal (commit 3783722a) makes a crash survivable (flicker-and-recover instead of a bricked black screen), but the architecture is still intrinsically collision-prone: spinning up and swapping in a separate display engine on every launch. User instinct (2026-07-05): "pulling the connection and then dropping off ... feels intrinsically buggy; I wonder if there's a better way." There is, and it likely deletes the whole bug class rather than patching timing.

## Acceptance Criteria

- [ ] Evaluate rendering the remote stream as a surface/window inside the EXISTING kiosk compositor instead of spawning a nested gamescope (no home teardown, no second compositor, no handoff race).
- [ ] Evaluate a prepare-then-switch sequence: establish and confirm the stream off-screen, and only switch the display to it once it is actually streaming (never present a black/dead screen; worst case wait on home).
- [ ] Evaluate a warm/persistent stream-client model to remove cold-start spin-up races.
- [ ] Pick a direction and capture the trade-offs (latency, input routing, Xwayland needs for moonlight-embedded, compositor ownership) in a short design note.
- [ ] If nesting must stay, at minimum serialize the hub renderer teardown (full Xwayland/display release) before spawning the nested compositor, closing the race window.

## Related

- `01KWGHXF36Z8YSP27B8MHD0ZKG`
- `01KWGHX442E8ZNEYWA16E1VZAK`
- `product/services/device/sessiond-role.ts`
- `product/apps/portal/stream/moonlight-launcher.ts`
- `01KWMZ3RP3KJ9PT9PB2AN84M6W`
