---
title: "feat: Korri Library Federation v1"
type: feat
status: completed
date: 2026-05-27
origin: docs/brainstorms/2026-05-27-korri-library-federation-requirements.md
verify_command: "just check"
---

# feat: Korri Library Federation v1

## Summary

Move library federation server-side: every korri-server discovers LAN peers via mDNS, fans out `app.library.list` to collect each peer's `app.source.list`, source-tags every entry, and routes launches by source. The desktop bun forwarder becomes a pure pass-through with mDNS-discovered upstream (loopback fast-path). The single-server connection model (`lastConnectedServer`, connection state machine, waiting page, vestigial env flags) is removed outright with zero backwards compatibility.

---

## Problem Frame

The desktop bun forwards `/api/*` to one configured upstream (`lastConnectedServer.controlUrl`), which means a device running its own korri-server cannot see its own library while connected to a remote. The origin document captures the situation, the federation thesis, and the removal scope; this plan defines how that thesis lands in code. See origin: `docs/brainstorms/2026-05-27-korri-library-federation-requirements.md`.

---

## Requirements

All R-IDs trace to origin (`docs/brainstorms/2026-05-27-korri-library-federation-requirements.md`). Carrying forward:

- R1–R3. Forwarder shape: discovery-driven upstream, pure pass-through, empty rail is legitimate state.
- R4–R8. Server-side federation: every library-bearing server advertises and browses; fan-out in `app.library.list` via `app.source.list`; source tag on entries; RPC split preserved; snapshot-per-call.
- R9–R10. Failure tolerance: peer failures contribute nothing without failing the federated response; peer churn is silent.
- R11–R13. Launch routing: server reads source tag and routes locally or via `app.server.stream.prepare`; existing failure shape.
- R14–R16. Removals (zero backwards compat): `lastConnectedServer` + connection state machine + waiting page; desktop's mDNS browse consumer; advertise-disable flag.

**Origin actors:** A1 (Player), A2 (Desktop bun forwarder), A3 (Local korri-server), A4 (Peer korri-server).
**Origin flows:** F1 (Boot and discover), F2 (List the federated library), F3 (Launch a federated entry), F4 (Peer comes and goes).
**Origin acceptance examples:** AE1 (covers R1, R3), AE2 (covers R6, R7, R9), AE3 (covers R6, R9), AE4 (covers R10, R14), AE5 (covers R11, R12), AE6 (covers R11, R13).

---

## Scope Boundaries

All non-goals carry forward verbatim from origin (`docs/brainstorms/2026-05-27-korri-library-federation-requirements.md`). Summary:

- De-duplication / merging of same-game-on-multiple-sources is deferred (Maximum target).
- Save-state sync, file/content transfer across peers deferred.
- Moonlight pair-through-UI deferred (`tools/scripts/pair-moonlight.sh` remains the only pair surface).
- Manual peer-add UI, pairing wizard, persistent peer memory deferred.
- WAN / Tailscale / cross-network federation deferred (mDNS is LAN-scoped).
- Real-time library-update push deferred (snapshot per call).
- Visual treatment of source-tagged entries (badge / grouped section / interleaved) deferred to UX work.
- Migration of `desktop.yaml` files containing `lastConnectedServer` not implemented — field dropped on read.
- Backwards-compat preservation of any removed concept (`lastConnectedServer`, waiting page, connection state machine, advertise-disable flag, `watchStreamHosts` consumer in desktop) — explicitly not provided.

---

## Context & Research

### Relevant Code and Patterns

**RPC layer (Effect):**
- `korri/products/app/api/library/list.rpc.ts` + `list.rpc-handler.ts` — `app.library.list`, returns `ListLibraryResponse({ games: ResolvedGameRecord[] })`. No source tag today.
- `korri/products/app/api/source/list.rpc.ts` + `list.rpc-handler.ts` — `app.source.list`, gated by `KORRI_STREAM_CONTROL_ENABLED`, returns minimal `SourceCatalogGame` with `id`, `displayName`, `streamable`.
- `korri/products/app/api/library/launch.rpc.ts` + `launch.rpc-handler.ts` — `app.library.launch` payload is `{ id }` only today; resolves through `source.resolveLaunchForGame` and `launchLocalForegroundSession`.
- `korri/products/app/api/server/prepare.rpc.ts` + `prepare.rpc-handler.ts` — `app.server.stream.prepare` delegates to `prepareStreamLaunch`.
- `korri/products/app/api/handlers.ts` + `server/rpc-server.ts` — handler layers via `rpcGroup.toLayer(rpcGroup.of({ ... }))`. Both wrapped in `FeatureGatesMiddleware`.
- `korri/shared/api/rpc/errors.ts` — typed `DataError`, `NotFoundError`, `ValidationError`; federation peer failures fold into the same shapes.

**Library composition:**
- `korri/shared/library/library-source-layer-live.ts` — selects ProseQL vs ROCKNIX via `KORRI_LIBRARY_SOURCE`.
- `korri/shared/library/proseql/library-repository.ts` — list/cascade-resolve seam.
- `korri/products/app/stream/remote-stream-client.ts` — `createRemoteStreamControlClient(baseUrl)` already speaks `app.source.list` + `app.server.stream.prepare` against arbitrary URLs; categorized failures (`host-unavailable`, `host-control-disabled`, `no-such-game`, `prepare-failed`). This is the fan-out client and the launch-routing client.

**mDNS:**
- `tools/device/lan-stream-advertise.ts` — bonjour-service publisher (with `avahi-publish-service` fallback via `tools/device/avahi-publisher.ts`). Service type `_korri-stream._tcp`. TXT shape `{ proto, hostId, caps }`. Caps is a string array.
- `tools/cli/lan-stream-discovery.ts` — `watchStreamHosts()` browser. Derives `controlUrl` from service address + port; accepts loopback, RFC1918, link-local/private IPv6; rejects public addresses. Emits `appear` / `disappear`. Currently consumed only by the desktop connection setup.

**Desktop forwarder + connection:**
- `korri/deploy/desktop/api-forwarder.ts` — `createApiForwarder`; per-request `getUpstream()`; forwards `/api/*`; strips hop-by-hop headers; `503 { error: "no upstream" }` when disconnected; `502 { error: "upstream unreachable" }` on fetch failure.
- `korri/deploy/desktop/main.ts` — wires `watchStreamHosts()` → `makeConnectionController(...)` → `getUpstream()`.
- `korri/deploy/desktop/connection.ts` (+ `.test.ts`) — connection state machine, persists/prefers `desktop.yaml.lastConnectedServer`.
- `korri/deploy/desktop/desktop-config.ts` — `desktop.yaml` schema, normalizes `lastConnectedServer`.
- `korri/deploy/desktop/create-desktop-app.ts` — Bun/Hono app that serves the waiting page as a catch-all branch when `getConnectionState().status !== "connected"`. Also serves `/__korri/desktop/connection-status`.
- `korri/deploy/desktop/waiting-page/render-waiting-page.ts` + `polling-loop*.ts` — waiting renderer + polling JS.

**Server bootstrap:**
- `tools/device/korri-server.ts` — reads `KORRI_SERVER_ADVERTISE_ENABLED` (default `"1"`), `KORRI_STREAM_ADVERTISE_*`. Advertises on boot but does not browse peers.
- `nix/modules/korri-server.nix` — Nix module default `services.korri.server.advertise.enable = false`. Inverted relative to TS default.

**Home rail UI:**
- `korri/shared/themes/shift/pages/ShiftHomePage.tsx` reads `libraryItemsAtom`.
- `korri/shared/library/library-atoms.ts` calls `LibrarySource.list()` through Effect atom runtime.
- `korri/products/app/features/home/HomeRuntimeLayersRoot.tsx` seeds the runtime; `LibrarySourceLayerRpc` calls `app.library.list`. Desktop mode uses `LauncherLayerBridge`; non-desktop uses `LauncherLayerRpc`.
- `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx` — rail keys and focus identity by `game.id` today.

**Tests:**
- `bun:test` is the runner (not vitest).
- RPC handler tests: `Effect.runPromise` / `Effect.runPromiseExit` with provided layers (see `korri/products/app/api/library/list.rpc-handler.test.ts`).
- ProseQL: real temp library via `tools/testing/library/with-temp-proseql-library`.
- mDNS: injectable `bonjourFactory` with in-memory implementation (`tools/cli/lan-stream-discovery.test.ts`).
- Forwarder: real `node:http` upstream fixture (`korri/deploy/desktop/api-forwarder.test.ts`).
- Connection controller: Effect `Queue`, `Stream`, `SubscriptionRef`, `TestClock` (`korri/deploy/desktop/connection.test.ts`).

### Institutional Learnings

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — desktop bun stays a thin same-origin boundary; do not duplicate RPC handlers, middleware, or API semantics on the desktop side. Reinforces R2.
- `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md` — one control plane per host/port/advertised identity. Migration prior found duplicate publishers race for the same mDNS record. Zero-backwards-compat removals must not leave a second publisher in place; Nix evaluation should fail-or-warn rather than runtime race.
- `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` — session lifecycle owns foreground transitions. Remote launches must hand back to local sessiond for the foreground transition; remote prep produces the launch artifacts, sessiond runs them.
- `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md` — `Schema.Class` handlers must return class instances; tests must exercise the real RPC client path, not just raw JSON.
- `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md` — source identity should be structural, not inferred from timing/host guesses. Carry a discriminator from aggregation through UI through launch routing.

### External References

None — local patterns are dense and cover every layer this plan touches.

---

## Key Technical Decisions

- **Source tag is a required structural field on entries**, not a heuristic. Both `ResolvedGameRecord` (returned by `app.library.list`) and `SourceCatalogGame` (returned by `app.source.list`) gain `source: { hostId, controlUrl, isLocal }`. Rationale: per the `pointer-aware-spatial-navigation` learning, structural identity prevents ambiguous "which peer owns this" routing; AE3 requires duplicate ids from different peers to remain separate, which fails if source is reconstructed by heuristic.
- **`app.library.launch` payload extends to carry source**: `{ id, source }`. Rationale: cleaner than composite-id parsing (`${hostId}:${gameId}` is fragile if either contains the delimiter), aligned with the structural-source-identity rule, and verifiable by the schema decoder. Zero-backwards-compat means this is a breaking schema change with no compatibility shim.
- **Service type stays `_korri-stream._tcp`; `caps` carries the federation discriminator.** Library-bearing servers advertise `caps: ["source"]`; streaming-capable ones add `"stream"`. Rationale: the TXT shape already supports string arrays; introducing a new service type would touch Nix, Avahi, fallback publishers, and prior brainstorm history for no semantic gain. Resolves origin OQ on service-type semantics.
- **`app.source.list` ungates** from `KORRI_STREAM_CONTROL_ENABLED`. Library-bearing servers always expose source-list; the per-entry `streamable` flag carries stream capability. Rationale: federation requires catalog availability even when streaming is impossible (e.g., source-only kiosks). The flag itself is removed (R14-R16 zero-backwards-compat).
- **Server-side peer discovery is a new Effect service.** Wraps a bonjour browse, maintains an in-memory `peers: Set<PeerRecord>`, filters on `caps: "source"`, ignores the local advertisement. Lifetime is the server process lifetime. Rationale: per `boot-scoped-control-plane-with-session-scoped-runner`, peer state belongs to the boot-scoped server, not session-scoped flows.
- **Forwarder uses its own mDNS browse**, independent of the server's peer discovery. Loopback fast-path: probe `127.0.0.1:<server-port>` first; if alive, use it. Else, pick the first mDNS result with `caps: "source"`. Cache the chosen upstream briefly (5s) and invalidate on upstream fetch failure. Rationale: desktop bun and korri-server are separate processes with separate lifetimes; sharing a discovery primitive would require IPC. Each gets its own tiny browse.
- **Fan-out policy in `app.library.list`**: `Effect.all` over peers with concurrency unbounded, per-peer 2s timeout, `Effect.catchAll` returning empty array per failing peer. Total budget = max peer timeout. Rationale: matches existing source-list per-game error-omission pattern; partial failure must not break the federated response (R9).
- **Launch routing happens in two RPCs, by surface.** The desktop bun's `app.desktop.launch` (Electrobun production path; every AKA / Sobo / desktop deploy) reads `payload.source.isLocal` — local entries are delegated to the server's `app.library.launch`, remote entries are prepped against `source.controlUrl` and run through the bun-local Moonlight spawn + `foreground-session-owner` flow. The server's `app.library.launch` (kiosk/web path) handles local entries via the existing `launchLocalForegroundSession` (sessiond); remote-source payloads return a typed v1-deferral failure because the server cannot spawn a stream client. Rationale: process-spawning capability and foreground lifecycle ownership are surface-specific — the bun has them, the server doesn't — so routing has to be aware of which surface is asking. Per the `kiosk-foreground-app-policy-over-gamescope-overlay` learning, the foreground-session-owner (bun-side) is the authority for streamed-content windowing; sessiond is the authority for local launches.
- **Desktop `launch-bridge.ts` reads `source` from payload, not `getConnection()`.** Today it preps against the connection state machine's connected URL. Post-federation, the connection state machine is gone; the bridge reads the entry's source from the renderer's payload. Rationale: removes the bridge's dependency on the deleted connection state (U8), enables per-entry routing, and makes the bun stay a same-origin proxy per the `electrobun-desktop-wrapper-loopback` learning.
- **No feature gate.** `docs/jobs/...` feature-gate machinery exists in the repo but gating a zero-backwards-compat removal defeats the user's stated constraint. The change is atomic across the relevant units; the verify command exercises the new wire shape.
- **Removals are atomic with the new forwarder**, not staged behind a flag. U6 lands the new forwarder; U8 deletes the old paths in the same series. Rationale: the user's zero-backwards-compat constraint disallows transition flags.

---

## Open Questions

### Resolved During Planning

- **Service-type semantics (origin OQ R4/R16):** Keep `_korri-stream._tcp`; extend `caps` to discriminate library-bearing (`"source"`) vs streaming-capable (`"stream"`) servers.
- **Fan-out timeout/concurrency (origin OQ R6):** Per-peer 2s timeout, unbounded concurrency, partial-failure via `Effect.catchAll`. Total budget = max peer timeout.
- **Peer set cache TTL (origin OQ R6):** No TTL. The peer set is event-driven (mDNS appear/disappear); each `app.library.list` reads the current snapshot.
- **Source field shape (origin OQ R6/R11):** `{ hostId: string; controlUrl: string; isLocal: boolean }`. Optional `displayName` deferred to implementation.
- **Forwarder cached-upstream-unreachable mid-request (origin OQ R1):** On fetch failure invalidate cache, attempt one re-pick + retry. If still fails, return existing 502. Bounded retry prevents storms.
- **Order-of-removal for connection state machine + waiting page (origin OQ R14/R15):** Atomic with the new forwarder (U6 + U8 in series, no intermediate flag).
- **Boot-race window (origin OQ R1/R3):** Brief empty rail is acceptable per R3. Local-server boot race window is bounded by the loopback probe cost (sub-100ms in practice).
- **`app.source.list` gating (research-surfaced):** Ungate from `KORRI_STREAM_CONTROL_ENABLED`. Library-bearing servers always expose; per-entry `streamable` carries stream capability.
- **Composite launch id vs schema change (research-surfaced):** Schema change to `LaunchLibraryPayload`. `{ id, source }`.
- **Desktop launch bridge realignment (research-surfaced):** Bridge reads `source` from the renderer's payload and routes locally (delegate to server's `app.library.launch`) vs. remotely (prep against `source.controlUrl` + Moonlight spawn + foreground-session-owner). Replaces today's `getConnection().controlUrl` read.
- **`KORRI_HEADLESS_SOURCE_ONLY` cleanup (research-surfaced):** Remove. Vestigial after the source-list gate was previously retired.

### Deferred to Implementation

- **Real-time push smallest-seam (origin OQ R8):** Not addressed in v1. Snapshot RPC stays as-is. If a future slice wants push, the seam will be a new `app.library.watch` subscription RPC — not a modification of `app.library.list`.
- **Per-peer timeout tunability:** Defer to implementation whether to expose as env var. Default 2s.
- **`source.displayName` inclusion:** Defer to implementation. UI work in a later slice may want it.
- **Avahi vs bonjour-service conflict on devices with both:** Existing publisher selection handles this; verify no regression. Deferred to implementation testing.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Source-tag flow** (the spine of federation):

```
┌────────────────────────────────────────────────────────────────────┐
│  Local korri-server (host A)                                       │
│                                                                    │
│  PeerDiscovery (mDNS browse, caps:"source")                        │
│    peers = { host B, host C, ... }                                 │
│                                                                    │
│  app.library.list                                                  │
│    local := LibrarySource.list()                                   │
│             .map(g => { ...g, source: { A, local: true } })        │
│    remote := for each peer P, in parallel (2s timeout each):       │
│      remoteStreamClient(P.controlUrl).sourceList()                 │
│        .map(g => { ...g, source: { P, local: false } })            │
│        .catchAll(() => [])                                         │
│    return { games: [...local, ...remote.flat()] }                  │
│                                                                    │
│  app.library.launch({ id, source })   // kiosk/web path            │
│    if source.isLocal:                                              │
│      launchLocalForegroundSession(...)  // sessiond                │
│    else:                                                           │
│      return failed("remote-launch-not-supported")  // v1 deferral  │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ /api/rpc (same-origin)
                              │
┌────────────────────────────────────────────────────────────────────┐
│  Desktop bun                                                       │
│                                                                    │
│  Forwarder (pure pass-through)                                     │
│    ForwarderUpstream (mDNS browse, caps:"source")                  │
│      pickUpstream():                                               │
│        try 127.0.0.1:<server-port>  // loopback fast-path          │
│        else first mDNS result                                      │
│        cache 5s; invalidate on fetch failure                       │
│    /api/*  →  fetch(pickUpstream() + path)                         │
│                                                                    │
│  launch-bridge.ts (app.desktop.launch  — Electrobun path)          │
│    on launch({ id, source }):                                      │
│      if source.isLocal:                                            │
│        forward to local server's app.library.launch                │
│      else:                                                         │
│        artifacts := remoteStreamClient(source.controlUrl)          │
│                      .prepareGame(id)                              │
│        moonlight.spawn(source.controlUrl, artifacts)               │
│        foregroundSessionOwner.manage(...)                          │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                       React renderer
                       /api/rpc           → forwarder → server
                       /__korri/desktop/rpc → launch-bridge
                       (same origin in both cases)
```

**Identity composition in the rail** (UI side of source tagging):

Rail entry key changes from `game.id` to `${game.source.hostId}:${game.id}`. Two peers exposing the same `game.id` render as distinct rows. AE3 holds.

**Discovery topology**:

```
Host A korri-server  ──advertises──┐
                                   │
Host B korri-server  ──advertises──┼──[ LAN mDNS ]──┐
                                   │                │
Host C korri-server  ──advertises──┘                │
                                                    │
Host A desktop bun   ──browses──────────────────────┤
Host A korri-server  ──browses──────────────────────┤
Host B desktop bun   ──browses──────────────────────┤
Host B korri-server  ──browses──────────────────────┘
                                                    
caps:"source" filters the result set; caps:"stream" further filters when
the server is preparing a stream launch for a remote entry.
```

---

## Implementation Units

### U1. Add structural `source` field to library entry schemas

**Goal:** Foundation for everything downstream — every entry in `app.library.list` and `app.source.list` carries an explicit source tag. Local server populates with its own identity; remote peers' contributions get re-tagged at fan-out time (U4).

**Requirements:** R6, R10.

**Dependencies:** none.

**Files:**
- Modify: `korri/products/app/api/library/list.rpc.ts` (extend `ResolvedGameRecord` schema with `source`).
- Modify: `korri/products/app/api/library/list.rpc-handler.ts` (populate `source` for local entries).
- Modify: `korri/products/app/api/source/list.rpc.ts` (extend `SourceCatalogGame` schema with `source`).
- Modify: `korri/products/app/api/source/list.rpc-handler.ts` (populate `source` for local entries).
- Modify: `korri/products/app/api/library/launch.rpc.ts` (extend `LaunchLibraryPayload` with `source`).
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts` (read but do not yet route on `source` — local path only in this unit).
- Modify: `korri/products/app/stream/local-stream-launch-rpc.ts` (extend `LocalStreamLaunchPayload` with `source` — desktop bun's launch RPC).
- Modify: `korri/deploy/desktop/launch-bridge.ts` (accept `source` in payload; read but do not yet route on it — keep existing behavior in this unit).
- Modify: `korri/products/app/features/home/launcher-layer-bridge.ts` (renderer-side `LauncherLayerBridge` — propagate `source` from the entry into the bun-local RPC payload).
- Modify: `korri/shared/library/library-source-layer-live.ts` and any consumer reading library entries — propagate `source`.
- Modify: `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx` (read `source`, no behavior change yet).
- Test: `korri/products/app/api/library/list.rpc-handler.test.ts` (assert local-tagged source).
- Test: `korri/products/app/api/source/list.rpc-handler.test.ts` (assert local-tagged source).
- Test: `korri/products/app/api/library/launch.rpc-handler.test.ts` (assert payload includes source; local routing unchanged).

**Approach:**
- New shared schema `EntrySource` in `korri/shared/api/rpc/` with `{ hostId: string; controlUrl: string; isLocal: boolean }`.
- `hostId` comes from `KORRI_STREAM_ADVERTISE_HOST_ID` (already in env); `controlUrl` from the local server's bound port. Centralize the local-identity composition in one helper.
- Schema is `Schema.Class`-based (matches existing pattern per `effect-v4-rpc-schema-class-responses-2026-05-03` learning).
- This unit is schema-additive plus local population — no fan-out, no launch routing changes yet. Subsequent units consume the new field.

**Execution note:** Implement test-first. RPC schema changes must be exercised through the real Effect RPC client path to catch decode failures, not just handler-level tests.

**Patterns to follow:**
- Existing `Schema.Class` usage in `korri/products/app/api/library/list.rpc.ts`.
- Shared types in `korri/shared/api/rpc/errors.ts`.

**Test scenarios:**
- *Happy path:* `app.library.list` on a local server returns entries each with `source: { hostId: <local>, controlUrl: <local>, isLocal: true }`.
- *Happy path:* `app.source.list` on a local server returns entries with the same source tag.
- *Happy path:* `app.library.launch({ id, source: <local> })` routes through the existing local path unchanged.
- *Schema decode:* RPC client receives the new field correctly through the real Effect RPC roundtrip (covers `Schema.Class` instance-vs-plain-object regression class).
- *Edge case:* `source.controlUrl` reflects the server's actual bound URL (not a hardcoded default) when `KORRI_STREAM_ADVERTISE_*` is set.
- *Edge case:* Missing `KORRI_STREAM_ADVERTISE_HOST_ID` falls back to a deterministic local-host identifier (e.g., os.hostname()).

**Verification:**
- All three RPCs return source-tagged entries on a stock local server.
- Existing tests pass with the new field present.
- Home rail still renders (no UI behavior change in this unit).

---

### U2. Source-aware identity in home rail UI

**Goal:** Rail keys and focus identity compose source + id so duplicate ids from different peers render as separate rows (AE3).

**Requirements:** R6 (AE3).

**Dependencies:** U1.

**Files:**
- Modify: `korri/shared/themes/shift/organisms/ShiftHomeRail.tsx` (compose key from `source.hostId` + `id`).
- Modify: `korri/shared/library/library-atoms.ts` if atom keying surfaces game id directly.
- Modify: any other rail / focus / navigation site that uses `game.id` as a unique key (e.g., LRUD focus targets, route params, asset cache keys).
- Test: `korri/shared/themes/shift/organisms/ShiftHomeRail.test.tsx` (assert distinct rendering of same-id-different-source entries).

**Approach:**
- Add a small helper `composeEntryKey(entry: { id, source }): string` in `korri/shared/library/`.
- Replace `game.id` keying call sites with `composeEntryKey(game)`.
- Focus restore / navigation paths that store the key in URL or in atom state must also use the composite — sweep with a search.

**Execution note:** Implement test-first. The breakage mode (silent collapsing of same-id rows) is hard to catch by manual inspection.

**Patterns to follow:**
- Existing LRUD container/focus patterns in `korri/shared/themes/shift/`.
- `@bbc/tv-lrud-spatial` keying via DOM `data-` attributes.

**Test scenarios:**
- *Happy path:* Two entries with same `id` but different `source.hostId` render as two distinct LRUD focusables. **Covers AE3.**
- *Happy path:* A single local entry renders identically to before (no regression on the common case).
- *Edge case:* Empty rail (no entries) renders nothing — no error, no placeholder UI (covers AE1 partial — empty state from UI side).
- *Edge case:* Focus restoration after navigation lands on the same entry when source identity is preserved.

**Verification:**
- AE3 holds in a unit test that constructs the duplicate-id scenario.
- Existing rail tests pass.

---

### U3. Server-side mDNS peer discovery

**Goal:** Every korri-server browses the LAN for library-bearing peers and maintains an in-memory peer set. Used by U4 fan-out.

**Requirements:** R5, R10.

**Dependencies:** none (parallel with U1).

**Files:**
- Create: `korri/products/app/peers/peer-discovery.ts` — Effect service `PeerDiscovery` with `peers: Effect<readonly PeerRecord[]>` and lifecycle hooks.
- Create: `korri/products/app/peers/peer-discovery.test.ts` — appear/disappear events, self-filtering, caps filtering.
- Modify: `tools/device/korri-server.ts` — wire `PeerDiscovery` layer; start browse on boot.
- Modify: `korri/products/app/api/handlers.ts` or RPC layer wiring — expose `PeerDiscovery` to handlers that need it.

**Approach:**
- Wrap the existing `watchStreamHosts` browser from `tools/cli/lan-stream-discovery.ts` in an Effect service.
- Maintain in-memory `Map<controlUrl, PeerRecord>`; mutate on `appear` / `disappear`.
- Filter out the local advertisement (compare `hostId` against the server's own `KORRI_STREAM_ADVERTISE_HOST_ID`).
- Filter on `caps: "source"` — peers must advertise the source capability to be in the federation set.
- `PeerRecord` shape: `{ hostId, controlUrl, displayName, caps }`. Use existing `BrowserPeer` shape if it already matches.

**Execution note:** Implement test-first. Use the existing in-memory `bonjourFactory` pattern from `tools/cli/lan-stream-discovery.test.ts` to drive appear/disappear events deterministically.

**Patterns to follow:**
- `tools/cli/lan-stream-discovery.ts` browse implementation and in-memory test factory.
- Effect service pattern: `Context.Service` declaration + `Layer.effect` live wiring (see `korri/shared/library/library-services.ts`).

**Test scenarios:**
- *Happy path:* Two peers appear; `peers` returns both.
- *Happy path:* A peer disappears; `peers` no longer includes it.
- *Happy path:* Local advertisement is filtered out (server doesn't list itself).
- *Edge case:* Peer advertises without `caps: "source"` (e.g., `caps: ["stream"]` only) → excluded from federation set.
- *Edge case:* Peer advertises with both `caps: ["source", "stream"]` → included.
- *Edge case:* Multiple `appear` events for the same `controlUrl` deduplicate.
- *Error path:* Bonjour browser fails to start → service surfaces an error layer; server boot fails fast (one control plane, one source of truth per the `boot-scoped-control-plane-with-session-scoped-runner` learning).

**Verification:**
- Browsing two synthetic peers in a test yields a stable peer set.
- Server boots with `PeerDiscovery` running.
- No regression in existing discovery tests.

---

### U4. `app.library.list` fans out to peers

**Goal:** The local `app.library.list` returns the union of local entries plus each reachable peer's `app.source.list` contribution. Partial failures degrade gracefully.

**Requirements:** R6, R7, R9, R10.

**Dependencies:** U1 (source tag schema), U3 (peer discovery), U7 (peer advertising with `caps: "source"`).

**Files:**
- Modify: `korri/products/app/api/library/list.rpc-handler.ts` — fan out across `PeerDiscovery.peers`, source-tag remote entries, merge.
- Use: `korri/products/app/stream/remote-stream-client.ts` (already speaks `app.source.list` against arbitrary URLs).
- Test: `korri/products/app/api/library/list.rpc-handler.test.ts` — federation scenarios.

**Approach:**
- After computing local entries (existing path), read `PeerDiscovery.peers`.
- For each peer: `createRemoteStreamControlClient(peer.controlUrl).sourceList()` via `Effect.all` with unbounded concurrency, per-peer 2s timeout, `Effect.catchAll` returning empty array. Each surviving entry is re-tagged with `source: { hostId: peer.hostId, controlUrl: peer.controlUrl, isLocal: false }`.
- Concat local + flattened remote. Return single `ListLibraryResponse`.
- Failure shape: per-peer failures are logged (existing logger) but do not throw — the federated response succeeds with what we got. R9.

**Execution note:** Implement test-first. The fan-out behavior is exactly the kind of code where tests catch off-by-one and partial-failure regressions — and the happy path looks fine even when one peer silently swallows.

**Patterns to follow:**
- Existing per-game-error-omission in `app.source.list` (it already drops unlaunchable games without failing the RPC).
- Effect concurrency: `Effect.all` with `{ concurrency: "unbounded" }` and per-effect `Effect.timeout` + `Effect.catchAll`.

**Test scenarios:**
- *Happy path:* Three local games + one peer with two games → response has five entries, three tagged local, two tagged with the peer's hostId. **Covers AE2.**
- *Happy path:* Zero local games + one peer with one game → response has one entry tagged remote. (Covers thin-client form factor implicitly.)
- *Happy path:* Two peers each exposing the same game id → both entries appear, each source-tagged. **Covers AE3.**
- *Error path:* One reachable peer + one unreachable peer (connection refused) → reachable peer's entries appear; unreachable contributes nothing; RPC succeeds. **Covers AE2 / R9.**
- *Error path:* Peer responds with control-disabled (legacy 503) → contributes nothing; RPC succeeds.
- *Error path:* Peer hangs past 2s timeout → contributes nothing; RPC succeeds; total response within ~2.5s.
- *Edge case:* Empty peer set (no LAN peers discovered) → response is local-only.
- *Edge case:* Local library throws → RPC fails with `DataError` (regression check: peer failure tolerance must not mask local errors).
- *Edge case:* `PeerDiscovery` service unavailable → RPC still serves local entries; this is the unhappy-but-survivable mode.

**Verification:**
- AE2 and AE3 hold in tests.
- Two synthetic peers (one fast, one slow-to-timeout) produce expected response shape and timing.
- Local-only mode (no peer service) still works.

---

### U5. Launch routing by source — bun's `app.desktop.launch` and server's `app.library.launch`

**Goal:** Both launch RPCs route by source. The desktop bun's `app.desktop.launch` (the production path for Electrobun renderers — AKA, Sobo, etc.) does the heavy lifting: it owns Moonlight spawning and foreground-session management. The server's `app.library.launch` (used in browser/web context) does the kiosk/web variant — runs sessiond for local entries; for remote entries it preps and returns prep info to the caller (callers without a Moonlight client surface a typed "remote-launch-not-supported" — kiosk Moonlight integration is out of scope for v1).

**Requirements:** R11, R12, R13.

**Dependencies:** U1 (payload schemas).

**Files (desktop bun path — production):**
- Modify: `korri/deploy/desktop/launch-bridge.ts` — read `source` from payload; route by `source.isLocal`:
  - Local → call server's `app.library.launch { id, source }` via the in-process forwarder (server handles sessiond); return the result.
  - Remote → `createRemoteStreamControlClient(source.controlUrl).prepareGame(id)`; spawn Moonlight pointed at `source.controlUrl` (replaces today's `getConnection().controlUrl`); foreground-manage via existing `foreground-session-owner`.
- Modify: `korri/deploy/desktop/launch-bridge.test.ts` — local-source and remote-source routing scenarios.
- Modify: `korri/products/app/features/home/launcher-layer-bridge.ts` — payload now carries `source` (already wired in U1; this unit makes the consumer use it).

**Files (server path — kiosk/web):**
- Modify: `korri/products/app/api/library/launch.rpc-handler.ts` — read `source`; for local: existing `launchLocalForegroundSession` path; for remote: prep via `remote-stream-client` and return a typed "remote-launch-not-supported" failure (v1 deferral — kiosks don't spawn Moonlight in v1).
- Modify: `korri/products/app/api/library/launch.rpc-handler.test.ts` — local routing unchanged; remote payload returns the typed v1 deferral failure.

**Approach:**
- The bun's `launch-bridge.ts` is the only production routing site today (every Electrobun deployment goes through it). It becomes the federation routing site by reading `payload.source` and choosing between (a) local-via-server (call `app.library.launch` against the loopback forwarder upstream) and (b) remote-via-Moonlight (prep against `source.controlUrl`, spawn Moonlight, foreground-manage).
- The server's `app.library.launch` becomes source-aware too, but its remote-source path is intentionally limited in v1 to preserve the layering: the server cannot spawn a stream client. Returning a typed failure is the honest shape; future kiosk-Moonlight integration would replace it.
- Per the `kiosk-foreground-app-policy-over-gamescope-overlay` learning, foreground lifecycle ownership stays with the bun-side `foreground-session-owner` (not sessiond) when streaming from a remote source — sessiond owns local launches; the foreground-session-owner owns the windowing transition for streamed content. Already the case today; this unit preserves that boundary.
- Failure mapping: existing typed shapes from `remote-stream-client.ts` (`host-unavailable`, `host-control-disabled`, `no-such-game`, `prepare-failed`) propagate to the renderer through `LocalStreamLaunchResponse`'s existing `failed` variant. R13 — no new failure mode.

**Execution note:** Implement test-first. Launch failure handling has had multiple recent regressions in the foreground bridge surface (see recent commits) — tests are how this stays correct.

**Patterns to follow:**
- Existing launch failure mapping in `korri/products/app/stream/remote-stream-client.ts` (typed `RemotePrepareResult` failure categories).
- Existing foreground-session-owner pattern in `korri/shared/stream/foreground-session-owner.ts`.
- Existing server-side local launch in `launchLocalForegroundSession`.
- `kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24` learning — do not bypass the foreground lifecycle owner.

**Test scenarios (bun's `app.desktop.launch`):**
- *Happy path:* Local entry → bun calls server's `app.library.launch`, server runs sessiond, response surfaces back as `launched`. **Covers AE5 (local side).**
- *Happy path:* Remote entry → bun preps against `source.controlUrl`, spawns Moonlight pointed at `source.controlUrl`, foreground transitions; response is `launched`. **Covers AE5 (remote side).**
- *Error path:* Remote source unreachable → bun receives `host-unavailable` from `remote-stream-client`; response is `failed` with category `host-unavailable`. **Covers AE6.**
- *Error path:* Remote source has control disabled → `failed` with category `host-control-disabled`.
- *Error path:* Remote source 404s on game id → `failed` with category `no-such-game`.
- *Error path:* Remote prep succeeds but Moonlight spawn fails → `failed` with category `prepare-failed` or existing Moonlight failure category.
- *Integration:* Source routing reads payload `source.controlUrl`, NOT `getConnection().controlUrl`. (Verifies the connection-state-machine removal doesn't leave dead reads.)
- *Edge case:* Payload missing `source` → schema decode error surfaces as `ValidationError`. Zero-backwards-compat: no fallback to "assume local."

**Test scenarios (server's `app.library.launch`):**
- *Happy path:* Local entry → existing `launchLocalForegroundSession` runs; sessiond receives the local launch spec.
- *Edge case:* Remote entry on server-side handler → returns typed "remote-launch-not-supported" failure (v1 deferral). Callers without a Moonlight client surface gracefully.
- *Edge case:* Payload missing `source` → `ValidationError`.

**Verification:**
- AE5 and AE6 hold in `launch-bridge.test.ts`.
- `launch-bridge.ts` no longer reads `getConnection().controlUrl` (grep confirms).
- Server-side `app.library.launch` local path unchanged.
- Both schema variants decode correctly through real RPC roundtrips.

---

### U6. Desktop forwarder picks upstream via mDNS

**Goal:** `api-forwarder.ts` discovers its upstream via mDNS with a loopback fast-path. No `lastConnectedServer`, no connection state machine consumed.

**Requirements:** R1, R2, R3.

**Dependencies:** U7 (peers must advertise `caps: "source"` for the forwarder to filter).

**Files:**
- Modify: `korri/deploy/desktop/api-forwarder.ts` — `getUpstream()` consults a new `ForwarderUpstream` service with the loopback fast-path + mDNS fallback + short cache.
- Create: `korri/deploy/desktop/forwarder-upstream.ts` — discovery + caching for the forwarder's upstream pick.
- Create: `korri/deploy/desktop/forwarder-upstream.test.ts` — loopback fast-path, mDNS fallback, cache invalidation.
- Modify: `korri/deploy/desktop/main.ts` — replace `watchStreamHosts → makeConnectionController → getUpstream` wiring with `ForwarderUpstream` wiring. (Removals proper happen in U8; this unit lands the replacement.)
- Modify: `korri/deploy/desktop/api-forwarder.test.ts` — adapt to the new upstream source.

**Approach:**
- Loopback fast-path: probe `http://127.0.0.1:<server-port>/api/health` with short timeout (e.g., 200ms). If alive, cache as upstream for 5s.
- mDNS fallback: browse `_korri-stream._tcp` filtering on `caps: "source"`; pick the first result (no preference logic in v1 — peers are fungible per the brainstorm). Cache for 5s.
- On upstream fetch failure (current 502 path): invalidate cache, one re-pick + retry; if still fails, return 502.
- On "no upstream available" (loopback dead, no mDNS results): return 503 (existing path). Per R3, the UI treats this as empty rail with no error UI — the rail's empty-state handling lives in U2 / existing rail behavior.

**Execution note:** Implement test-first. The forwarder is on the hot path for every request and the loopback fast-path is the kind of optimization that's easy to subtly break.

**Patterns to follow:**
- Existing forwarder shape in `api-forwarder.ts` (request/response handling, header stripping).
- Existing in-memory bonjour factory pattern from `lan-stream-discovery.test.ts` for the test side.

**Test scenarios:**
- *Happy path:* Loopback server alive → forwarder uses `127.0.0.1`. **Covers AE1 partial (local form factor).**
- *Happy path:* Loopback dead, one mDNS peer with `caps: "source"` → forwarder uses that peer.
- *Happy path:* Loopback alive AND mDNS peer present → forwarder uses loopback (fast-path wins).
- *Error path:* Loopback dead, no mDNS results → forwarder returns 503 on `/api/*` requests. **Covers AE1.**
- *Error path:* Cached upstream becomes unreachable mid-request → invalidate, re-pick, retry; if still fails return 502.
- *Edge case:* mDNS result without `caps: "source"` (legacy stream-only) → forwarder skips it.
- *Edge case:* Cache window — two requests within 5s reuse the cached upstream without re-probing.
- *Integration:* Real `node:http` upstream + in-memory bonjour shows end-to-end forwarding works.

**Verification:**
- AE1 (boot path) and the cached-upstream-unreachable behavior both hold.
- Forwarder no longer reads `lastConnectedServer` (grep confirms).
- No regression in forwarder body tests.

---

### U7. Always-on advertise; broaden `caps` to discriminate library-bearing servers

**Goal:** Every library-bearing korri-server advertises unconditionally with `caps: ["source"]` (or `["source", "stream"]` when streaming-capable). The advertise-disable flag is removed. Discovery filters consume `caps`.

**Requirements:** R4, R16.

**Dependencies:** none.

**Files:**
- Modify: `tools/device/lan-stream-advertise.ts` — drop the `KORRI_SERVER_ADVERTISE_ENABLED` check; always advertise. Set `caps: ["source"]` by default; add `"stream"` when streaming infrastructure is present.
- Modify: `tools/device/korri-server.ts` — drop the `KORRI_SERVER_ADVERTISE_ENABLED` read; advertise unconditionally.
- Modify: `nix/modules/korri-server.nix` — drop the `services.korri.server.advertise.enable` option entirely (no NixOS default to flip; the option is gone). Drop the `KORRI_SERVER_ADVERTISE_ENABLED` env var emission.
- Modify: `tools/cli/lan-stream-discovery.ts` — extend the discriminator helper to accept `requiredCap: string` (default `"source"`); peers without it are excluded.
- Modify: `korri/products/app/api/source/list.rpc-handler.ts` — ungate from `KORRI_STREAM_CONTROL_ENABLED` (library-bearing servers always expose).
- Test: `tools/device/lan-stream-advertise.test.ts` — assert `caps` is set correctly given input flags.
- Test: `tools/cli/lan-stream-discovery.test.ts` — assert `caps: "source"` filtering.
- Test: `korri/products/app/api/source/list.rpc-handler.test.ts` — assert no gating.

**Approach:**
- `caps` composition: `["source"]` for every server hosting a library. Add `"stream"` if streaming is configured (existing logic). This is the source-of-truth field that distinguishes library-bearing from streaming-only.
- Ungating `app.source.list`: the existing `streamable` per-entry flag continues to indicate whether stream is possible. Federation peers that can't stream still contribute catalog.
- The Nix module no longer has a "disable advertise" knob. If we accidentally land a device that shouldn't be a federation member, the right answer is to not run korri-server on it — not to flag-disable advertise.

**Execution note:** Implement test-first. The capability filtering is the load-bearing semantic for which peers participate in federation.

**Patterns to follow:**
- Existing `caps` composition in `lan-stream-advertise.ts`.
- Existing discriminator helpers in `lan-stream-discovery.ts`.
- Nix option removal pattern from prior config cleanups in `nix/modules/`.

**Test scenarios:**
- *Happy path:* `lanStreamAdvertise` with stream config → `caps: ["source", "stream"]`.
- *Happy path:* `lanStreamAdvertise` without stream config → `caps: ["source"]`.
- *Happy path:* Discovery filters with `requiredCap: "source"` — peers without it excluded.
- *Happy path:* `app.source.list` works without `KORRI_STREAM_CONTROL_ENABLED` set; per-entry `streamable: false` reflects no stream.
- *Edge case:* Backward-incompat — old peers advertising with caps not including `"source"` are silently excluded from federation. (No compatibility shim per zero-backwards-compat.)
- *Edge case:* Nix evaluation fails or warns if `services.korri.server.advertise.enable` is set in a downstream config — the option is gone.

**Verification:**
- `caps` shape correct in advertise tests.
- Discovery filtering correct.
- `app.source.list` ungated.
- `nix flake check` (or `just test-nix`) passes; the removed option doesn't break evaluation of existing host configs.

---

### U8. Remove the single-server model

**Goal:** Delete `lastConnectedServer`, connection state machine, waiting page, vestigial env flags, and the desktop's `watchStreamHosts` consumer. No migration step, no transition flag.

**Requirements:** R14, R15, R16.

**Dependencies:** U6 (the new forwarder must already work before its predecessors are deleted).

**Files (deletions):**
- Delete: `korri/deploy/desktop/connection.ts` and `connection.test.ts`.
- Delete: `korri/deploy/desktop/connection-state-snapshot.ts` (snapshot type used only by connection-state consumers; after U5 + main.ts removal, this has no callers).
- Delete: `korri/deploy/desktop/waiting-page/` (entire directory).
- Delete: `/__korri/desktop/connection-status` handler in `korri/deploy/desktop/create-desktop-app.ts` (and any test that hits it).
- Delete: `lastConnectedServer` field normalization + writes in `korri/deploy/desktop/desktop-config.ts`. Field becomes unknown; old YAML files with the field have it dropped on read (no warning).

**Files (modifications):**
- Modify: `korri/deploy/desktop/main.ts` — remove `watchStreamHosts → makeConnectionController` wiring (already replaced in U6); remove any remaining `connection-state-snapshot` imports.
- Modify: `korri/deploy/desktop/create-desktop-app.ts` — remove the waiting catch-all branch and `getConnectionState()` reads. When the forwarder has no upstream, requests fall through with 503 (existing behavior) and the renderer's empty rail handles it.
- Modify: `korri/deploy/desktop/create-desktop-app.test.ts` — drop tests for the waiting catch-all and connection-status endpoint.
- Modify: `tools/desktop/desktop-smoke.ts` — remove `ConnectionStateSnapshot` import and any smoke flow that asserts connection-state transitions.
- Modify: `korri/deploy/desktop/runtime-config.ts` — remove the comment-level reference to the connection-state push pattern.
- Modify: `tools/device/korri-server.ts` — remove `KORRI_HEADLESS_SOURCE_ONLY` read (vestigial — the source-list gate was already retired upstream).
- Modify: `korri/products/app/api/source/list.rpc-handler.ts` — remove `KORRI_STREAM_CONTROL_ENABLED` gate (already ungated in U7; this is the env-var cleanup).
- Modify: `nix/modules/korri-server.nix` — remove env emission for the dropped flags.
- Modify: `korri/products/app/library/control-mode.ts` (or whichever file still references `KORRI_HEADLESS_SOURCE_ONLY`) — remove the vestigial code path.
- Sweep: `git grep ConnectionServerRecord` and `git grep ConnectionStateSnapshot` after the deletions; any remaining hit is a missed cleanup.

**Approach:**
- Grep for every reference to each deletion target before removing, to make sure no test or doc silently references it.
- Atomic commit per logical removal group (connection layer, waiting page, env flags) — three sub-commits is fine; the unit boundary is the broader "single-server model is gone."
- Renderer empty-rail behavior: ensure the renderer treats 503 from `/api/library/list` (or wherever the forwarder propagates the no-upstream signal) as an empty list, not an error overlay. R3 / AE1.

**Execution note:** Run `just check` after each sub-commit to catch dangling references early. This unit is the easiest place to leave a stale import or test fixture.

**Patterns to follow:**
- Prior zero-backwards-compat removal patterns in `docs/solutions/architecture-patterns/` (the `boot-scoped-control-plane-with-session-scoped-runner` migration is the closest precedent — though that one preserved compat; this one explicitly does not).
- Atomic commit boundary: one removal concept per commit.

**Test scenarios:**
- *Verification:* `git grep -i lastConnectedServer` returns nothing.
- *Verification:* `git grep watchStreamHosts korri/deploy/desktop` returns nothing.
- *Verification:* `git grep KORRI_HEADLESS_SOURCE_ONLY` returns nothing.
- *Verification:* `git grep KORRI_SERVER_ADVERTISE_ENABLED` returns nothing.
- *Verification:* `git grep KORRI_STREAM_CONTROL_ENABLED` returns nothing.
- *Verification:* `git grep -r connection.ts korri/deploy` returns nothing (file removed).
- *Verification:* `git grep -r waiting-page korri/deploy` returns nothing.
- *Happy path:* Desktop boots, fetches `/api/library/list`, renders rail. No waiting overlay ever appears.
- *Happy path:* Desktop with no peers + no local server → empty rail, no error overlay. **Covers AE1.**
- *Edge case:* `desktop.yaml` containing a stale `lastConnectedServer` field — desktop reads the rest of the config and silently drops the unknown field (no migration warning).

**Verification:**
- All grep checks pass.
- AE1 (empty rail on no upstream) holds in a desktop integration test.
- `just check` is green.

**Test expectation:** Most of this unit is removal; verification leans on `git grep` invariants plus the integration scenarios above. The removals themselves don't introduce new behavior to unit-test.

---

## System-Wide Impact

- **Interaction graph:** RPC surface changes (`app.library.list`, `app.source.list`, `app.library.launch` payloads) ripple to every consumer. Home rail, desktop launcher bridge, any test fixture, the React atom layer. The cross-cutting nature is why U1 is the foundational unit.
- **Error propagation:** Peer failures must not cascade — `app.library.list` swallows per-peer failures (R9). Local failures still propagate as `DataError`. Remote launch failures use the existing typed shape from `remote-stream-client.ts` (R13).
- **State lifecycle risks:** Peer set is in-memory only; not persisted. A korri-server restart loses its peer set and rebuilds it from the next mDNS browse cycle. The desktop bun's forwarder upstream cache (5s) survives Bun-process lifetime only.
- **API surface parity:** The schema additions (source field, payload extension) are breaking changes. Every consumer is updated in the same series; no parallel deprecation. Zero backwards compat.
- **Integration coverage:** Cross-process integration is non-trivial — desktop bun, korri-server, and renderer must agree on the new wire shape. The desktop forwarder integration test (`api-forwarder.test.ts`) plus the renderer's home rail test (`ShiftHomeRail.test.tsx`) plus a new federation test (covered in U4) form the cross-layer coverage.
- **Unchanged invariants:** `app.server.stream.prepare` wire shape is unchanged. `tools/scripts/pair-moonlight.sh` flow is unchanged. ProseQL backing for the local library is unchanged. The renderer's atom-driven data flow (`@effect/atom-react`) is unchanged. The sessiond foreground lifecycle owner is unchanged — remote launches hand back to it.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Schema change to `LaunchLibraryPayload` breaks every launcher call site | All call sites updated in U1 + U5; `just typecheck` catches drift; zero-backwards-compat removes the temptation to add a fallback that could mask a missed call site. |
| Identity collision in the rail when same `game.id` appears from two peers | U2 composes the rail key from source + id; AE3 test directly exercises this. |
| Foreground lifecycle bypass on remote launch | U5 routes remote prepare artifacts through local sessiond; the foreground learning is cited in the unit's approach. |
| Per-peer timeout too short / too long | Default 2s with concurrency-unbounded fan-out keeps the federated response responsive on healthy LANs and bounded on degraded ones; tunability deferred to implementation if real-world data calls for it. |
| Duplicate mDNS publishers (the `boot-scoped-control-plane-with-session-scoped-runner` failure mode) | One server, one advertise, no system+user duplication. Nix module emits only one publisher per host. U7 verifies the option removal doesn't leave a stale duplicate path. |
| Boot-race: forwarder reaches mDNS before any server has advertised | Loopback fast-path + brief empty rail tolerance per R3. Local-server-on-same-device case is the common one and the loopback probe is sub-100ms. |
| `desktop.yaml` files in the wild with stale `lastConnectedServer` | Schema drops unknown keys silently. No migration warning — zero-backwards-compat means no migration. |
| Removal regresses something subtle (e.g., a forgotten test fixture referencing the connection state machine) | Atomic-per-removal commits in U8 + `just check` between sub-commits surface dangling references early. |
| A peer advertises but rejects RPC due to gating mismatch (older peer with the old `KORRI_STREAM_CONTROL_ENABLED` gate still on) | Federation tolerates per-peer failures (R9). No special handling needed; old peer contributes nothing. Aligns with the "old peers get filtered" zero-backwards-compat stance. |

---

## Phased Delivery

The 8 units cluster into 4 phases. Each phase delivers a working slice; the plan is implemented in this order.

**Phase 1 — Foundation:**
- U1 (source field schema)
- U7 (advertise/caps + ungating)
- U3 (server-side peer discovery)

End-of-phase state: schemas carry source; library-bearing servers advertise `caps: "source"`; servers can browse peers. No behavior change to the rail or to launches yet.

**Phase 2 — Server-side federation:**
- U4 (fan-out in `app.library.list`)
- U5 (launch routing in bun's `app.desktop.launch` and server's `app.library.launch`)

End-of-phase state: federated catalog returned from `app.library.list`; launches route by source. But the desktop is still using the old single-upstream forwarder.

**Phase 3 — UI + forwarder shift:**
- U2 (rail keying by source + id)
- U6 (forwarder mDNS upstream pick)

End-of-phase state: end-to-end federation works through the new forwarder. The old paths still exist as dead code.

**Phase 4 — Cleanup:**
- U8 (remove `lastConnectedServer`, connection state machine, waiting page, vestigial env flags)

End-of-phase state: zero backwards compat achieved. The plan is done.

---

## Alternative Approaches Considered

- **Client-side federation (UI aggregates from multiple servers):** Rejected. Violates "UI is a dumb client; server does the work" from origin Key Decisions. Would put peer-discovery, fan-out, and source-tagging into the desktop bun, which conflicts with the `electrobun-desktop-wrapper-loopback` learning.
- **Forwarder aggregator (the bun fans out, not the server):** Rejected for the same reason as client-side. Also would force every desktop bun to maintain peer state, duplicating the server's work. Bumps the bun from same-origin proxy to product logic owner.
- **Composite launch id string (`${hostId}:${gameId}`) instead of payload schema change:** Rejected. Fragile when either component contains the delimiter, no schema-level validation, harder to trace through tests. Schema extension is the structural-identity move the `pointer-aware-spatial-navigation` learning argues for.
- **New mDNS service type (e.g., `_korri-library._tcp`) instead of `caps` extension:** Rejected. Heavier touch on Nix, Avahi fallback, and prior brainstorm history with no semantic gain. `caps` already supports the discriminator at TXT-record level.
- **Staged removal of `lastConnectedServer` behind a feature gate:** Rejected. User constraint is zero backwards compat. Gating defeats the constraint and adds a transitional code path nobody wants to maintain.
- **Real-time push for federation (subscription RPC instead of snapshot):** Rejected for v1. Origin R8 explicitly defers this. The seam to add `app.library.watch` later doesn't require modifying `app.library.list`.

---

## Operational / Rollout Notes

- **No migration story by design.** `desktop.yaml` files with stale `lastConnectedServer` are read with the field dropped silently. The trade-off is intentional — origin Key Decisions named it as the zero-backwards-compat consequence.
- **Sobo PICO-8 entries become visible without further action** once federation lands. The library file written today at `/var/lib/korri-server/.local/share/korri/library/pico-8.yaml` will surface through the federated `app.library.list` from Sobo itself (loopback fast-path) and from AKA (mDNS fan-out).
- **Nix evaluation may surface stale options** in downstream host configs. The `services.korri.server.advertise.enable` option removal in U7 means any host config that sets it will fail evaluation. The fix is to remove the setting from the host config; the option is gone.
- **No monitoring or metrics to add.** Federation operates on snapshot-per-call; per-peer failure logs go through the existing logger. If a future slice wants federation health telemetry, that's a separate slice.
- **Backwards-incompat with old peers:** Korri-servers running pre-federation builds advertise without `caps: "source"` and will be silently excluded from federation. This is acceptable per zero-backwards-compat. The fleet should roll forward together.

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-27-korri-library-federation-requirements.md`
- **Prior brainstorms (referenced from origin):**
  - `docs/brainstorms/2026-05-19-korri-lan-stream-discovery-requirements.md` (mDNS advertise/browse infrastructure)
  - `docs/brainstorms/2026-05-20-korri-headless-source-aware-server-requirements.md` (source-aware federation thesis)
- **Institutional learnings:**
  - `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`
  - `docs/solutions/architecture-patterns/boot-scoped-control-plane-with-session-scoped-runner-2026-05-19.md`
  - `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md`
  - `docs/solutions/integration-issues/effect-v4-rpc-schema-class-responses-2026-05-03.md`
  - `docs/solutions/best-practices/pointer-aware-spatial-navigation-2026-05-01.md`
- **Key code references:**
  - `korri/deploy/desktop/api-forwarder.ts`
  - `korri/deploy/desktop/connection.ts` (to be deleted)
  - `korri/deploy/desktop/waiting-page/` (to be deleted)
  - `korri/products/app/api/library/list.rpc-handler.ts`
  - `korri/products/app/api/source/list.rpc-handler.ts`
  - `korri/products/app/api/library/launch.rpc-handler.ts`
  - `korri/products/app/api/server/prepare.rpc-handler.ts`
  - `korri/products/app/stream/remote-stream-client.ts`
  - `tools/device/lan-stream-advertise.ts`
  - `tools/cli/lan-stream-discovery.ts`
  - `tools/device/korri-server.ts`
  - `nix/modules/korri-server.nix`
