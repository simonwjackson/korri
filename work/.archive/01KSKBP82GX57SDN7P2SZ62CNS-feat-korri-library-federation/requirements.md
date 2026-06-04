---
date: 2026-05-27
topic: korri-library-federation
---

# Korri Library Federation

## Summary

Make the home screen on any Korri device show the union of every Korri server library reachable on the LAN, with each entry source-tagged. Fan-out happens server-side via mDNS auto-discovery; the desktop bun stays a pure pass-through; the `lastConnectedServer` / waiting page / connection state machine are removed outright with zero backwards-compat.

---

## Problem Frame

Korri's desktop app currently models the home screen as a window into one server's library. The desktop bun forwards `/api/*` to a single configured upstream (`lastConnectedServer.controlUrl`), shows a waiting page until that one server is reachable, and returns 503 from `/api/*` when it isn't. On a device that runs its own korri-server, this means the local library is invisible whenever the device is connected to a remote — exactly the situation that motivated this brainstorm. PICO-8 entries authored on Sobo were unreachable from Sobo's own home screen while it was connected to AKA, even though Sobo's korri-server, the entries, and the cart files were all present and healthy on the device.

Two prior brainstorms — `../../01KRYRGG17Y6WHJ5F91BZTTYC6-feat-korri-lan-stream-discovery/requirements.md` and `../../01KS1AX718CW379VHCYVJXEW82-feat-headless-source-aware-server/requirements.md` — already established the product thesis: local availability and remote availability are both attributes of content, the host is infrastructure behind that content surface, and the player should see "what can I play here or nearby" without picking a server first. They shipped the wire contracts (`app.source.list`, `app.server.stream.prepare`, mDNS advertise + browse), but stopped short of changing the desktop's single-upstream forwarder, so the federation surface never reached the home screen.

The renderer-bun-boundary refactor that landed days ago entrenched the single-upstream forwarder shape, which makes the next slice's choice clear: aggregate server-side, retire the "current server" UX, let mDNS reachability define the peer set, and accept zero backwards compatibility on the removals.

---

## Actors

- A1. Player: Uses the Korri desktop app on a device (which may or may not have a local library of its own) to see and launch games from anywhere on their LAN without choosing a server.
- A2. Desktop bun forwarder: Pass-through HTTP proxy. Discovers any reachable Korri server via mDNS and forwards `/api/*` requests there. Holds no product state beyond the cached current upstream.
- A3. Local korri-server (when present): Owns the device's own library, advertises itself on mDNS, browses for peers, fans out library queries across peers, and routes launches.
- A4. Peer korri-server: Any other Korri server reachable on the same LAN. Contributes its catalog via `app.source.list` and accepts launches via `app.server.stream.prepare`.

---

## Key Flows

- F1. Boot and discover
  - **Trigger:** Korri desktop app starts on a device.
  - **Actors:** A2, A3 (when present), A4
  - **Steps:** Desktop bun starts; mDNS browse begins; if a local korri-server is present it advertises on the same network and is discoverable like any other peer; the forwarder's upstream-pick uses a loopback probe as a fast path and falls back to discovered peers; the WebView issues `/api/library/list` once the forwarder has any upstream.
  - **Outcome:** The home rail renders the federated catalog assembled by whichever peer the forwarder reached.
  - **Covered by:** R1, R2, R3, R5, R7, R8

- F2. List the federated library
  - **Trigger:** The desktop UI calls `app.library.list`.
  - **Actors:** A3 (or A4 when no local server exists), A4
  - **Steps:** The receiving korri-server returns its own library entries; for every currently-reachable peer in its discovery set it calls `app.source.list` and appends those entries; each returned entry carries a source tag; peers that fail to respond contribute nothing and do not fail the overall response.
  - **Outcome:** A single response containing entries from every reachable peer, each labeled by source.
  - **Covered by:** R3, R6, R7, R9, R10

- F3. Launch a federated entry
  - **Trigger:** The player chooses any entry in the home rail.
  - **Actors:** A1, A3 (or A4 when no local server exists), A4 (when entry is remote)
  - **Steps:** The launch request reaches a korri-server; the server reads the entry's source tag; for a local entry the server uses the existing local launch path; for a remote entry the server calls `app.server.stream.prepare` against the source peer and continues with the existing stream-prepare result.
  - **Outcome:** Local entries launch locally; remote entries are prepared on their home peer for the existing stream flow.
  - **Covered by:** R11, R12, R13

- F4. Peer comes and goes
  - **Trigger:** A peer joins or leaves the LAN; its mDNS record appears or expires.
  - **Actors:** A3 (or A4), A4
  - **Steps:** The discovering server adds or removes the peer from its in-memory set; subsequent `app.library.list` snapshots reflect the change; no toast, badge, or notification surfaces to the UI; the rail simply grows or shrinks on next refresh.
  - **Outcome:** The federated catalog tracks reachability changes silently.
  - **Covered by:** R6, R10, R14

---

## Requirements

**Forwarder shape**
- R1. The desktop bun forwarder must obtain its upstream via discovery, not via a configured address. mDNS results, with a loopback probe fast-path for performance, are the only upstream sources.
- R2. The forwarder must remain a pure HTTP pass-through. It must not aggregate, tag, transform, or merge responses; it must not maintain peer state beyond a cached current upstream.
- R3. An empty home rail is the legitimate state when no library data is available (no local server, no reachable peer). The forwarder, the server, and the UI must not introduce a "no servers" splash, banner, modal, or wait state to cover this case. The exact wire-level signal between forwarder and UI is a planning decision; the product requirement is that no special UI surfaces.

**Server-side federation**
- R4. Every korri-server that exposes a library must advertise its presence on mDNS, regardless of whether the device is streaming-capable.
- R5. Every korri-server must continuously browse mDNS for peers and maintain an in-memory set of currently-reachable peers. No persisted peer state. No manual peer-add path.
- R6. `app.library.list` returns the union of the server's local library and entries fetched from each reachable peer via `app.source.list`. Each returned entry carries a source identifier sufficient for the UI to distinguish local vs. remote and for the launch path to route by source.
- R7. The `app.source.list` and `app.library.list` RPCs retain their existing split: `app.source.list` is the minimal outward catalog used by federation; `app.library.list` is the rich own-UI view that performs the fan-out.
- R8. The federated response is a snapshot per call. Real-time push updates to the UI are out of scope.

**Failure tolerance**
- R9. A peer that fails to respond to `app.source.list` (timeout, transport error, host-disabled) contributes no entries and does not fail the federated response. Local entries remain visible. Other peers' entries remain visible.
- R10. The local korri-server treats peer churn (appearance, disappearance, address change) as routine reachability state. Surfacing churn to the UI is out of scope for v1.

**Launch routing**
- R11. `app.library.launch` reads each entry's source tag to decide between the existing local launch path and the existing remote stream-prepare path against the source peer.
- R12. Remote launches use the existing `app.server.stream.prepare` RPC against the source peer's discovered control URL. No new wire contract is introduced for remote launch routing.
- R13. Launch failures (peer unreachable, prepare rejected, local launcher rejected) surface in the existing launch-failure shape. No new failure mode is introduced.

**Removals (zero backwards compatibility)**
- R14. The `lastConnectedServer` field in `desktop.yaml`, the `connection.ts` state machine, and the waiting-page route are removed outright. No migration step, no transition flag, no deprecated-but-supported path.
- R15. The desktop bun's current mDNS browse (which fed the connection state machine) is removed. Two independent mDNS consumers remain: the local korri-server browses for peers to fan out to; the forwarder browses to pick an upstream. Both consume the same underlying service-type, but their state and policies are independent.
- R16. Any existing config flag that disables a korri-server's advertise (e.g., `KORRI_SERVER_ADVERTISE_ENABLED=0` on streaming-sink devices) is removed or unconditionally forced on for any device that runs a korri-server with a library.

---

## Acceptance Examples

- AE1. Covers R1, R3. Given a device boots with no local korri-server and no peers yet visible on the LAN, when the home rail loads, an empty rail renders without a waiting page, splash, or error UI; once a peer appears on the LAN, subsequent loads include its catalog.
- AE2. Covers R6, R7, R9. Given a device's local korri-server has three local games and two peers on the LAN where one peer is reachable and the other is unreachable, when `app.library.list` is called, the response contains the three local entries tagged local plus the reachable peer's entries tagged with its host id; the unreachable peer contributes nothing and the call succeeds.
- AE3. Covers R6, R9. Given two peers on the LAN both exposing a game whose id matches, when `app.library.list` is called, both entries appear separately, each tagged with its source. No de-duplication or merging is performed.
- AE4. Covers R10, R14. Given a peer drops off the LAN while the home rail is open, when the rail is refreshed, the peer's entries silently disappear; no toast, badge, or "X disconnected" notification surfaces.
- AE5. Covers R11, R12. Given the player selects a remote-tagged entry, when the launch request runs, the receiving korri-server calls `app.server.stream.prepare` against the source peer and the existing stream-prepare flow continues without UI-visible difference from today's manually-targeted streaming.
- AE6. Covers R11, R13. Given a remote-tagged entry's source peer is unreachable at launch time, when the player selects it, the launch surfaces the existing remote-prepare-failed shape; local entries remain launchable.

---

## Success Criteria

- A player on any Korri device sees the union of every reachable Korri library's content on the home rail, without configuring or selecting a server.
- A device with a local korri-server can see its own library entries even when other devices' libraries are also present.
- The desktop bun forwarder's source contains no product logic beyond "discover an upstream and proxy to it."
- A peer disappearing from the LAN does not produce error UI; the rail simply gets shorter.
- `se-plan` can describe the implementation without inventing product behavior, source-labeling semantics, launch-routing decisions, or removal scope.

---

## Scope Boundaries

- Same-game-on-multiple-sources de-duplication and merging are deferred. The Maximum end of the federation spectrum is a future direction, not v1.
- Save-state sync, save migration, and file/content transfer across peers are deferred.
- Moonlight pair-through-UI is deferred. When eventually built, it will be server-mediated (consistent with the "UI is a dumb client; server does the work" architectural rule established in this slice). The existing `tools/scripts/pair-moonlight.sh` shell flow remains the moonlight pair surface for v1.
- Manual peer-add UI, pairing wizard, and "remember this peer when off its LAN" are deferred. mDNS reachability is the only source of peer membership in v1.
- WAN / Tailscale / cross-network federation is deferred. mDNS is LAN-scoped; we accept the resulting boundary.
- Real-time library-update push from server to UI is deferred. Each `app.library.list` call returns a snapshot.
- Visual treatment of source-tagged entries in the home rail (badge, grouped section, interleaved) is deferred to planning, not a brainstorm decision.
- Migration of `desktop.yaml` files containing `lastConnectedServer` is not implemented. The field is dropped on read.
- Backwards-compatible support for any removed concept (`lastConnectedServer`, waiting page, connection state machine, source-only advertise flag, the desktop's `watchStreamHosts` consumer) is not provided. Removals are deletions, not deprecations.

---

## Key Decisions

- Server-side federation, not client-side. The local korri-server owns peer state, fan-out, and source tagging; the desktop bun stays a pure pass-through. Rationale: matches the "UI is a dumb client; server does the work" architectural rule and reuses the renderer-bun-boundary refactor's separation of concerns rather than re-encrypting product logic into the bun.
- Discovery as the only source of peer truth. mDNS reachability fully defines the peer set; no config file, no manual add, no persisted "known servers" list. Rationale: matches "if it's on the network it shows up" and avoids a peer-management UX that we're not ready to design.
- No "current server" notion in any UI mode. `lastConnectedServer` is removed entirely, the waiting page is removed, the connection state machine is removed. Rationale: with server-side fan-out, the home rail no longer needs a chosen primary, and keeping the concept around as vestigial labeling would mislead.
- Forwarder uses mDNS too — no hardcoded loopback address. Loopback probe fast-path keeps local-server devices snappy; mDNS fallback works for thin-client form factors that may exist later. Rationale: a single uniform mechanism across device types is cheaper to maintain than a special case for the loopback path.
- Two RPC consumers, one mDNS infrastructure. Both the desktop bun (upstream picking) and the local korri-server (peer fan-out) consume mDNS browse results. The same publisher already advertises today.
- Source tagging on entries, not separate local/remote sections in the response. Each entry carries a source identifier; how the UI groups or distinguishes them visually is a planning decision.
- Zero backwards compatibility. Removed concepts are deleted, not deprecated. Old `desktop.yaml` fields are dropped on read. No transition flags or migration paths. Rationale: explicit user constraint; nothing important survives across the boundary, and the surrounding work landed too recently to be worth preserving compatibility against.
- mDNS service-type semantics may need to broaden. The existing `_korri-stream._tcp` type carries "I'm a streaming host" semantics; federation needs every library-bearing korri-server to advertise. Whether the type broadens, a sibling type appears, or a TXT-record capability bit distinguishes them is a planning decision.

---

## Dependencies / Assumptions

- `app.source.list` already returns a minimal catalog suitable for federation queries; this wire contract does not change in this slice.
- `app.server.stream.prepare` (and its legacy fallback `app.stream.prepare`) continue to be the wire contract for remote launch staging.
- `bonjour-service` (or `avahi-publisher.ts`'s avahi-host fallback) remains the mDNS layer for both advertise and browse.
- A Korri server's local library remains backed by ProseQL (`KORRI_LIBRARY_SOURCE=proseql`) or ROCKNIX gamelists; that source-of-truth layer is unchanged.
- The existing local launch path inside `app.library.launch` remains valid for local-tagged entries.
- LAN multicast is reliable enough for v1 reachability. Pathological mDNS environments (split-horizon WiFi, isolated SSIDs, multicast-blocked enterprise networks) are accepted constraints, not addressed.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R4, R16][Technical] What mDNS service type should library-bearing korri-servers advertise — broaden `_korri-stream._tcp`, add a sibling such as `_korri-library._tcp`, or use a TXT-record capability bit to distinguish streaming vs. library-only?
- [Affects R6][Technical] What's the timeout and concurrency policy for fan-out queries to peers? Per-peer timeout, total budget, fail-fast vs. wait-all?
- [Affects R6][Technical] How long should the discovered-peer set be cached between `app.library.list` calls, and when is it re-browsed? On every call, on a fixed interval, on TTL expiry of each record?
- [Affects R6, R11][Technical] What's the exact shape of the `source` field on an entry returned from `app.library.list`? Host id, control URL, friendly name, all three?
- [Affects R1][Technical] What's the desktop bun forwarder's behavior when its cached upstream becomes unreachable mid-request? Retry against another discovered upstream, surface a single failure, treat the cache as stale and re-pick?
- [Affects R1, R3][Technical] During the brief boot-race window before mDNS has surfaced any results, is a momentarily-empty rail acceptable per R3, or should the forwarder hold the first request to await mDNS warmup? The empty-rail-is-legitimate stance in R3 suggests "acceptable," but a perceptible flash on every boot may still be worth eliminating.
- [Affects R14, R15][Technical] What's the order-of-removal for the connection state machine and waiting page — atomic with the new forwarder, or staged with the new behavior live behind a flag first? (Zero-backwards-compat says no flag, but the slice may still benefit from intermediate commits.)
- [Affects R8][Technical] If real-time updates are eventually wanted, what's the smallest seam to leave open in the snapshot RPC so push can be added without a redesign?
