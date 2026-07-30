---
title: "feat: Web-first session lifecycle"
type: feat
status: completed
date: 2026-07-29
---

# feat: Web-first session lifecycle

## Summary

Replace the native black-screen-with-modal pre-stream experience with a web-rendered session lifecycle: the portal shows prepare progress, a portal-origin overlay inside the stream activity shows connection stages, and the stream is revealed only when frames are flowing. The portal also learns what is playing and can stop it, all through the embedded Rust brain.

---

## Problem Frame

Slice 4 launches games via korrid prepare → native stream activity, but the handoff trampolines into Moonlight's `SpinnerDialog` over a black surface. The Korri experience should stay in web UI for the entire pre-stream lifecycle, and after returning from a stream the portal currently knows nothing about session state.

---

## Requirements

- R1. Selecting a game never shows native connecting UI; lifecycle is visible in web UI from prepare until the stream is ready (reveal at the native connection-established signal)
- R2. Connection stages are shown as they occur, as semantic events, not raw native strings
- R3. Failures at any point (prepare, connect, mid-stream termination) render as web UI with a tagged reason and land the user back in the portal — never a native dialog
- R4. After returning from a stream, the portal reflects session state (now playing / nothing playing)
- R5. The user can stop the active host session from the portal
- R6. Step zero: slice 4 merges to main and AGENTS.md records the standing decisions (Rust services, generated contracts, brain behind localhost)
- R7. Stock Artemis flows (PcView, shortcuts, settings) are unaffected

---

## Scope Boundaries

- Host-side Rust korrid rewrite (legacy Effect-RPC wire remains scaffolding)
- Discovery / multi-host (aka stays the configured upstream)
- Portal UX enrichment (box art, grid, spatial focus)
- Local on-device play
- Frame-perfect reveal beyond the connection-established signal (true first-decoded-frame precision is a later refinement)
- Background / foreground-service korrid lifecycle

---

## Context & Research

### Relevant Code and Patterns

- `clients/android/app/src/main/java/com/limelight/Game.java` — connection callbacks exist at lines ~3281–3505: `stageStarting(stage)`, `stageComplete(stage)`, `stageFailed(stage, portFlags, errorCode)`, `connectionStarted()`, `connectionTerminated(errorCode)`. `SpinnerDialog spinner` (field ~160, shown ~527) is the native modal to suppress. `connectionStarted` is where Moonlight dismisses its spinner today — it is the sanctioned "frames imminent" signal.
- `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java` — WebViewAssetLoader setup for the synthetic `https://appassets.androidplatform.net` origin; the `window.__korriInput` push pattern; `startStream` treaty method that launches Game.
- `contracts/bridge/korri-native-bridge.ts` — treaty v3; the additive-or-bump versioning rule.
- `services/korrid/src/upstream.rs` — Effect-RPC envelope client with fixture-tested frame decoding; the pattern for adding proxied host operations.
- Legacy wire shapes (read from `legacy` branch): `app.session.status` (payload `{}` → union `SessionStatus{configured, mode, active?{launchId, mode, phase?, gameId?, title?}}` | `SessiondNotConfigured` | `HostUnavailable`) and `app.session.stop` (payload `{force?, confirmed?}` → `Stopped{launchId}` | `StopPending{...}` | more).
- `clients/portal/src/launchables/state.ts` — the state-ADT-at-the-seam pattern; `clients/portal/src/input/korri-native-adapter.ts` — window-event adapter pattern for shell→portal pushes.
- `services/korrid/android-smoke.sh` — device gate pattern (title check, console-error rejection, RPC probe).

### Institutional Learnings

- Device gates must validate the whole installed app, not one channel (slice-4 lesson: RPC-only smoke produced a false green while the WebView was broken).
- WebView exempts loopback http from mixed-content blocking but preflights it (CORS answered by korrid).
- A stale-buffer process intermittently reverts edits in this worktree; full-file writes and immediate verification are the mitigation.

---

## Key Technical Decisions

- **Overlay-in-activity, not deferred activity launch**: the video decoder requires the native surface to exist before connection, so the stream activity must start. Its visible content is a portal-origin WebView overlay covering the SurfaceView until reveal. Rejected: pre-connecting from a headless service (major Moonlight surgery).
- **Reveal on `connectionStarted`**: the same signal Moonlight uses to dismiss its spinner. Cheap, sanctioned, and close enough to first frame for this slice.
- **Pull-then-push overlay contract**: the overlay's JS pulls the current lifecycle snapshot on boot (bridge method), then receives pushed events. This eliminates the race where stages fire before the overlay's JS is ready.
- **Semantic lifecycle events in the treaty**: Kotlin maps Moonlight stage strings into a typed event union; raw native strings may ride along as display detail but the event types are the contract.
- **korrid proxies session status/stop**: the portal never talks to the host daemon; the brain grows `session.status` and `session.stop` proxied over the existing scaffolding wire.
- **Intent-extra gating**: only Korri-initiated streams (extra set by `startStream`) get the overlay and spinner suppression; stock Artemis entry points behave exactly as before (R7).

---

## Open Questions

### Resolved During Planning

- Where does pre-stream UI live? — Portal shows "preparing"; the stream activity's overlay takes over from `startStream` onward. Both surfaces are the same bundled portal app (query-param entry for the session screen).
- What is "ready for first frame"? — `connectionStarted` for this slice (see Key Technical Decisions).

### Deferred to Implementation

- Overlay dismissal aesthetics (instant vs. short fade): pick whatever reads as seamless on device.
- Whether the asset-loader/WebView setup is extracted to a shared helper or minimally duplicated in Game — decide when touching the code; prefer the smallest honest change to `Game.java`.
- Exact mapping of legacy stop-response variants (`StopPending`, force semantics) into the Korri-shaped outcome — decide against real daemon responses.
- How the portal's stop control is presented (banner action vs. menu) within the existing semantic-input vocabulary.

---

## Implementation Units

### U1. Step zero: merge slice 4 and record standing decisions

**Goal:** Slice 4 lands on main; AGENTS.md reflects the architecture that now exists.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- Fast-forward main to `feat/korrid-android-brain` (already rebased; re-run portal tests + cargo test as the merge gate)
- AGENTS.md standing decisions: services are Rust behind `contracts/generated/` (Typeshare, read-only); the portal's brain is always `http://127.0.0.1:<port>` korrid; the legacy Effect-RPC wire in `services/korrid/src/upstream.rs` is scaffolding that dies with the host rewrite; map section gains `services/korrid/`
- Continue slice-5 work on a fresh branch from main

**Test scenarios:**
- Test expectation: none — merge + docs; the merge gate is the existing check suite

**Verification:**
- `just korrid-check` green on main; AGENTS.md describes the Rust-brain architecture

---

### U2. Treaty v4: stream lifecycle events and session-screen entry

**Goal:** The bridge treaty defines how the shell narrates a stream session to web UI.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Modify: `contracts/bridge/korri-native-bridge.ts`

**Approach:**
- Bump `BRIDGE_VERSION` to 4
- Define a `StreamLifecycleEvent` tagged union: stage progress (semantic stage id + optional native detail string), connection established, stage/connection failure (tagged reason, error code), termination
- Define the overlay contract: a `KorriSession` injected surface with a snapshot pull (JSON-encoded current lifecycle state) plus the pushed-event window mechanism, mirroring the `__korriInput` pattern
- Document the session-screen entry (portal URL query param) as part of the treaty comment

**Patterns to follow:**
- Existing tagged-result and event documentation style in `contracts/bridge/korri-native-bridge.ts`

**Test scenarios:**
- Test expectation: none — type-only treaty file; portal typecheck enforces shape consumers

**Verification:**
- Portal typecheck passes against the new treaty; Kotlin mirror cites the same event names

---

### U3. korrid: session.status and session.stop proxied to the host

**Goal:** The brain answers "what is playing" and "stop it" without the portal touching the host wire.

**Requirements:** R4, R5

**Dependencies:** U1

**Files:**
- Modify: `services/korrid/src/lib.rs`
- Modify: `services/korrid/src/upstream.rs`
- Modify: `contracts/generated/korrid.ts` (regenerated)
- Test: `services/korrid/src/upstream.rs` (`#[cfg(test)]`)

**Approach:**
- Contracts: `app.session.status` → outcome with optional active session (game id, title, phase); `app.session.stop` → outcome (stopped/pending) — Korri-shaped, deliberately thinner than the legacy union
- Upstream: two new calls over the existing envelope (`app.session.status` payload `{}`; `app.session.stop` payload `{force?}`); lenient serde like the catalog decode
- Map `SessiondNotConfigured` / `HostUnavailable` variants into tagged `RpcFailure` codes

**Patterns to follow:**
- `catalog_snapshot` / `prepare_stream` in `services/korrid/src/upstream.rs` and their dispatch arms in `lib.rs`

**Test scenarios:**
- Happy path: fixture Success exit with an active session decodes to game id/title/phase
- Happy path: fixture with no `active` field decodes to "nothing playing"
- Edge case: `SessiondNotConfigured` and `HostUnavailable` variants map to distinct failure codes
- Happy path: stop fixture (`Stopped`) and pending fixture (`StopPending`) both decode to Korri-shaped outcomes
- Edge case: unknown extra fields in host responses are tolerated

**Verification:**
- `cargo test` green; live probe against aka returns a sane status; typeshare output committed and portal typecheck green

---

### U4. Shell: session overlay in the stream activity

**Goal:** Korri-launched streams show web lifecycle UI instead of the native spinner, revealed only when connected.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U2

**Files:**
- Modify: `clients/android/app/src/main/java/com/limelight/Game.java`
- Modify: `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java`

**Approach:**
- `startStream` adds a Korri-session intent extra; `Game` reads it and only then: suppress `SpinnerDialog`, attach a portal-origin overlay WebView (asset-loader origin, session-screen entry) above the stream surface
- Forward `stageStarting` / `stageComplete` / `stageFailed` / `connectionStarted` / `connectionTerminated` into the overlay as treaty v4 events; keep a latest-state snapshot for the overlay's boot-time pull (`KorriSession` surface)
- On `connectionStarted`: remove the overlay (stream is already rendering beneath)
- On failure/termination before reveal: overlay renders the tagged failure, then `finish()` returns to the portal (which sits one activity below)
- Non-Korri launches: zero behavior change

**Execution note:** Characterization-first mindset — `Game.java` is untested legacy; keep the diff insertion-only where possible and verify stock behavior on device before and after.

**Test scenarios:**
- Integration (device): Korri launch shows overlay stages, no spinner; stock shortcut launch still shows the stock spinner
- Error path (device): unreachable host fails a stage → overlay shows tagged failure → returns to portal
- Test expectation: no JVM unit tests — this unit's truth is on-device; the gates live in U6/U7

**Verification:**
- Device journey shows web lifecycle end-to-end with no native modal; failure path lands back in the portal

---

### U5. Portal: session screen and prepare handoff

**Goal:** The web side of the lifecycle — prepare feedback in the launcher, stage timeline in the overlay.

**Requirements:** R1, R2, R3

**Dependencies:** U2

**Files:**
- Create: `clients/portal/src/session/state.ts`
- Create: `clients/portal/src/session/SessionScreen.tsx`
- Create: `clients/portal/src/session/lifecycle-adapter.ts`
- Test: `clients/portal/src/session/state.test.ts`
- Modify: `clients/portal/src/main.tsx` (session-screen entry routing)
- Modify: `clients/portal/src/launchables/LaunchablesRoot.tsx`, `clients/portal/src/launchables/state.ts` (preparing state so there is no dead gap before the activity swap)

**Approach:**
- Session lifecycle ADT: boot-pull snapshot → stage progression → connected (terminal: overlay is dismissed natively) → failed (tagged reason, "back" affordance)
- Adapter converts `KorriSession` pull + pushed treaty events into ADT transitions (mirror `korri-native-adapter` structure)
- Launcher: confirm-on-game enters a visible "preparing" state; prepare failure returns to the existing notice mechanism

**Patterns to follow:**
- `clients/portal/src/launchables/state.ts` ADT + pure-function tests; `clients/portal/src/input/korri-native-adapter.ts`

**Test scenarios:**
- Happy path: snapshot pull seeds state; stage events advance the timeline in order
- Edge case: events arriving for stages already passed (replay/duplicate) do not regress the timeline
- Error path: stage failure produces a failed state carrying the tagged reason
- Happy path: launcher confirm enters preparing state; prepare Err restores selection with notice
- Edge case: session screen booted with no `KorriSession` surface (browser dev) renders a fixture timeline

**Verification:**
- `bun test` + typecheck green; browser dev can render the session screen standalone

---

### U6. Portal: now-playing and stop

**Goal:** After returning from a stream, the portal knows and controls what is playing.

**Requirements:** R4, R5

**Dependencies:** U3

**Files:**
- Modify: `clients/portal/src/korrid/client.ts` (status/stop operations, in-memory variants)
- Modify: `clients/portal/src/launchables/state.ts`, `clients/portal/src/launchables/LaunchablesRoot.tsx`, `clients/portal/src/launchables/LaunchablesList.tsx`
- Test: `clients/portal/src/launchables/state.test.ts`

**Approach:**
- Load/resume queries `session.status` alongside existing sources; an active session renders as a now-playing banner entry at the top of the list
- Confirm on the banner resumes the stream (existing Korri Stream attach path); the stop affordance uses the existing semantic-input vocabulary
- Stop outcomes fold into the notice mechanism; status query failure degrades silently (no banner) rather than blocking the list

**Patterns to follow:**
- Source-folding and notice degradation in `clients/portal/src/launchables/state.ts`

**Test scenarios:**
- Happy path: active session in status → banner entry first, selectable
- Happy path: no active session → no banner
- Edge case: status failure → list renders normally without banner
- Happy path: stop Ok removes the banner on next fold; Error path: stop failure surfaces as notice
- Integration: resume-from-banner routes to the same prepare-less attach path (no re-prepare)

**Verification:**
- `bun test` + typecheck green; device shows accurate now-playing after quitting a stream

---

### U7. Device exit gate

**Goal:** The slice's promise proven on hardware, including failure honesty.

**Requirements:** R1, R2, R3, R4, R5, R7

**Dependencies:** U4, U5, U6

**Files:**
- Modify: `services/korrid/android-smoke.sh` (extend automated gates where feasible)

**Approach:**
- Automated: existing gates plus a session-status probe through the on-device brain
- Human journey: pick game → web lifecycle throughout (native modal never visible) → frames appear → quit → portal shows now-playing truthfully → stop works → nothing playing
- Failure injection: stop `korrid.service` on aka → prepare fails with a web-rendered tagged error; restart it afterwards
- Stock-path regression: launch via stock Artemis PcView once — unchanged behavior

**Test scenarios:**
- Covers R1–R5, R7 as the on-device acceptance pass described above

**Verification:**
- All automated gates green; human journey confirmed; failure injection shows web error and clean recovery

---

## System-Wide Impact

- **Interaction graph:** `Game.java` callbacks now feed two consumers (native handling + overlay events); intent-extra gating isolates Korri behavior from stock flows
- **Error propagation:** host-daemon failures → korrid tagged codes → portal notices; native connection failures → treaty events → overlay failure state → `finish()` to portal
- **State lifecycle risks:** overlay/JS boot race (mitigated by pull-then-push); stale now-playing after external session changes (mitigated by re-query on resume)
- **API surface parity:** treaty v4 must be mirrored in Kotlin by hand — contract file wins disagreements
- **Unchanged invariants:** stock Artemis activities, pairing, and the slice-4 launch path (prepare → attach) remain behaviorally identical

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `Game.java` is large untested legacy; edits could break streaming | Insertion-only changes gated by intent extra; on-device stock-path regression check in U7 |
| Second WebView in the stream activity costs memory during streaming | Overlay is destroyed at reveal; measured on device in U7 |
| `connectionStarted` fires before overlay JS boots | Pull-then-push snapshot contract (U2/U4/U5) |
| Legacy session wire shapes drift from fixtures | Lenient serde + live probe against aka in U3 verification |
| Stale-buffer clobbering reverts edits mid-flight | Full-file writes, immediate verification, editor windows closed on this worktree |

---

## Sources & References

- Origin: this conversation (slice-5 selection + web-first pre-stream requirement); no separate requirements doc
- Related code: `clients/android/app/src/main/java/com/limelight/Game.java`, `services/korrid/src/upstream.rs`, `contracts/bridge/korri-native-bridge.ts`
- Prior slice: `work/items/active/20260729-web-session-lifecycle/` follows slice 4 (`feat/korrid-android-brain`)
