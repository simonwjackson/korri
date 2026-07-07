---
id: 01KWX9Q78CY3QNQ5BXV1BJ47ER
slug: add-handoff-aware-preemptive-stream-downshift
title: Add handoff-aware preemptive stream downshift
origin: parked
status: In Progress
priority: high
labels:
  - stream-control
  - adaptive
  - handoff
created: 2026-07-07
source: user
---

# Add handoff-aware preemptive stream downshift

## Why it matters

A user can start on strong home Wi-Fi and then walk into a weaker mobile connection. Waiting for the stream to choke can make runtime control commands fail, so Korri should detect route/link transitions and drop to a playable floor before congestion builds.

## Acceptance Criteria

- [ ] Detect network transition signals relevant to handheld streaming, such as Wi-Fi to cellular, route/interface change, reconnect, or abrupt RTT/loss spike.
- [ ] On transition, preemptively request a low playable profile such as 500kbps/30fps/640x360 before waiting for normal adaptive health windows.
- [ ] Verify that walking from good to shaped/weak network avoids multi-second command failure and preserves control responsiveness.
- [ ] Define recovery behavior after handoff so quality climbs only after the new connection is stable.

## Related

- `product/platform/stream/stream-adaptive-runner.ts`
- `product/platform/stream/stream-health-monitor.ts`
- `product/platform/stream/stream-handoff-trigger.ts`

## Notes

Separate from preflight: this handles already-running streams when connection quality changes suddenly.
