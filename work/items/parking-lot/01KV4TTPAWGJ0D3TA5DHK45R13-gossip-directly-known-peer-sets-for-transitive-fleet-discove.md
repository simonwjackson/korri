---
id: 01KV4TTPAWGJ0D3TA5DHK45R13
slug: gossip-directly-known-peer-sets-for-transitive-fleet-discove
title: Gossip directly-known peer sets for transitive fleet discovery
origin: parked
status: To Do
priority: medium
labels:
  - discovery
  - federation
created: 2026-06-15
source: se-work
---

# Gossip directly-known peer sets for transitive fleet discovery

## Why it matters

Phase 1 (durable peer memory) makes a node re-federate by name with peers it has personally met on the LAN. Gossip closes the remaining gap: a node learns about peers it never met directly, through mutual peers, so the fleet becomes self-describing across networks. Without it, a device that never shared a LAN with another node stays invisible even when both are on the tailnet. This is the second half of the remember+gossip discovery design and the last piece needed for fully automatic cross-network discovery with no hand-maintained list and no transport coupling.

## Acceptance Criteria

- [ ] U4: a read-only app.peers.known RPC returns the node's directly-known peers (discovered + remembered), excludes self, and is NOT the fanned-out catalog view (anti-amplification).
- [ ] U5: a forked, scope-bound gossip poller queries known peers' app.peers.known and merges new candidates into the store+ref with provenance 'gossip'.
- [ ] Self-filtered and dedup-by-hostId at merge; candidates require a resolvable name.
- [ ] Gossiped peers contribute catalog entries only after the existing per-peer fetch succeeds (validate-by-fetch; no new trust surface).
- [ ] Loop safety: a knows-b / b-knows-a cycle converges without unbounded growth or provenance oscillation; a peer whose app.peers.known errors is skipped without failing the cycle.
- [ ] Starting from one known peer, a node converges on the full reachable fleet over a few poll cycles.

## Related

- `work/items/active/01KV4RMPKD5A949X7M447MR4TZ-feat-peer-memory-gossip/plan.md`
- `product/apps/portal/peers/peer-discovery.ts`
- `product/apps/portal/peers/peer-store.ts`
- `product/apps/portal/peers/peer-source-fetcher.ts`
- `product/apps/portal/api/catalog/catalog-snapshot.ts`
- `product/apps/portal/stream/remote-stream-client.ts`

## Notes

Lifted from Phase 2 (U4-U5) of the peer-memory-gossip plan after Phase 1 (U1-U3, durable memory) shipped on trunk (45131ed, ac2d587, 41758da). Design: U4 new RPC at product/apps/portal/api/peers/known.rpc.ts + known.rpc-handler.ts (mirror api/catalog/snapshot.rpc*), registered in app-rpc-group + handlers. U5 new product/apps/portal/peers/peer-gossip.ts forked poller; extend peer-source-fetcher (or sibling) + remote-stream-client to call app.peers.known. Builds on the committed PeerStore (remember with source 'gossip') and the federatable() gate. Trust hardening via signed identity remains a separate deferred follow-up.
