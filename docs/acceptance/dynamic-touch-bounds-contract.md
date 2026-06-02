---
title: Dynamic Moonlight touch-bounds contract
status: active
date: 2026-06-02
---

# Dynamic Moonlight touch-bounds contract

Dynamic absolute-touch support is a Moonlight client-side input contract. Korri maps the displayed stream surface to raw touchscreen ABS bounds and sends those bounds to Moonlight over local-control as `input.setTouchBounds`.

## Coordinate spaces

- **Compositor pixels**: Sway reports the displayed stream surface `rect` and containing output `rect`.
- **Gamescope mode facts**: Gamescope readback may provide the inner stream/game mode used to derive fit/letterbox insets. Unknown scaling policy fails closed rather than treating black bars as game surface.
- **Touch ABS coordinates**: Moonlight reports the primary touchscreen ABS range in `state.snapshot.input.absoluteTouch.absRange`. Runtime bounds sent to `input.setTouchBounds` are in this raw ABS space.
- **Sunshine host input mapping**: Sunshine still maps Moonlight absolute mouse packets to its host-side touch port. Dynamic touch bounds do not change Sunshine runtime settings.

## Runtime behavior

- `input.setTouchBounds` is local input control, not a Sunshine runtime setting.
- `applied` for `input.setTouchBounds` means Moonlight updated its local evdev bounds snapshot.
- Before the first valid dynamic bounds in managed dynamic mode, `-absolutetouchrequirebounds` makes Moonlight ignore absolute-touch events instead of using the full touch range.
- Static `-absolutetouchbounds x,y,w,h` remains a manual fallback/diagnostic seam. It is not sufficient for moved, resized, or reshaped stream surfaces.
- On geometry/control failure after a successful update, Korri keeps the previous known-good bounds and records degraded status rather than killing the stream.

## Validation expectations

A supported movable/resizable surface must prove:

- initial dynamic bounds are applied after stream/control readiness;
- moving the stream surface changes the ABS origin;
- resizing/reshaping changes the ABS size or derived inner viewport;
- touches outside the active stream surface are ignored;
- runtime-watch artifacts show local input-control proof separately from Sunshine host-apply proof.
