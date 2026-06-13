---
id: 01KV142WAKP13496XHF3TXJNJK
slug: throttle-repeated-catalog-peer-refresh-failures
title: Throttle repeated catalog peer refresh failures
origin: parked
status: To Do
priority: medium
labels:
  - catalog
  - reliability
  - follow-up
created: 2026-06-13
source: se-work
---

# Throttle repeated catalog peer refresh failures

## Why it matters

The new catalog facts snapshot keeps self reads responsive, but a UI polling every second can still retry failed LAN peers on every poll and create log/network churn while peers are offline.

## Acceptance Criteria

- [ ] Peer refresh state tracks a bounded retry/backoff window per failed peer.
- [ ] Fabric snapshot reads continue to return cached failed/loading peer facts without probing every UI poll.
- [ ] Tests cover repeated failed peer snapshots and assert retries are throttled while self entries remain available.

## Related

- `product/apps/portal/api/catalog/catalog-snapshot.ts`
- `product/apps/portal/peers/peer-source-fetcher.ts`
- `work/items/active/01KV10SX4W8N8S25SPJK0M31E5-theme-owned-catalog-facts/plan.md`

## Notes

Raised during code review of theme-owned catalog facts. This is operational hardening beyond the full-break contract migration.
