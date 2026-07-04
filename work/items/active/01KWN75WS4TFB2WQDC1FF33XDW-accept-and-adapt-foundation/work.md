---
id: 01KWN75WS4TFB2WQDC1FF33XDW
slug: accept-and-adapt-foundation
title: "Layer 2 — accept-and-adapt so any computed setting lands"
status: active
created: 2026-07-03
source: se-plan
---

# Layer 2 — accept-and-adapt so any computed setting lands

The foundation the future adaptive controller sits on: the runtime stream-settings
mechanism must accept any bitrate / FPS / resolution value and coerce it to the
nearest achievable (clamp to encoder-safe min/max, round to even, tolerate
same-ratio rounding), never reject for being off a preset. Resolution is
scale-only — coerce along the fixed aspect ratio, never reshape.

Consolidates two parked items into one coherent slice:

- `01KWN2KEGT3NGTJZ6SHDRJ3YEG` — coerce runtime bitrate/FPS instead of rejecting.
- `01KWN5M3AQR7TVMDDB0FHQ29GA` — tolerate integer-rounding aspect deltas so
  same-ratio scaled resolutions apply host-side.

Resolution client coercion and the `[object Object]` CLI error fix already shipped
this session; they are Gate-A prerequisites, not units here.
