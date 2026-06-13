---
id: 01KV0QD3V7TYH6CPQ5FD1GQ7SZ
slug: make-home-library-loads-independent-of-peer-fan-out-latency
title: Make home library loads independent of peer fan-out latency
origin: parked
status: To Do
priority: medium
labels:
  - gui
  - startup
  - federation
created: 2026-06-13
source: se-work
---

# Make home library loads independent of peer fan-out latency

## Why it matters

The kiosk rail now escapes the loading placeholder, but app.library.list can still take several seconds when an offline peer is discovered. If the first render overlaps daemon startup, that latency makes the home screen feel stuck and complicates cold-start confidence.

## Acceptance Criteria

- [ ] Home route renders local library entries quickly when one advertised peer is offline or connection-refused.
- [ ] Peer catalog failures do not reset an already-rendered local rail to Loading library.
- [ ] A test covers app.library.list or the home data path with an unreachable peer and asserts local results are available without waiting for the peer timeout.

## Related

- `product/apps/portal/peers/peer-source-fetcher.ts`
- `product/apps/portal/api/library/list.rpc-handler.ts`
- `product/platform/react/library/library-atoms.ts`
