---
id: 01KV0TZAVD2KVDXZKV7J4BMX9C
slug: move-catalog-peer-refresh-to-a-scoped-discovery-driven-servi
title: Move catalog peer refresh to a scoped discovery-driven service
origin: parked
status: To Do
priority: medium
labels:
  - catalog
  - peer-fabric
  - reliability
created: 2026-06-13
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/fix/unified-catalog-fabric
  branch: fix/unified-catalog-fabric
  repo: korri
  invoked_by: se-work
---

# Move catalog peer refresh to a scoped discovery-driven service

## Why it matters

The current snapshot slice refreshes remote peers when the catalog is requested, which is enough to avoid blocking self entries but still falls short of a fully daemon-scoped fabric that reacts to peer discovery without renderer traffic and cancels cleanly on shutdown.

## Acceptance Criteria

- [ ] CatalogSnapshotLive starts a scoped background consumer of PeerDiscovery.peers when the layer is built.
- [ ] Peer add/disappear events refresh or prune peer state without requiring app.library.list or app.library.snapshot to be called first.
- [ ] In-flight peer fetches are scope-bound and are cancelled when the RPC server layer is disposed.
- [ ] Tests cover peer add, peer removal, and shutdown/disposal behavior.

## Related

- `product/apps/portal/api/library/catalog-snapshot.ts`
- `product/apps/portal/peers/peer-discovery.ts`
- `work/items/active/01KV0RYJWKZHVBZ8ZVBHXHP63A-unified-catalog-fabric/plan.md`
