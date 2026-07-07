---
id: 01KWX6X2C5RZ08BTG9FSXYBHNY
slug: explore-replacing-explicit-stream-emergency-mode-with-unifie
title: Explore replacing explicit stream emergency mode with unified controller
origin: parked
status: To Do
priority: medium
labels:
  - stream-control
  - adaptive
  - design-debt
created: 2026-07-07
source: user
---

# Explore replacing explicit stream emergency mode with unified controller

## Why it matters

The current shed/emergency path works but feels like a special-case hack. A unified controller could make stream quality feel more principled: continuously choose the best playable target from live health, device ceilings, and floors instead of switching into a bespoke emergency mode.

## Acceptance Criteria

- [ ] Document whether explicit shed mode can be replaced by a single continuous control law without regressing bad-network rescue time.
- [ ] Prototype or model target selection from ceiling/startup/floor constraints using the same math for downshift and recovery.
- [ ] Verify the design still reaches a playable floor quickly under 6mbit/55ms/2% loss and does not overreact during startup warmup.
- [ ] Capture tradeoffs versus the current emergency burst implementation, including command ordering and safety/recovery behavior.

## Related

- `product/platform/stream/stream-adaptive-controller.ts`
- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/stream-health.ts`

## Notes

User concern: explicit emergency mode feels hacky; investigate whether a continuous controller with ceilings/floors can make the same behavior emerge naturally.
