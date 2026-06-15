---
title: "feat: Remember discovered peers and gossip fleet membership"
type: feat
status: active
date: 2026-06-14
verify_command: "bun test product/apps/portal/peers product/apps/portal/api/peers"
---

# feat: Remember discovered peers and gossip fleet membership

## Summary

Make Korri peer discovery survive leaving the home LAN by giving the fleet a
memory. Persist every peer a node has met (today only via link-local mDNS) to
durable state, reload it on boot, and reconnect to those peers **by name** on
any network. Then let nodes gossip their directly-known peer sets to each other
so membership propagates transitively. mDNS stays as the zero-config LAN
fast-path; memory + gossip are the "everywhere else" path. No coupling to
Tailscale or any specific transport — the design only ever uses resolvable
names and lets the host resolver (MagicDNS, LAN DNS, `/etc/hosts`) route.

---

## Problem Frame

mDNS is multicast and link-local: it physically cannot cross an overlay network
like Tailscale, which has no broadcast domain. So today, the moment a device
leaves the home LAN it discovers nothing — even though the peers are reachable
by name over the tailnet (MagicDNS resolves `aka` to its tailnet IP). The naive
fix — a hand-maintained list of peer hostnames — is rejected: it's toil, it
rots, and it couples the mental model to "list every device." Discovery should
feel as automatic off-LAN as it does on it.

The committed name-addressing change (`3444681`) solved *reachability* (we now
connect by name, which resolves anywhere). This plan solves *discovery*: how a
node comes to **know** a peer exists when it can't hear the multicast shout.

---

## Requirements

- R1. A node persists peers it discovers so the set survives daemon restarts and
  reboots.
- R2. On boot, a node reloads remembered peers and federates with them by name,
  with no manual configuration.
- R3. A remembered-but-unreachable peer degrades gracefully (shows offline /
  `failed`, exactly like today) and recovers automatically when reachable again.
- R4. A node can learn about peers it never met directly, by gossiping with peers
  it does know (transitive fleet membership).
- R5. Gossiped peers are treated as untrusted candidates: they only contribute
  catalog entries after the same per-peer fetch validation that mDNS peers pass.
- R6. The design introduces no dependency on Tailscale APIs or any transport
  specific identifier — only resolvable host names.
- R7. A node never federates with itself via memory or gossip (self-filtered by
  `hostId`, consistent with the existing mDNS self-filter).

---

## Scope Boundaries

- Not building a central registry, coordinator election, or rendezvous service.
- Not adding a Tailscale (or any overlay) provider plugin — that is a separate,
  later "discovery provider" interface (discussed in-session). This plan keeps
  mDNS as the only live provider and adds memory + gossip around it.
- Not implementing cryptographic peer identity / signed gossip. Gossip trust in
  this plan is "validate by fetch"; signed identity is deferred.
- Not changing the streaming/launch routing path beyond what already consumes
  `controlUrl`.
- Not changing the vigie theme; it already reflects the federated peer set.

### Deferred to Follow-Up Work

- Pluggable discovery-provider interface with a local-`tailscaled` reader as a
  second provider (the "treat Tailscale like mDNS" idea). Separate plan.
- Signed/verified peer identity for gossip trust hardening.
- Configurable TTL-based forgetting of long-unreachable peers (this plan keeps
  peers indefinitely; see Key Technical Decisions).
- Surfacing `firstSeenAt` / provenance in the UI.

---

## Context & Research

### Relevant Code and Patterns

- `product/apps/portal/peers/peer-discovery.ts` — `makePeerDiscoveryLayer`
  owns the `SubscriptionRef<Map<controlUrl, PeerRecord>>` fed by mDNS
  (`watchStreamHosts`). `applyEvent` self-filters by `localHostId` and requires
  `caps: "source"`. This is the seam memory and gossip merge into.
- `product/apps/portal/api/catalog/catalog-snapshot.ts` — reads the peer ref and
  fans out via `PeerSourceFetcher`, marking each peer `ready`/`failed` per fetch
  (2s timeout). Liveness already lives here — memory must not assert liveness.
- `product/apps/portal/peers/peer-source-fetcher.ts` — `fetchPeerCatalogResult`
  fetches one peer's catalog by `controlUrl` via
  `createRemoteStreamControlClient`. Gossip needs an analogous "fetch a peer's
  known-peer set" call.
- `product/apps/portal/peers/catalog-peer-state.ts` — `makeSelfCatalogPeer`
  derives self identity from `makeLocalEntrySource(env).hostId`; `PeerRecord`
  shape is `{ hostId, controlUrl, displayName, caps }`.
- `product/apps/portal/api/rpc-server.ts` (and the services-server wiring it
  references in `product/services/server/rpc-server.ts`) — where
  `makePeerDiscoveryLayer` is constructed from env; both must pass the new store.
- `product/platform/config/xdg-paths.ts` — `korriStatePath(env, ...segments)`
  resolves `$XDG_STATE_HOME/korri/...`. Durable peer memory belongs here.
- `product/apps/cli/lan-stream-discovery.ts` — `candidateFromManualHost` /
  `normalizeControlUrl` build a `PeerRecord`-shaped candidate from a host name;
  reused to reconstruct remembered/gossiped peers into the ref.
- RPC convention (AGENTS.md): a new read-only RPC lives at
  `product/apps/portal/api/peers/known.rpc.ts` + `known.rpc-handler.ts`,
  registered in the app RPC group, mirroring `api/catalog/snapshot.rpc*`.

### Institutional Learnings

- Boot-scoped control plane: one peer-set per server process, owned by the
  layer scope (see the `peer-discovery.ts` header comment). Memory load and
  gossip pollers must be forked into that same scope so they die on shutdown.

---

## Key Technical Decisions

- **Memory is durable state, keyed by `hostId`.** Persist to
  `korriStatePath(env, "peers.json")` (`$XDG_STATE_HOME/korri/peers.json`).
  `hostId` is the stable identity; `controlUrl` is derived/refreshed. The
  in-memory ref stays keyed by `controlUrl` (Step-1 name-addressing keeps that
  stable), so the store reconciles into the ref by reconstructing records.
- **Keep peers indefinitely in v1; never auto-forget.** A peer you've met is
  fleet membership; a device that's merely powered off must not vanish. Record
  `firstSeenAt`/`lastSeenAt` for a future TTL prune (deferred). Liveness stays
  with the fan-out fetch, not the store.
- **Gossip exposes only *directly-known* peers, never the fanned-out view.** A
  dedicated read-only RPC (`app.peers.known`) returns the node's own discovered
  + remembered peers. This avoids amplification/echo loops; convergence happens
  naturally over polling cycles without recursive chasing.
- **Gossiped peers are candidates, validated by fetch (R5).** They enter the
  store/ref with provenance `gossip` and must resolve to a usable name, but they
  only contribute catalog entries once `PeerSourceFetcher` succeeds — identical
  to mDNS peers. No new trust surface for catalog content.
- **Provenance is recorded** (`source: "mdns" | "gossip" | "manual"`) to enable
  later policy (trust, prune, UI) without a schema change.
- **Self-filter at every entry point** (store load, mDNS apply, gossip merge) by
  `hostId` from `makeLocalEntrySource`, reusing the existing filter rationale.
- **No transport coupling (R6).** Nothing reads Tailscale state; peers are only
  ever names. Swapping the overlay changes nothing in this code.

---

## Open Questions

### Resolved During Planning

- *Where does memory live?* `$XDG_STATE_HOME/korri/peers.json` via
  `korriStatePath` — durable, reconstructable, not config, not cache.
- *Forget policy?* Keep indefinitely in v1; TTL prune deferred.
- *Gossip transport?* Dedicated `app.peers.known` read-only RPC, not a piggyback
  on `app.catalog.snapshot` (avoids amplifying the fanned-out view).
- *Trust model?* Validate-by-fetch; signed identity deferred.

### Deferred to Implementation

- Atomic-write strategy for `peers.json` (temp file + rename) and on-disk schema
  versioning.
- Whether gossip runs as its own forked poller or hooks the existing remote
  refresh cycle in `catalog-snapshot.ts`. Prefer a dedicated poller for
  isolation; confirm against the real fan-out timing when implementing.
- Exact gossip cadence and per-peer timeout (start from the existing 2s fetch
  timeout and a slow poll, tune against real tailnet latency).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce.*

```
                         ┌─────────────────────────────┐
   mDNS (LAN, live) ───▶ │                             │
                         │   PeerDiscovery peer-set    │ ──▶ catalog fan-out
   PeerStore (boot) ───▶ │   SubscriptionRef<Map<      │     (fetch each peer
                         │     controlUrl, PeerRecord>>│      by name → ready/
   Gossip merge ──────▶  │                             │      failed liveness)
                         └─────────────┬───────────────┘
                                       │ write-through (new/updated peers)
                                       ▼
                          peers.json  ($XDG_STATE_HOME/korri)
                          { hostId → { controlUrl, name, caps,
                                       firstSeenAt, lastSeenAt, source } }

   Gossip (periodic):  for each known peer P:
       GET P.app.peers.known  ──▶  candidates (P's directly-known peers)
           └─ drop self, drop already-known, require resolvable name
           └─ add with source="gossip"  ──▶ store + ref  ──▶ validated by fan-out fetch
```

Memory turns "discovered once on the LAN" into "known forever, everywhere."
Gossip turns "known to one node" into "known to the fleet."

---

## Implementation Units

### U1. Peer store (durable memory)

**Goal:** A persistence module that loads/saves the remembered peer set to
`peers.json` and merges new observations, behind a small interface for testing.

**Requirements:** R1, R3, R7

**Dependencies:** None

**Files:**
- Create: `product/apps/portal/peers/peer-store.ts`
- Create: `product/apps/portal/peers/peer-store.test.ts`

**Approach:**
- Define `StoredPeer` = `{ hostId, controlUrl, displayName, caps, firstSeenAt,
  lastSeenAt, source }` and a `PeerStore` interface: `load(): Promise<readonly
  StoredPeer[]>`, `remember(peer): Promise<void>`, `forget(hostId)` (for future
  prune; not auto-called).
- File path via `korriStatePath(env, "peers.json")`. Atomic write (temp +
  rename). Tolerate a missing/corrupt file by starting empty and logging.
- Keyed by `hostId`; `remember` upserts and bumps `lastSeenAt`, preserving
  `firstSeenAt`. Self (`localHostId`) is never stored.
- Inject the file-IO seam (and `env`) so tests use a temp dir / in-memory fake.

**Patterns to follow:**
- `product/platform/config/xdg-paths.ts` for path resolution.
- Effect-friendly module shape consistent with `peer-source-fetcher.ts`.

**Test scenarios:**
- Happy path: `remember` then `load` round-trips a peer with all fields.
- Edge case: `remember` an existing `hostId` updates `controlUrl`/`lastSeenAt`
  but preserves the original `firstSeenAt`.
- Edge case: `load` on a missing file returns `[]` (no throw).
- Error path: `load` on a corrupt/partial JSON file returns `[]` and logs,
  rather than throwing.
- Edge case: `remember` of the local `hostId` is a no-op (self never persisted).
- Integration: two `remember` calls for different hosts persist both; a
  subsequent `load` from a fresh instance returns both (survives "restart").

**Verification:**
- Peer set survives a simulated process restart (new store instance over the
  same temp dir reads back what was written).

---

### U2. Seed and write-through the peer store in discovery

**Goal:** Wire `PeerStore` into `makePeerDiscoveryLayer` so the ref is seeded
from memory on boot and every mDNS appearance writes through to the store.

**Requirements:** R1, R2, R7

**Dependencies:** U1

**Files:**
- Modify: `product/apps/portal/peers/peer-discovery.ts`
- Modify: `product/apps/portal/peers/peer-discovery.test.ts`

**Approach:**
- Add an optional `peerStore` option to `makePeerDiscoveryLayer`. On
  construction, load remembered peers and seed the `SubscriptionRef` (rebuild
  `PeerRecord`s, key by `controlUrl`), applying the same `localHostId` and
  `caps: "source"` filters used for mDNS.
- In the mDNS `appear` path, write-through to `peerStore.remember` (forked, must
  not block the stream). Reuse `applyEvent`'s filters so memory and live
  discovery stay consistent.
- Keep `PeerDiscoveryNoop` and the existing tests' default (no store) working:
  the store is optional; absent ⇒ today's behavior.

**Patterns to follow:**
- The forked, scope-bound consumer already in `makePeerDiscoveryLayer`.
- Self-filter and caps-filter logic in `applyEvent`.

**Test scenarios:**
- Happy path: a layer built with a pre-populated store seeds those peers into
  the ref before any mDNS event.
- Integration: an mDNS `appear` adds the peer to the ref AND calls
  `peerStore.remember` with the matching record.
- Edge case: a remembered peer whose `hostId` equals `localHostId` is not seeded
  (self-filter on load).
- Edge case: store absent ⇒ behavior identical to current mDNS-only layer
  (existing tests still pass).
- Integration: a peer seeded from the store, then re-seen via mDNS, results in a
  single ref entry (dedupe by `controlUrl`) and an updated `lastSeenAt`.

**Verification:**
- A node with a populated `peers.json` federates with those peers on boot with
  no mDNS traffic.

---

### U3. Production wiring (state path, both servers)

**Goal:** Enable the peer store in the real daemon(s) so memory is active
outside tests.

**Requirements:** R1, R2

**Dependencies:** U2

**Files:**
- Modify: `product/apps/portal/api/rpc-server.ts`
- Modify: `product/services/server/rpc-server.ts` *(verify path; the api
  rpc-server comment references the services-server wiring)*

**Approach:**
- Construct a file-backed `PeerStore` at `korriStatePath(process.env,
  "peers.json")` and pass it to `makePeerDiscoveryLayer` alongside the existing
  `localHostId`. Keep `PeerDiscoveryNoop` for `NODE_ENV === "test"`.
- Ensure both wiring sites (portal API and services server) pass the store so
  behavior can't drift between them.

**Patterns to follow:**
- Existing env-driven construction of `PeerDiscoveryConfigured` in
  `rpc-server.ts`.

**Test scenarios:**
- Test expectation: none for the wiring change itself (covered by U1/U2 unit
  behavior). If a thin layer-construction test is cheap, assert the non-test
  branch builds a store-backed layer.

**Verification:**
- Running daemon writes/reads `$XDG_STATE_HOME/korri/peers.json`; restart
  re-federates from it.

---

### U4. `app.peers.known` read-only RPC

**Goal:** Expose a node's directly-known peer set (discovered + remembered) so
other nodes can gossip from it.

**Requirements:** R4, R6, R7

**Dependencies:** U2

**Files:**
- Create: `product/apps/portal/api/peers/known.rpc.ts`
- Create: `product/apps/portal/api/peers/known.rpc-handler.ts`
- Create: `product/apps/portal/api/peers/known.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/app-rpc-group.ts` (register)
- Modify: `product/apps/portal/api/handlers.ts` (wire handler)

**Approach:**
- Response is the node's directly-known peers (from the `PeerDiscovery` ref /
  store): `{ hostId, displayName, controlUrl, caps, lastSeenAt }[]`. Exclude
  self. Deliberately NOT the fanned-out catalog `peers` (avoid echo).
- Read-only; reuse `@platform/api/rpc/*` helpers and typed errors per AGENTS.md.

**Patterns to follow:**
- `product/apps/portal/api/catalog/snapshot.rpc.ts` + `snapshot.rpc-handler.ts`
  for shape, registration, and handler wiring.

**Test scenarios:**
- Happy path: handler returns the current known-peer set excluding self.
- Edge case: empty peer set returns `[]`.
- Edge case: self is never present in the response even if somehow in the ref.
- Integration: a peer added to the ref (via mDNS or store) appears in a
  subsequent `app.peers.known` response.

**Verification:**
- `app.peers.known` against a node returns exactly its directly-known peers,
  self-excluded.

---

### U5. Gossip merge (learn peers from peers)

**Goal:** Periodically query known peers' `app.peers.known`, merge new
candidates into the store + ref (provenance `gossip`), validated by the existing
fan-out fetch.

**Requirements:** R4, R5, R6, R7

**Dependencies:** U3, U4

**Files:**
- Create: `product/apps/portal/peers/peer-gossip.ts`
- Create: `product/apps/portal/peers/peer-gossip.test.ts`
- Modify: `product/apps/portal/peers/peer-source-fetcher.ts` *(or a sibling
  fetcher)* to add a "fetch a peer's known peers" call via
  `createRemoteStreamControlClient`.
- Modify: `product/apps/portal/stream/remote-stream-client.ts` (expose the
  `app.peers.known` call on the remote client)
- Modify: `product/apps/portal/api/rpc-server.ts` (+ services server) to fork the
  gossip poller into the discovery scope.

**Approach:**
- Forked, scope-bound poller: for each currently-known peer, call its
  `app.peers.known`; for each returned candidate, drop self, drop already-known
  (by `hostId`), require a resolvable name, then `remember` it (source
  `gossip`) and add to the ref.
- No recursion / no chasing-of-chased: only query *directly-known* peers each
  cycle; transitive reach emerges across cycles. Cap work per cycle and reuse
  the per-peer timeout.
- Candidates contribute catalog entries only when `PeerSourceFetcher` later
  succeeds — gossip never injects entries directly (R5).

**Execution note:** Implement the merge/guard logic test-first — the loop and
self/dedup guards are the correctness core.

**Patterns to follow:**
- `refreshRemotePeers` concurrency/degrade pattern in `catalog-snapshot.ts`.
- The forked-scope consumer pattern in `peer-discovery.ts`.

**Test scenarios:**
- Happy path: a peer reporting an unknown third peer causes that third peer to
  be remembered and added to the ref with `source: "gossip"`.
- Edge case: a gossiped candidate equal to `localHostId` is dropped (self).
- Edge case: a gossiped candidate already known is a no-op (no duplicate, no
  provenance downgrade from `mdns` to `gossip`).
- Edge case: a candidate without a resolvable name is rejected.
- Error path: a peer whose `app.peers.known` errors/times out is skipped without
  failing the cycle or other peers.
- Integration: gossiped peers do not contribute catalog entries until a fetch
  against them succeeds (validate-by-fetch, R5).
- Edge case (loop safety): node A knows B, B knows A — a cycle converges and
  does not grow the set unbounded or oscillate provenance.

**Verification:**
- Starting from a single known peer, a node converges on the full reachable
  fleet over a few poll cycles, with all learned peers marked `gossip` and only
  reachable ones showing as `ready`.

---

## System-Wide Impact

- **Interaction graph:** `makePeerDiscoveryLayer` gains a store dependency and a
  gossip poller; both are forked into the existing discovery scope (die on
  shutdown). Catalog fan-out is unchanged — it still iterates the ref.
- **Error propagation:** store IO failures and gossip RPC failures must degrade
  (log + continue), never fail discovery or a snapshot. Mirrors the existing
  "peer federation skipped (partial failure)" posture.
- **State lifecycle risks:** `peers.json` write contention and partial writes →
  atomic temp+rename; corrupt-file tolerance. Self must never be persisted or
  gossiped.
- **API surface parity:** new `app.peers.known` RPC must be registered in the
  app RPC group and exposed on the remote client used for gossip.
- **Integration coverage:** seed-from-store and gossip-merge are multi-layer
  behaviors that mocks alone won't prove — cover the store↔ref↔fan-out path.
- **Unchanged invariants:** mDNS LAN discovery, the `caps: "source"` federation
  filter, the self-filter, and liveness-via-fetch are all preserved. Memory and
  gossip only *add* sources into the same peer ref.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Gossip amplification / echo loops | Expose only directly-known peers (not the fanned-out view); no recursion; dedupe by `hostId`; convergence over cycles |
| Malicious/buggy peer injects bogus peers | Gossiped peers are candidates; contribute entries only after fetch validation; resolvable-name gate; provenance recorded; signed identity deferred |
| Stale peers accumulate forever | Record `firstSeenAt`/`lastSeenAt`; TTL prune deferred but data is already captured |
| `peers.json` corruption / partial write | Atomic temp+rename; tolerate parse failure by starting empty + logging |
| Self federating with itself | Self-filter by `hostId` at store load, mDNS apply, and gossip merge |
| Two wiring sites (portal API + services server) drift | U3 explicitly wires both; verify the second path during implementation |
| Off-LAN node never met any peer | Acknowledged limit (true of mDNS too); a one-time introduction is a deferred follow-up, not part of v1 |

---

## Phased Delivery

### Phase 1 — Remember (U1–U3)
Durable peer memory: meet on the LAN once, federate by name everywhere after a
restart. Self-contained and independently valuable; ship first.

### Phase 2 — Gossip (U4–U5)
Transitive membership: learn peers you never met directly through mutual peers.
Builds on Phase 1's store and ref.

---

## Sources & References

- Origin: in-session design discussion (this conversation).
- Builds on commit `3444681` — `fix(discovery): address discovered peers by hostname, not LAN IP`.
- Related code: `product/apps/portal/peers/peer-discovery.ts`, `product/apps/portal/api/catalog/catalog-snapshot.ts`, `product/apps/portal/peers/peer-source-fetcher.ts`, `product/apps/portal/peers/catalog-peer-state.ts`, `product/platform/config/xdg-paths.ts`, `product/apps/cli/lan-stream-discovery.ts`.
- Deferred sibling: pluggable discovery-provider interface (local-`tailscaled` reader) — separate plan.
