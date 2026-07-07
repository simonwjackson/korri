---
id: 20260707045609
slug: stream-startup-preflight-handoff
title: "Stream quality startup, preflight, and handoff control"
status: active
created: 2026-07-07
source: se-plan
---

# Stream quality startup, preflight, and handoff control

Plan the next stream-quality product slice after the playable-first rescue validation:

- extend the existing adaptive range grammar from `floor..ceiling` to `floor..startup..ceiling`;
- use startup quality to avoid launch-time flooding while preserving explicit ceilings;
- add launch-time preflight quality selection; and
- add running-stream early downshift for health/handoff collapse signals.

Consolidates the current conversation's parked follow-ups into one coherent implementation plan:

- `01KWX9Q78A1BQ5AAAANNM4SCRJ` — Add preflight probe for stream launch quality selection.
- `01KWX9Q78CY3QNQ5BXV1BJ47ER` — Add handoff-aware preemptive stream downshift.
- `01KWX6X2C5RZ08BTG9FSXYBHNY` — Explore replacing explicit stream emergency mode with unified controller is related design-debt, but intentionally deferred from this implementation slice.
