---
title: fix: Unify catalog discovery behind an incremental peer fabric
type: fix
status: completed
date: 2026-06-13
verify_command: "bun test product/apps/desktop/forwarder-upstream.test.ts product/apps/desktop/create-desktop-app.test.ts product/apps/portal/api/library/list.rpc-handler.test.ts product/apps/portal/api/source/list.rpc-handler.test.ts product/apps/portal/api/hono-app.test.ts product/apps/portal/api/server/rpc-server.test.ts product/apps/portal/peers/peer-source-fetcher.test.ts product/platform/react/library/library-atoms.test.ts product/apps/portal/features/home/HomeRuntimeLayersRoot.test.tsx product/themes/shift/pages/ShiftHomeReadyBody.test.tsx product/themes/shift/templates/ShiftHomeRoot.test.tsx"
---

# fix: Unify catalog discovery behind an incremental peer fabric

## Summary

Replace the renderer's single-upstream library dependency with a local catalog coordinator that exposes one unified catalog fabric. The coordinator treats the current machine and LAN machines as peers, returns known games immediately, and reports peer progress/failures without letting any one peer keep the Shift home screen on `Loading library…`.

---

## Problem Frame

Bandai's daemon can return the library successfully, but the Electrobun desktop can still forward renderer API calls to a dead LAN peer such as `192.168.1.117`, leaving Shift parked on `Loading library…`. The recurring failure is architectural: catalog federation and desktop transport bootstrap are tangled, so the UI must pick one upstream before it can see the unified catalog.

---

## Requirements

- R1. The GUI must render already-known games as soon as any catalog peer, including the current machine, has produced entries.
- R2. The current machine must be represented as a catalog peer in the same peer model as LAN machines; “self” may have bootstrap priority but must not be a separate catalog concept.
- R3. Desktop API transport must have a reliable bootstrap endpoint and must not select an arbitrary dead LAN peer as the renderer's only API upstream.
- R4. Peer discovery, peer fetch, and peer failure must enrich or annotate the catalog asynchronously rather than blocking first paint.
- R5. `app.library.list` compatibility must be preserved for existing callers while new snapshot/watch surfaces expose peer state for incremental UI.
- R6. Shift must distinguish local/bootstrap failure, empty catalog, peer loading, and peer failure instead of collapsing all of them into `Loading library…`.
- R7. The implementation must include deterministic coverage for dead peers, slow peers, stale mDNS advertisements, and self-peer entries.

---

## Scope Boundaries

- Do not remove federation or make “local-only” the product model. The target model is a single catalog fabric with self and remote peers.
- Do not redesign game launch routing beyond preserving the existing `EntrySource` handoff needed to launch local versus remote entries.
- Do not require Steam, Ryujinx, or emulator runtime changes; this plan is about catalog discovery/listing/rendering.
- Do not make the renderer directly browse mDNS or directly call arbitrary peers.

### Deferred to Follow-Up Work

- Rich remote metadata/art hydration beyond the minimal remote catalog currently exposed by `app.source.list`.
- Durable on-disk peer catalog cache across daemon restarts, if the in-memory snapshot proves insufficient.
- Search/ranking UX over multiple peers after the base catalog fabric is stable.

---

## Context & Research

### Relevant Code and Patterns

- `product/apps/desktop/forwarder-upstream.ts` currently chooses one upstream: loopback first, then first source-capable mDNS peer. This is the wrong layer for catalog federation because a stale remote peer can become the renderer's only API path.
- `product/apps/desktop/create-desktop-app.ts` forwards all `/api/*` renderer calls through the chosen upstream and already has tests for routing, 503 behavior, and static asset fallback.
- `product/apps/portal/api/library/list.rpc-handler.ts` already merges local entries and peer entries, but it performs per-request fan-out before returning a single `ListLibraryResponse`.
- `product/apps/portal/peers/peer-discovery.ts` maintains peer state in a `SubscriptionRef` and already filters self advertisements by host id; this is the right primitive for a live peer set.
- `product/apps/portal/peers/peer-source-fetcher.ts` already collapses per-peer failures to empty entries and logs skipped peers. This is useful, but the failure state is currently lost to the UI.
- `product/apps/portal/features/home/library-source-layer-rpc.ts` and `product/platform/react/library/library-atoms.ts` currently read `app.library.list` as one async atom result, which makes partial peer progress hard to display.
- `product/themes/shift/pages/ShiftHomePage.tsx` and related Shift ready/loading/error bodies are the visible boundary where a unified catalog snapshot should become “Ready with syncing peers” instead of “Loading”.

### Institutional Learnings

- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` is referenced by the current forwarder comments: desktop/WebKit should use the wrapper loopback composition instead of inventing IPC or remote transport paths in the renderer.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md` establishes that federation is an image posture and should be explicit/testable, not an accidental per-host override.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` reinforces a similar boundary: renderer-facing state should flow through standard local RPC surfaces, while daemon/session components own external lifecycle truth.

### External References

- External research intentionally skipped. The repo already contains direct patterns for Hono API forwarding, Effect `SubscriptionRef`, peer discovery, RPC handlers, and React atom state; current failures are architectural composition issues in local code, not framework-knowledge gaps.

---

## Key Technical Decisions

- Treat “self” as a catalog peer, not as a special catalog branch: this satisfies the user's model that local and remote machines are peers in one fabric while still allowing the desktop to use loopback as the reliable bootstrap transport.
- Keep the desktop forwarder as bootstrap transport only: renderer `/api/*` should reach the nearest local coordinator; LAN peer selection belongs inside the coordinator's peer fabric, not in Electrobun's upstream picker.
- Split snapshot state from request-time fan-out: maintain a current catalog snapshot with per-peer states, then let request/stream surfaces read that snapshot instead of waiting for all peers on every `app.library.list` call.
- Preserve `app.library.list` as a compatibility surface: existing callers should still receive a flat `games` array, but it should represent current known entries and not block on slow/offline peers.
- Add an explicit snapshot/watch surface for richer UI: Shift needs enough state to say “games ready, peers syncing/failed” without parsing log messages or conflating peer failures with local catalog failure.
- Record peer health separately from entries: peer errors should be observable and testable, but they must not remove already-rendered entries or reset the whole catalog to waiting.

---

## Open Questions

### Resolved During Planning

- Should local be separate from peers? No. Local should be represented as the self peer in a unified catalog fabric; only the renderer bootstrap transport is special.
- Should desktop keep choosing remote peers as upstreams? No for kiosk/product desktop. Remote peers are catalog participants behind the coordinator, not renderer transport targets.

### Deferred to Implementation

- Exact snapshot event shape: finalize while touching the existing RPC/SSE serialization code, but it must carry unified entries plus per-peer state.
- Exact peer refresh cadence: choose the smallest implementation that updates promptly on discovery changes and avoids request-time stalls.
- Whether the first slice streams patches or emits full snapshots: either is acceptable if the UI receives known games immediately and peer failures cannot regress it to loading.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Current failure shape
═════════════════════

┌──────────────┐
│ Shift GUI    │
└──────┬───────┘
       │ /api/rpc app.library.list
       ▼
┌────────────────────────────┐
│ desktop API forwarder       │
│ chooses exactly one upstream│
└──────┬─────────────────────┘
       │
       ├─► 127.0.0.1:3001      self coordinator, good when selected
       │
       └─► 192.168.1.117:3001  stale LAN peer, connection refused
                │
                ▼
        renderer receives no catalog
        Shift remains Loading
```

```text
Target shape
════════════

┌──────────────┐
│ Shift GUI    │
└──────┬───────┘
       │ local /api catalog snapshot + events
       ▼
┌────────────────────────────┐
│ desktop API forwarder       │
│ reliable loopback bootstrap │
└──────┬─────────────────────┘
       ▼
┌──────────────────────────────────────────────────────┐
│ catalog coordinator in local korrid                   │
│                                                      │
│  peer fabric snapshot                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ bandai/self  │  │ aka          │  │ future peer│  │
│  │ Ready        │  │ Failed       │  │ Loading    │  │
│  │ 37 games     │  │ refused      │  │ ...        │  │
│  └──────────────┘  └──────────────┘  └────────────┘  │
└──────┬───────────────────────────────────────────────┘
       │ unified entries + peer states
       ▼
┌────────────────────────────┐
│ Shift renders known games   │
│ plus subtle peer diagnostics│
└────────────────────────────┘
```

---

## Implementation Units

### U1. Constrain desktop forwarding to bootstrap, not federation

**Goal:** Stop the renderer from depending on a single arbitrary LAN peer while preserving the desktop loopback server and its existing API forwarding contract.

**Requirements:** R1, R3, R5

**Dependencies:** None

**Files:**
- Modify: `product/apps/desktop/forwarder-upstream.ts`
- Modify: `product/apps/desktop/main.ts`
- Modify: `product/apps/desktop/create-desktop-app.ts`
- Test: `product/apps/desktop/forwarder-upstream.test.ts`
- Test: `product/apps/desktop/create-desktop-app.test.ts`
- Modify/Test as needed: `product/systems/nixos/modules/korri-sessiond.nix`
- Test as needed: `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`

**Approach:**
- Reframe the desktop upstream picker as a bootstrap transport picker, not a federation picker.
- Add an explicit remote-bootstrap mode switch, defaulting off for product/kiosk builds. A concrete implementation option is `allowRemoteApiBootstrap` on `ForwarderUpstreamOptions`, wired from a development-only environment/config value such as `KORRI_DESKTOP_ALLOW_REMOTE_API_BOOTSTRAP=1`.
- For device/kiosk profile, make loopback the only normal API upstream; if loopback is unavailable, surface a local 503/diagnostic rather than selecting a LAN peer.
- Keep any mDNS fallback only under the explicit development/lab configuration and make that mode visible in configuration/tests.
- Preserve existing static asset serving and `/api/*` forwarding behavior once the local upstream is selected.

**Execution note:** Characterization-first: pin the current bad behavior with tests before changing the picker semantics.

**Patterns to follow:**
- `product/apps/desktop/forwarder-upstream.test.ts` for injected probes and bonjour fixtures.
- `product/apps/desktop/create-desktop-app.test.ts` for forwarder/no-upstream behavior.

**Test scenarios:**
- Happy path: kiosk/device profile with healthy loopback picks `http://127.0.0.1:3001` even when source-capable mDNS peers exist.
- Error path: kiosk/device profile with unhealthy loopback and source-capable mDNS peers returns no upstream/503 rather than selecting the LAN peer.
- Edge case: development/lab opt-in mode, if retained, still supports mDNS fallback and is covered separately from kiosk/device behavior.
- Regression: the current “falls back to mDNS peer” test is reframed so it passes only when explicit remote-bootstrap mode is enabled; product/kiosk mode must assert the opposite.
- Integration: `/api/rpc` request through `createDesktopApp` surfaces the local no-upstream diagnostic when loopback is unavailable, without serving the SPA fallback.

**Verification:**
- Renderer API calls cannot be forwarded to a stale peer in product kiosk mode.
- Existing desktop static asset and runtime-config injection behavior is unchanged.

### U2. Model a unified catalog peer fabric with self as a peer

**Goal:** Introduce a single peer-state model that represents self and LAN machines uniformly, with status separate from catalog entries.

**Requirements:** R2, R4, R7

**Dependencies:** U1

**Files:**
- Modify: `product/apps/portal/peers/peer-discovery.ts`
- Modify/Create: `product/apps/portal/peers/catalog-peer-state.ts`
- Modify/Create: `product/apps/portal/peers/catalog-peer-state.test.ts`
- Modify: `product/apps/portal/peers/peer-source-fetcher.ts`
- Test: `product/apps/portal/peers/peer-source-fetcher.test.ts`
- Test: `product/apps/portal/api/library/list.rpc-handler.test.ts`

**Approach:**
- Add a peer fabric representation with a self peer and discovered remote peers sharing one shape: identity, control URL, capabilities, status, last update, and optional error.
- Keep peer entries as unified catalog entries tagged by source/peer identity; do not split local and remote entries into separate top-level concepts.
- Preserve self-filtering in mDNS discovery to avoid duplicate remote fetches of the current daemon; the self peer should be created deliberately by the coordinator, not rediscovered through mDNS.
- Promote peer fetch failures from “log and empty array only” into peer status while still preserving the graceful no-throw behavior for catalog aggregation.

**Patterns to follow:**
- `product/apps/portal/peers/peer-discovery.ts` for `SubscriptionRef` state and scoped bonjour consumers.
- `product/apps/portal/peers/peer-source-fetcher.ts` for injected client factories and failure collapse.

**Test scenarios:**
- Happy path: self peer and one remote peer appear in one peer map/snapshot with distinct identities and the same structural fields.
- Edge case: mDNS advertises this host's own host id; the discovered event is ignored and does not duplicate the self peer.
- Error path: unreachable remote peer records a failed peer state while leaving existing self entries intact.
- Integration: peer disappear event removes or marks the remote peer without mutating self peer state.

**Verification:**
- Peer state can answer “what peers exist and what is their health?” independently of whether entries are currently present.
- Self is represented in the same catalog fabric as remote peers.

### U3. Make library aggregation snapshot-based and non-blocking

**Goal:** Change library listing from request-time full fan-out to reading a live snapshot that is updated asynchronously as peers resolve.

**Requirements:** R1, R2, R4, R5, R7

**Dependencies:** U2

**Files:**
- Modify/Create: `product/apps/portal/api/library/catalog-snapshot.ts`
- Modify/Create: `product/apps/portal/api/library/catalog-snapshot.test.ts`
- Modify: `product/apps/portal/api/library/list.rpc-handler.ts`
- Test: `product/apps/portal/api/library/list.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/source/list.rpc-handler.ts`
- Test: `product/apps/portal/api/source/list.rpc-handler.test.ts`
- Modify as needed: `product/apps/portal/api/app-rpc-group.ts`
- Modify as needed: `product/apps/portal/api/rpc-server.ts`
- Modify as needed: `product/apps/portal/api/server/rpc-group.ts`
- Modify as needed: `product/apps/portal/api/server/rpc-server.ts`
- Test as needed: `product/apps/portal/api/server/rpc-server.test.ts`
- Modify as needed: `product/services/device/korrid.ts`

**Approach:**
- Create a daemon-scoped catalog snapshot service that subscribes to peer set changes and refreshes peer catalogs outside the hot `app.library.list` request path.
- Wire that service into the same Effect layer graph that currently provides library infrastructure for both RPC servers, rather than treating `korrid.ts` as the primary injection point.
- Populate the self peer from `LibrarySource` first; publish that snapshot even while remote peers are still pending.
- Update remote peer entries and peer states as each peer succeeds, times out, fails, or disappears.
- Keep `app.library.list` returning a flat `games` list for compatibility, sourced from the current snapshot instead of blocking on fresh fan-out.
- Ensure the snapshot can represent an empty-but-ready catalog separately from still-loading peer states.

**Execution note:** Start with tests that simulate a slow remote peer and assert immediate self entries; this guards the exact regression that caused the loading loop.

**Patterns to follow:**
- Existing `Effect` layer construction in `product/apps/portal/peers/peer-discovery.ts`.
- Existing ProseQL source wiring in `product/apps/portal/api/library/list.rpc-handler.test.ts`.

**Test scenarios:**
- Happy path: self peer has one game and remote peer is pending; `app.library.list` returns the self game immediately.
- Happy path: remote peer later succeeds; subsequent snapshot/list includes both self and remote entries.
- Edge case: no peers and empty self catalog returns `{ games: [] }` with ready state internally, not waiting.
- Error path: one remote peer times out; known self and successful remote entries remain available, and peer status records timeout/failure.
- Error path: self source fails; the list/snapshot reports a local/bootstrap catalog error instead of pretending peer failures caused an empty catalog.
- Integration: peer discovery changes trigger background refresh without requiring a renderer request to start the work.

**Verification:**
- Slow or dead peers cannot delay the first self-backed catalog response.
- `app.library.list` remains source-compatible for existing callers.

### U4. Add a catalog snapshot/watch surface for incremental UI

**Goal:** Expose unified entries and peer states to the renderer so the UI can update as peers come in and show diagnostics without parsing logs.

**Requirements:** R1, R4, R5, R6, R7

**Dependencies:** U3

**Files:**
- Create/Modify: `product/apps/portal/api/library/snapshot.rpc.ts`
- Create/Modify: `product/apps/portal/api/library/snapshot.rpc-handler.ts`
- Create/Modify: `product/apps/portal/api/library/snapshot.rpc-handler.test.ts`
- Modify: `product/apps/portal/api/app-rpc-group.ts`
- Modify: `product/apps/portal/api/server/rpc-group.ts`
- Modify: `product/apps/portal/api/rpc-server.ts`
- Modify: `product/apps/portal/api/server/rpc-server.ts`
- Test: `product/apps/portal/api/server/rpc-server.test.ts`
- Modify: `product/apps/portal/api/hono-app.ts`
- Test: `product/apps/portal/api/hono-app.test.ts`
- Modify: `product/apps/desktop/create-desktop-app.ts`
- Test: `product/apps/desktop/create-desktop-app.test.ts`

**Approach:**
- Add a snapshot RPC returning one unified items array plus peer status metadata.
- Add a watch/event route only if needed for responsive updates; the event payload should refer to full snapshot version or compact peer/item deltas, whichever best fits existing Hono/RPC conventions.
- Ensure desktop forwarding handles the snapshot/watch route through the local bootstrap endpoint.
- Keep `app.library.list` as a compatibility API; new UI code should prefer the richer snapshot/watch surface once available.

**Technical design:** Directional response shape only, not implementation specification:

```text
CatalogSnapshot
├─ entries: unified playable entries tagged with source peer
├─ peers: peer id → { state, control url, last update, optional error }
├─ generation: monotonic value for renderer reconciliation
└─ updatedAt: timestamp for diagnostics
```

**Patterns to follow:**
- `product/apps/portal/api/library/list.rpc.ts` and `list.rpc-handler.ts` for RPC shape and handler structure.
- `product/apps/portal/api/hono-app.ts` for adding non-RPC API routes when streaming is needed.
- Existing `/api/config/events` forwarding behavior for SSE-style routes.

**Test scenarios:**
- Happy path: snapshot RPC returns self entries and peer statuses in one response.
- Happy path: watch/event route emits an update when a peer moves from loading to ready.
- Error path: failed peer appears in peer state while entries remain populated from other peers.
- Edge case: duplicate playable ids from different peers remain distinguishable through source/peer metadata.
- Integration: desktop forwards snapshot/watch requests to local coordinator and does not route them to mDNS peers.

**Verification:**
- Renderer has enough information to render games and peer diagnostics from a single catalog concept.
- Existing list callers still work while new callers can opt into richer state.

### U5. Teach React atoms and Shift to render partial-ready catalog state

**Goal:** Change the frontend from one “waiting/error/ready” list result into a user-visible state that renders known games while peer work continues or fails.

**Requirements:** R1, R5, R6, R7

**Dependencies:** U4

**Files:**
- Modify: `product/apps/portal/features/home/library-source-layer-rpc.ts`
- Modify: `product/platform/react/library/library-atoms.ts`
- Create: `product/platform/react/library/library-atoms.test.ts`
- Modify: `product/platform/library/library-list-state.ts`
- Modify: `product/platform/react/library/library-list-state-root.tsx`
- Modify: `product/themes/shift/pages/ShiftHomePage.tsx`
- Modify: `product/themes/shift/pages/ShiftHomeLoadingBody.tsx`
- Modify/Create: `product/themes/shift/pages/ShiftHomePeerStatusNotice.tsx`
- Test: `product/apps/portal/features/home/HomeRuntimeLayersRoot.test.tsx`
- Test: `product/themes/shift/pages/ShiftHomeReadyBody.test.tsx`
- Test: `product/themes/shift/templates/ShiftHomeRoot.test.tsx`

**Approach:**
- Add a frontend catalog state that can be “ready with peer loading/failures” instead of only waiting or failed.
- Prefer the richer snapshot/watch surface when available, while retaining fallback behavior for `app.library.list` if necessary.
- Render known games immediately; surface peer failures as unobtrusive diagnostics or status affordances, not as full-screen loading.
- Reserve full-screen `Loading library…` for the narrow condition where no peer, including self, has produced a first ready/empty result yet.
- Reserve full-screen error for local/bootstrap catalog failure that prevents any authoritative coordinator response.

**Patterns to follow:**
- `product/platform/library/library-list-state.ts` for existing state normalization.
- `product/themes/shift/pages/ShiftHomeReadyBody.tsx` for Shift home rendering and launch interactions.
- `product/apps/portal/features/home/HomeRuntimeLayersRoot.tsx` for route-local atom runtime seeding and refresh behavior.

**Test scenarios:**
- Happy path: snapshot has self entries and one loading peer; Shift renders the rail with games and does not show `Loading library…`.
- Happy path: watch update adds remote entries; the rail updates without a full page reload.
- Error path: snapshot has self entries and failed peer; Shift keeps the rail visible and exposes peer diagnostic state.
- Error path: local coordinator unavailable/no upstream; Shift shows a meaningful local connection/load error rather than empty catalog if no prior snapshot exists.
- Edge case: snapshot has no entries but self peer is ready and all peers are done; Shift renders the empty state, not loading.
- Integration: launching an entry still carries its `source` metadata through the existing launch path.

**Verification:**
- The user can see 30XX/Stray even while a LAN peer is offline.
- `Loading library…` no longer appears for peer-only failures.

### U6. Add operational diagnostics and regression gates

**Goal:** Make future “Loading library…” incidents diagnosable from the UI/logs and testable without couch-driven manual inference.

**Requirements:** R3, R6, R7

**Dependencies:** U1, U3, U4

**Files:**
- Modify: `product/apps/desktop/forwarder-upstream.ts`
- Modify: `product/apps/desktop/create-desktop-app.ts`
- Modify: `product/apps/portal/api/library/list.rpc-handler.ts`
- Modify: `product/apps/portal/api/library/snapshot.rpc.ts`
- Modify: `product/apps/portal/api/library/snapshot.rpc-handler.ts`
- Test: `product/apps/desktop/forwarder-upstream.test.ts`
- Test: `product/apps/portal/api/library/list.rpc-handler.test.ts`
- Test: `product/apps/portal/api/library/snapshot.rpc-handler.test.ts`
- Modify as needed: `packages/pi-korrid-tools/src/korrid-tools.ts`
- Test as needed: `packages/pi-korrid-tools/tests/korrid-tools.test.ts`

**Approach:**
- Log structured events for bootstrap upstream selection, self-peer readiness, peer transitions, and snapshot generation changes.
- Add a compact `health`/`diagnostics` summary field to the U4 snapshot response instead of creating a one-off diagnostics helper. The summary should answer: coordinator reachable, self peer state, peer counts by state, last failure, current generation.
- Extend read-only tooling only if existing tools cannot observe the new snapshot/peer states.
- Avoid noisy per-frame or per-poll logging; diagnostics should explain state transitions and current status.

**Patterns to follow:**
- Existing desktop `renderer-trace` and pino log shapes in `product/apps/desktop/create-desktop-app.ts`.
- Existing `korrid_query`/tooling conventions in `packages/pi-korrid-tools/src/korrid-tools.ts`.

**Test scenarios:**
- Happy path: bootstrap chooses loopback and logs/diagnostics identify local coordinator as the transport endpoint.
- Error path: loopback unavailable in kiosk mode returns no upstream and records a local bootstrap diagnostic, not a selected remote URL.
- Error path: remote peer connection refused appears in peer diagnostics with host id/control URL while catalog entries remain available.
- Integration: read-only tooling can summarize catalog health without launching games or mutating state.

**Verification:**
- A future screenshot of `Loading library…` can be triaged by checking one diagnostic surface instead of manually correlating logs and RPC calls.

---

## System-Wide Impact

- **Interaction graph:** Electrobun desktop continues to serve the webview and forward `/api/*`, but peer discovery/fan-out moves fully behind local `korrid` catalog coordination. The renderer reads one catalog surface and launch continues through existing `EntrySource` routing.
- **Error propagation:** Bootstrap/local coordinator failures may block the catalog; remote peer failures must become peer-state diagnostics and must not fail the unified catalog as a whole.
- **State lifecycle risks:** Snapshot generation must avoid stale peer entries after disappear events, duplicate self entries, and regressions from ready back to loading when a remote peer reconnects/fails.
- **API surface parity:** `app.library.list` remains a flat compatibility API; new snapshot/watch surfaces carry richer state. CLI/tooling may need read-only support for the richer surface.
- **Integration coverage:** Unit tests must cover peer state transitions; integration-style handler tests must prove self entries are returned while remote peers are pending or failed.
- **Unchanged invariants:** Launch selection, app-choice resolution, Steam launch wrappers, Ryubing launch policy, and ProseQL config materialization are not redesigned by this work.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Moving from request-time fan-out to snapshots could introduce stale remote entries. | Track peer generation/last update and test disappear/failure transitions explicitly. |
| Preserving `app.library.list` while adding snapshot/watch could create two subtly different catalog definitions. | Back both surfaces from the same catalog snapshot service. |
| Removing desktop mDNS fallback could affect development workflows that relied on remote desktop forwarding. | Keep any remote fallback behind explicit lab/dev configuration and document/test the mode separately. |
| Frontend state changes could hide true local failures as “partial ready”. | Distinguish coordinator/self-peer failure from remote peer failure in the snapshot model and Shift state mapping. |
| Peer updates could cause noisy UI churn. | Use generation-based snapshot updates and unobtrusive diagnostics; avoid resetting focus or launch state on peer-only updates. |

---

## Documentation / Operational Notes

- Update existing comments in `product/apps/desktop/forwarder-upstream.ts` to state that federation is coordinated by `korrid`, not by desktop upstream selection.
- Consider adding or updating a `docs/solutions/` learning after implementation only if the user wants the architectural lesson captured durably.
- Device validation should include an offline/stale peer advertisement scenario and confirm the home rail still renders current-machine games.

---

## Sources & References

- Related code: `product/apps/desktop/forwarder-upstream.ts`
- Related code: `product/apps/desktop/create-desktop-app.ts`
- Related code: `product/apps/portal/api/library/list.rpc-handler.ts`
- Related code: `product/apps/portal/peers/peer-discovery.ts`
- Related code: `product/apps/portal/peers/peer-source-fetcher.ts`
- Related code: `product/apps/portal/features/home/library-source-layer-rpc.ts`
- Related code: `product/platform/react/library/library-atoms.ts`
- Related code: `product/themes/shift/pages/ShiftHomePage.tsx`
- Institutional learning: `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`
- Institutional learning: `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md`
