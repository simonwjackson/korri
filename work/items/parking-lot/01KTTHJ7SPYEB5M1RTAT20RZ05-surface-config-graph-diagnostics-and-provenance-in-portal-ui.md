---
id: 01KTTHJ7SPYEB5M1RTAT20RZ05
slug: surface-config-graph-diagnostics-and-provenance-in-portal-ui
title: Surface config-graph diagnostics and provenance in portal UI and events
origin: parked
status: To Do
priority: medium
labels:
  - config
  - removable-media
  - portal
  - follow-up
created: 2026-06-11
source: se-work
---

# Surface config-graph diagnostics and provenance in portal UI and events

## Why it matters

ProseQL 0.15 adoption switched the config graph to skip-fragment containment: broken fragments no longer freeze rebuilds, so diagnostics are now the only signal a card file or local edit was skipped. They flow through ConfigGraphEvent.diagnostics on /api/config/events, but nothing in the portal GUI renders them, ConfigGraphEvent still does not carry the resolved root set (agent-native review gap: "card mmcblk1p1 joined with 3 games" is unanswerable), and record provenance ($documentGraph.getRecordProvenance, needed for slice D write-target routing) is unexposed beyond the db handle. Also flagged in review: diagnostic messages/paths include absolute server paths serialized to event subscribers — decide whether to relativize them at the controller seam.

## Acceptance Criteria

- [ ] Portal GUI shows skipped-fragment / ignored-collection diagnostics from config events (at minimum in a debug/settings surface)
- [ ] ConfigGraphEvent (or a sibling endpoint) exposes the resolved root set with restricted/trusted classification
- [ ] Record provenance is reachable through a typed API for slice D write-target decisions
- [ ] Decision recorded on relativizing absolute fragment paths in serialized diagnostics

## Related

- `product/platform/library/config-graph-controller.ts`
- `product/platform/library/proseql/config-graph-db.ts`
- `01KTRYCK5XYMCSVYD55P7XWBDY`
