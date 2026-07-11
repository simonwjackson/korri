---
title: "feat: Default game freeze on stream disconnect, lid close, and chord modal"
type: feat
status: completed
date: 2026-07-10
origin: work/items/active/01KX76A6PV6AKPYPVRFK62S4DY-default-game-freeze/item.md
verify_command: "bun test product/services/device product/platform/library product/apps/portal/api/session"
---

# feat: Default game freeze on stream disconnect, lid close, and chord modal

## Summary

Make freeze the default, seamless behavior around the sessiond freeze primitive shipped in `ee2bf514`: a host-side Sunshine watcher freezes the active managed launch when the Moonlight client disconnects and thaws it on reconnect; bandai's fakesuspend path freezes (local game) or best-effort remote-freezes (host game via `controlUrl`) instead of terminating; and the chord-tap overlay modal gains a single "Freeze game"/"Resume game" toggle that routes to wherever the game lives. Freeze/thaw are exposed as Effect RPC commands so remote surfaces share one contract, and the stream launch path learns to thaw-and-reattach to a frozen host launch so the wake flow works end to end.

---

## Problem Frame

When a Moonlight stream drops unintentionally (network cut) or the player closes the handheld lid, the host game today either keeps burning full CPU/GPU (unnoticed disconnect) or is terminated with state loss (fakesuspend's stream path). There is also no manual pause affordance in the chord modal. The freeze primitive exists in sessiond but nothing invokes it by default. Device validation on aka (Skate 3 / RPCS3 under gamescope) proved the mechanism: SIGSTOP process group → 0% CPU, clean resume after 30s+, thaw-before-terminate required and working.

---

## Requirements

- R1. The host game freezes automatically when the Moonlight client disconnects unintentionally (network drop), within a bounded detection window.
- R2. The host game thaws automatically when a Moonlight client reconnects, before gameplay frames/input are expected.
- R3. On client lid close (fakesuspend enter), the active game freezes by default: local games freeze via local sessiond; stream sessions send a best-effort remote freeze of the **host game**, then terminate the **local Moonlight client** as today (it cannot survive suspend). When the host is unreachable, behavior degrades to exactly today's terminate-only path.
- R4. On fakesuspend exit (lid open), a locally frozen game thaws automatically.
- R5. The chord-**tap** overlay modal offers a single "Freeze game" option (toggling to "Resume game" when frozen) that behaves identically for local and stream sessions — no label disambiguation.
- R6. Chord-**hold** (kill after 2s) behavior is unchanged.
- R7. Freeze/thaw are exposed as Effect RPC commands on the server RPC group so remote clients (overlay via `controlUrl`, fakesuspend, future surfaces) share one command contract with `_tag`-discriminated outcomes.
- R8. All new behavior is capability-gated on `launchFreeze`; older daemons and unsupported launches degrade gracefully (option hidden or structured `unsupported` outcome, never a hard error).
- R9. Re-tapping a stream game after lid open reconnects to the frozen host launch (thaw + stream reattach) instead of failing with `session-busy` — the wake flow in the origin acceptance examples must work end to end.

**Origin acceptance examples** (from `item.md`): hard network cut mid-stream → host game frozen (state `T`, ~0% CPU) within a bounded window; reconnect thaws before frames resume; lid-open → stream relaunch → host thaw → gameplay resumes from frozen state.

---

## Scope Boundaries

- No cgroup v2 / systemd-scope freeze hardening — stays parked as `01KX6M0HJK6AJCF7JC9XVKAZBH`. All new code treats sessiond freeze/thaw as the abstraction boundary and embeds no SIGSTOP assumptions.
- No emulator save states, CRIU, or cross-device resume.
- No attempt to keep online multiplayer server sessions alive while frozen (inherent ~10–15s server timeout — accepted limitation).
- No dedicated inputd freeze chord action — the modal is the only manual entry point for now.
- No renderer/portal UI beyond the overlay modal (freeze state already flows through `app.server.status` phase for future UI).
- No automatic stream relaunch on lid open — the user re-taps the game; the re-tap resolves through U7's thaw-and-reattach path (and the host watcher's reconnect-thaw as backstop). "Automatic" here means Korri does not initiate the stream itself on wake.

### Deferred to Follow-Up Work

- Deploy to aka: push this repo, bump the `korri` input in the `mountainous` flake, rebuild aka. Operational prerequisite for on-device verification of U4–U6; not a unit in this repo.
- Long-freeze soak validation (≥1h frozen; GPU fence / PipeWire recovery) — on-device follow-up after deploy, tracked in `item.md` acceptance.

---

## Context & Research

### Relevant Code and Patterns

- `product/services/device/sessiond.ts` — freeze/thaw endpoints, `launchFreeze` capability, thaw-before-terminate guard (shipped `ee2bf514`).
- `product/platform/library/sessiond-managed-launch-client.ts` — `freezeSessiondManagedLaunch` / `thawSessiondManagedLaunch` helpers.
- `product/apps/portal/api/session/stop.rpc.ts` + `stop.rpc-handler.ts` — the RPC shape to mirror (payload/response schema classes, `KorriControl` delegation, registration in `product/apps/portal/api/server/rpc-group.ts` and `rpc-server.ts`).
- `product/services/device/overlay-remote-stop.ts` — `rpcUrlForControlUrl` + Effect RPC frame POST pattern for remote host commands.
- `product/services/device/overlay-menu.ts`, `overlay-orchestrator.ts`, `overlay-wiring.ts`, `overlay-session-state.ts` — chord-tap menu, actions routing, session probe.
- `product/services/device/fakesuspend-controller.ts` — `coordinateActiveSession()` currently terminates stream launches; `isStreamActive()` annotation detector.
- `product/services/device/sessiond-source-machine.ts` — source-machine role deps seam for the Sunshine watcher.
- `product/platform/control/korri-control.ts` / `korri-control-live.ts` — `KorriControl` service the RPC handlers delegate to.

### Institutional Learnings

- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md` — protocol evolution rules; capability flags over versioning.
- `docs/solutions/architecture-patterns/physical-host-foreground-lifecycle-truth-is-sessiond-2026-05-29.md` — sessiond is lifecycle truth; renderer state flows via `app.server.status`; discriminated rejection sources.
- `docs/solutions/runtime-errors/sessiond-sse-stream-killed-by-bun-idle-timeout-2026-05-27.md` — observability lifetime ≠ session lifetime; the Sunshine watcher must not treat log-stream loss as session death; bounded reconnect loops.
- `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md` — ACK ≠ applied; UI state comes from readback, not command response.
- `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` — Sunshine is a **user** service; disconnect signals are stream-generic, not game-specific.

### External References

- Session evidence: Sunshine log on aka emits `CLIENT DISCONNECTED` / `New streaming session started [active sessions: N]` (`~/.config/sunshine/sunshine.log`).
- Device validation on aka: SIGSTOP/SIGCONT of the Skate 3 gamescope process group — frozen `T` state at 0% CPU, clean 30s+ resume, SIGTERM inert while frozen until SIGCONT.

---

## Key Technical Decisions

- **One host-side watcher covers both auto-freeze scenarios**: a network-dropped client cannot signal, so the host must self-detect. Sunshine's log is the detection source (signal verified on aka); the watcher tails it and drives local sessiond freeze/thaw.
- **Freeze immediately on disconnect (small configurable debounce)**: freezing on a brief blip is harmless because reconnect-thaw is instant and both operations are idempotent (`already-frozen`/`already-thawed`).
- **RPC tags `app.session.freeze` / `app.session.thaw`** mirroring `app.session.stop` (optional `launchId`; no-launchId means "the active launch"), registered on the **server** RPC group so `controlUrl` clients can reach them. Outcomes are a `_tag` union (Frozen/Thawed, AlreadyFrozen/AlreadyThawed, NothingActive, Unsupported, SessiondNotConfigured, HostUnavailable) — never a bare error.
- **Seamless overlay toggle routes by session kind under one label**: local sessions call local sessiond via the managed-launch client; stream sessions call the host's `app.session.freeze` via `controlUrl` — the menu option is identical either way (R5).
- **Fakesuspend stops terminating the host game; the local Moonlight client is still terminated in all cases**: local game → local freeze (realizes the deferred U3 gap in `01KX0B4ND41F4K3SUSP3ND000`); stream → best-effort remote freeze of the host game via `controlUrl`, then terminate the local Moonlight launch as today. Remote failure degrades to today's terminate-only behavior with the degradation logged. The *host game* is what freeze preserves; the client process never survives suspend.
- **Menu shows frozen state from the cached session probe** (last poll), accepting a benign race: a stale toggle resolves gracefully through idempotent responses. For **stream** sessions the frozen state cannot come from the local `active.phase` (that describes the Moonlight client, not the host game) — the probe reads host state via `controlUrl` (bounded, cached `app.session.status`) and reconciles with the last remote freeze/thaw outcome.
- **Local new-launch rejection while frozen is unchanged; stream re-entry gets an explicit thaw-and-reattach path**: frozen keeps sessiond `mode: "game"` and non-home modes still reject *new* launches (`session-busy`). U7 adds the one deliberate exception: a stream launch request targeting a host whose active launch is frozen routes to thaw + stream reattach instead of a new managed launch, so the lid-open wake flow works (R9).
- **No Gamescope naming in platform/RPC code**: freeze is a sessiond lifecycle contract; process-signal mechanics stay behind the launcher handle (per plugin-boundary learnings).

---

## Open Questions

### Resolved During Planning

- Where does disconnect detection live? → Host-side Sunshine log watcher owned by source-machine sessiond wiring; log signal verified present on aka.
- Which RPC group? → `serverRpcGroup` (reachable via `controlUrl`), not the portal-frontend group.
- Does the chord hold path change? → No; hold-kill (2s) is untouched (R6, matches `01KWMNX6R2N1BNCY124TWH94XF` constraint).

### Deferred to Implementation

- Exact Sunshine log line-matching tolerance (versioned wording variants): resolve against the deployed `sunshine-korri` build's log output during U5.
- Debounce default (0–5s) for disconnect-freeze: pick after observing ungraceful-disconnect detection latency on aka.
- Whether the remote freeze call from fakesuspend needs a shorter timeout than the 10s remote-stop default (lid-close races network teardown): tune during U4 device validation.

---

## Implementation Units

### U1. Effect RPC freeze/thaw commands

**Goal:** Expose freeze/thaw as first-class RPC commands so remote surfaces share one contract.

**Requirements:** R7, R8

**Dependencies:** None (builds on shipped sessiond endpoints)

**Files:**
- Create: `product/apps/portal/api/session/freeze.rpc.ts`
- Create: `product/apps/portal/api/session/freeze.rpc-handler.ts`
- Create: `product/apps/portal/api/session/thaw.rpc.ts`
- Create: `product/apps/portal/api/session/thaw.rpc-handler.ts`
- Modify: `product/apps/portal/api/server/rpc-group.ts`, `product/apps/portal/api/server/rpc-server.ts`
- Modify: `product/platform/control/korri-control.ts`, `product/platform/control/korri-control-live.ts`
- Test: `product/apps/portal/api/session/session.rpc-handler.test.ts`, `product/platform/control/korri-control-live.test.ts`

**Approach:**
- Mirror the stop handler end to end: schema classes with `_tag`-discriminated response union, handler delegating to new `KorriControl.freezeSession` / `thawSession`, live implementation delegating to the sessiond managed-launch client.
- Optional `launchId` payload; absent means "the active launch" (stop-handler semantics).
- Gate on `capabilities.launchFreeze` from sessiond status: absent capability → structured `Unsupported` outcome.

**Patterns to follow:** `stop.rpc.ts` / `stop.rpc-handler.ts`; `KorriControl` layer-override test pattern in `session.rpc-handler.test.ts`.

**Test scenarios:**
- Happy path: freeze with no `launchId` freezes the active launch → `Frozen` with launchId; thaw mirror.
- Happy path: explicit `launchId` passes through to the client helper.
- Edge: freeze when already frozen → `AlreadyFrozen`; thaw when running → `AlreadyThawed`.
- Error: no active launch → `NothingActive`; sessiond not configured → `SessiondNotConfigured`; sessiond unreachable → `HostUnavailable`; capability absent → `Unsupported`.

**Verification:** Handler tests cover every response variant; RPC group registration compiles and serves the new tags.

---

### U2. Remote freeze/thaw client helper

**Goal:** A device-side helper that posts `app.session.freeze`/`app.session.thaw` to a stream host's `controlUrl`, shared by the overlay and fakesuspend.

**Requirements:** R3, R5, R7

**Dependencies:** U1 (tag/payload contract)

**Files:**
- Create: `product/services/device/overlay-remote-freeze.ts`
- Test: `product/services/device/overlay-remote-freeze.test.ts`

**Approach:**
- Follow `overlay-remote-stop.ts` transport shape: reuse/extract `rpcUrlForControlUrl`, Effect RPC frame POST, `Exit` parsing, bounded timeout, structured logging on failure.
- Preserve the host's typed outcome instead of collapsing success: return a discriminated result carrying the U1 response variant (`applied`, `already-frozen`/`already-thawed`, `unsupported`, `nothing-active`) plus transport-level cases (`skipped-no-control-url`, `host-unavailable`/`failed`) so callers implement their own fallback policy (R8).

**Patterns to follow:** `overlay-remote-stop.ts` + its test's recorded-fetch pattern.

**Test scenarios:**
- Happy path: posts correct frame to `{controlUrl}/api/rpc`, parses `Success` exit with `Frozen` outcome → `applied`.
- Edge: host returns `AlreadyFrozen`/`AlreadyThawed` → corresponding non-error variant, distinguishable from `applied`.
- Edge: host returns `Unsupported` / `NothingActive` → preserved as typed variants, not collapsed into `applied` or `failed`.
- Edge: missing/blank `controlUrl` → `skipped-no-control-url`, no fetch.
- Error: fetch rejects / non-Success exit / timeout → `host-unavailable`/`failed` with logged context.

**Verification:** Tests pass; helper is consumed by U3 and U4 without duplicating transport code.

---

### U3. Seamless overlay Freeze/Resume toggle

**Goal:** The chord-tap modal offers one "Freeze game"/"Resume game" toggle that works identically for local and stream sessions; hold-kill unchanged.

**Requirements:** R5, R6, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `product/services/device/overlay-session-state.ts` (add `isFrozen()`; cache `active.phase` and `launchFreeze` capability on refresh)
- Modify: `product/services/device/overlay-session-state-live.ts`
- Modify: `product/services/device/overlay-menu.ts` (`overlayMenuOptionsFor(kind, { frozen, freezeAvailable })` inserts `freeze-game`/`resume-game` before `keep-playing`)
- Modify: `product/services/device/overlay-orchestrator.ts` (`OverlayActions.freezeGame`/`resumeGame`; `performChoice` routing; `openMenu` reads frozen state)
- Modify: `product/services/device/overlay-wiring.ts` (route by session kind: local → sessiond client freeze/thaw; stream → U2 remote helper)
- Test: `product/services/device/overlay-menu.test.ts`, `overlay-orchestrator.test.ts`, `overlay-session-state.test.ts`

**Approach:**
- One option id pair (`freeze-game`/`resume-game`) with identical labels regardless of session kind — the wiring layer, not the menu, decides local vs remote routing.
- Frozen-state source differs by kind: local → cached `active.phase` from the local sessiond poll; stream → host state via `controlUrl` (bounded, cached `app.session.status` read on probe refresh) reconciled with the most recent remote freeze/thaw outcome from U2.
- Hide the option when `launchFreeze` capability is absent (local). For stream sessions show it; a host `Unsupported`/failure outcome is logged through the existing overlay action path — no new renderer/portal error surface in this slice.
- Default menu selection stays `keep-playing`; `"fired"` (hold) path untouched.

**Patterns to follow:** existing `close-game` option flow (stream-only option routed through `closeRemoteGame`).

**Test scenarios:**
- Happy path: local session not frozen → menu contains `freeze-game`; choosing it calls the local freeze action; menu shows `resume-game` on next open when probe reports frozen.
- Happy path: stream session → same option ids/labels; choosing routes through the remote helper.
- Happy path: stream session frozen on host → probe reports frozen from host status/last outcome → menu shows `resume-game`.
- Edge: `launchFreeze` capability absent on local → option omitted.
- Edge: host status probe fails for a stream session → frozen state falls back to last known outcome; menu still renders without error UI.
- Edge: stale probe (frozen changed between poll and tap) → action resolves via idempotent `already-*` response without error UI.
- Integration: chord hold (`"fired"`) still force-quits and never freezes.

**Verification:** Menu snapshots and orchestrator routing tests pass; hold-path tests unchanged and green.

---

### U4. Fakesuspend freezes instead of terminating

**Goal:** Lid close freezes the game by default; lid open thaws local games.

**Requirements:** R3, R4, R8

**Dependencies:** U1, U2

**Files:**
- Modify: `product/services/device/fakesuspend-controller.ts` (`coordinateActiveSession()` on enter; new thaw coordination on exit; injectable remote-freeze dep)
- Test: `product/services/device/fakesuspend-controller.test.ts`

**Approach:**
- Enter, local game: `freezeSessiondManagedLaunch` on the active launch (realizes the deferred local-game gap from `01KX0B4ND41F4K3SUSP3ND000` U3).
- Enter, stream: extract `controlUrl` from `@korri:stream` annotations → best-effort remote freeze via U2 → then terminate the **local Moonlight launch** as today (the client process does not survive suspend); if the remote freeze fails or `controlUrl` is absent, log the degradation and keep today's terminate-only behavior (deliberate handling per origin R7 of the fakesuspend refactor).
- Exit, local game: if the active launch is frozen, thaw it.
- Keep all new deps injectable (`freezeRemoteGame`, sessiond client options) for tests.

**Execution note:** Test-first — extend the existing fakesuspend controller test harness with stream-metadata and frozen-state cases before changing the coordination logic.

**Patterns to follow:** existing `coordinateActiveSession` + `isStreamActive`; injected-dependency test style already in `fakesuspend-controller.test.ts`.

**Test scenarios:**
- Happy path: enter with local game → local freeze called, no terminate.
- Happy path: enter with stream → remote freeze called with extracted `controlUrl`, then local Moonlight launch terminated.
- Error path: remote freeze fails → local terminate still happens, degradation logged.
- Edge: no active launch → no coordination calls.
- Edge: `controlUrl` absent on stream metadata → skip remote freeze, terminate as today.
- Happy path: exit with frozen local game → thaw called; exit with nothing frozen → no thaw call.

**Verification:** Controller tests cover enter/exit matrices; no behavior change for the no-active-session path.

---

### U5. Sunshine stream watcher (host-side auto freeze/thaw)

**Goal:** On the source machine, freeze the active managed launch when the Moonlight client disconnects and thaw it when a client reconnects.

**Requirements:** R1, R2, R8

**Dependencies:** U1 conceptually (shared vocabulary), but calls local sessiond directly via the managed-launch client — implementable in parallel with U2–U4.

**Files:**
- Create: `product/services/device/sunshine-stream-watcher.ts`
- Modify: `product/services/device/sessiond-source-machine.ts` (wire watcher into source-machine role deps, active only while a managed launch is live)
- Test: `product/services/device/sunshine-stream-watcher.test.ts`

**Approach:**
- Tail the Sunshine log through an injectable line source; match disconnect (`CLIENT DISCONNECTED`) and reconnect (`New streaming session started`) signals; drive `freezeSessiondManagedLaunch`/`thawSessiondManagedLaunch` against the local socket.
- Watcher lifetime is decoupled from stream transport: log-stream loss triggers a bounded reconnect loop and is never interpreted as session death (per the SSE idle-timeout learning).
- Small configurable debounce before freeze; thaw fires immediately on reconnect signal.
- Signals are stream-generic (one stable "Korri Stream" app): the watcher freezes/thaws "the active launch," it does not try to identify the game.
- Sunshine is a **user** service; any state probing uses user-scope paths (log file under the user home as verified on aka).

**Execution note:** Test-first with a scripted fake log-line source (disconnect, reconnect, interleavings, log rotation/stream loss).

**Patterns to follow:** injectable-dependency device-service style (`fakesuspend-controller.ts`); reconnect-loop posture from `sessiond-managed-launch-event-observer.ts`.

**Test scenarios:**
- Happy path: disconnect line → freeze called after debounce; reconnect line → thaw called.
- Edge: reconnect arrives within the debounce window → no freeze issued.
- Edge: duplicate disconnect lines → single freeze (idempotent client responses tolerated).
- Error path: sessiond client returns `unsupported`/`not-found` → logged, watcher keeps running.
- Error path: log stream ends unexpectedly → bounded re-open attempts; no freeze/thaw side effects from stream loss itself.
- Integration: watcher only active while a managed launch exists; no sessiond calls when idle.

**Verification:** Watcher tests cover the signal matrix; source-machine role wiring starts/stops the watcher with launch lifecycle.

---

### U7. Stream re-entry to a frozen host launch

**Goal:** Re-tapping a stream game after lid open reconnects to the frozen host launch instead of failing with `session-busy`.

**Requirements:** R9, R2

**Dependencies:** U1, U5

**Files:**
- Modify: `product/apps/portal/api/stream/prepare.rpc-handler.ts` (or the host-side seam implementation reveals as authoritative — see Approach)
- Modify: `product/services/device/game-stream-runner.ts` (resume-instead-of-spawn branch when the active launch is frozen)
- Test: `product/apps/portal/api/stream/prepare.rpc-handler.test.ts` (or colocated), `product/services/device/game-stream-runner.test.ts`

**Approach:**
- Today the remote launch flow always enqueues a new launch intent, and sessiond rejects managed launches unless it is `home` — so a frozen host launch would dead-end the wake flow. Add a resume path: when a stream prepare/launch request targets a host whose active managed launch is frozen **and matches the requested game**, thaw the launch and reattach the stream rather than spawning a new one.
- When the frozen launch does **not** match the requested game, keep today's rejection (`session-busy`-shaped, discriminated source) — freezing must not silently swap games.
- The exact seam split between the prepare handler and game-stream-runner is deferred to implementation; the contract is: frozen + same game → thaw + reattach; frozen + different game → structured rejection.
- U5's reconnect-thaw remains the backstop when Sunshine resumes the paused session without a new prepare round-trip; this unit covers the path where the client goes through the normal launch entrypoint.

**Execution note:** Test-first — encode the frozen-same-game, frozen-different-game, and not-frozen cases through the prepare/runner public contract before changing routing.

**Patterns to follow:** discriminated rejection sources in the launch pipeline (`Accepted | PreflightRejected | DaemonRejected | HostUnavailable`); existing prepare → runner intent flow.

**Test scenarios:**
- Happy path: prepare/launch request for the game currently frozen on the host → thaw invoked, stream reattaches, no new managed launch spawned.
- Edge: request for a different game while one is frozen → structured busy rejection, frozen launch untouched.
- Edge: request when nothing is frozen → today's behavior unchanged (new launch intent).
- Error path: thaw fails (`not-found`/`unsupported`) → structured rejection surfaces, no orphaned intent.
- Integration: full wake sequence — frozen host launch + fresh client prepare → thaw → stream session starts. Covers the origin wake-flow acceptance example.

**Verification:** Wake-flow tests pass at the prepare/runner contract level; existing not-frozen launch tests unchanged.

---

### U6. NixOS wiring and system checks for the watcher

**Goal:** The watcher is configured/enabled on source-machine images with the Sunshine log path and sessiond socket wired through the module system.

**Requirements:** R1, R2

**Dependencies:** U5

**Files:**
- Modify: `product/systems/nixos/modules/korri-daemon.nix` (or the game-stream module section owning `korri-sunshine`) — watcher env/config on the sessiond source-machine service
- Modify: `tools/testing/nix/korri-daemon-module-check.nix` and/or `tools/testing/nix/korri-source-machine-image-check.nix`
- Test: Nix checks above (module-eval assertions)

**Approach:**
- Prefer env-config on the existing `korri-sessiond` source-machine service over a new systemd unit (the watcher lives inside sessiond wiring per U5).
- Nix checks assert the wiring contract (env present when `gameStream.enable`, absent otherwise) — put the test where the source of truth lives: module eval in Nix, watcher behavior in TS.

**Patterns to follow:** existing `KORRI_GAME_STREAM_STATUS_PATH` env wiring; existing daemon module checks.

**Test scenarios:**
- Nix check: source-machine config with `gameStream.enable = true` exposes watcher config to sessiond; kiosk config does not.
- Test expectation for TS: none — behavior covered in U5; this unit is wiring only.

**Verification:** `nix flake check` (or the targeted check derivations) passes with the new assertions.

---

## System-Wide Impact

- **Interaction graph:** overlay orchestrator → wiring → (local sessiond client | remote RPC); fakesuspend → sessiond client + remote helper; source-machine role → watcher → sessiond client; RPC server → KorriControl → sessiond client. All freeze mutations converge on sessiond's two endpoints — one authority (lifecycle-truth doc).
- **Error propagation:** every layer returns discriminated outcomes; remote failures degrade to logged fallbacks (fakesuspend → terminate; overlay → structured failure), never silent drops or hard errors.
- **State lifecycle risks:** frozen launches hold `mode: "game"`; terminate-thaws-first is already enforced in sessiond; watcher debounce prevents freeze/thaw flapping on reconnect races; U7's thaw-and-reattach is the only sanctioned re-entry into a frozen launch — same-game matching prevents silent game swaps.
- **API surface parity:** overlay, fakesuspend, RPC, and the watcher all consume the same sessiond contract — no copy-through ladders (R7).
- **Integration coverage:** orchestrator hold-path regression tests; fakesuspend enter/exit matrices; watcher signal matrix with fake log source.
- **Unchanged invariants:** chord hold-kill; launch rejection while non-home (covers frozen); fakesuspend's launch-guard marker; sessiond protocol strict-decode and additive-only evolution; existing terminate flows.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sunshine's ungraceful-disconnect detection latency unknown (keepalive timeout) | Measure on aka during U5 device validation; debounce is configurable; worst case bounds the "game still running" window, not correctness |
| Sunshine log wording changes across `sunshine-korri` bumps | Matching tolerant to surrounding text; watcher failure is observable (logged) and non-fatal; log-format assertion noted in Nix check comments |
| Lid-close remote freeze races network teardown | Best-effort with short timeout + terminate fallback keeps today's behavior as the floor |
| Frozen game held for hours (GPU fence / audio recovery) | Known-unknown from research; 30s validated on aka; soak test deferred to on-device follow-up (item.md acceptance) |
| Remote host runs an older build without freeze RPC | `controlUrl` call fails structurally → fallback paths (terminate / logged failure); capability gating on local paths |
| Deploy chain (aka runs pinned `korri` input) | Deferred-to-follow-up deploy step called out; unit-level verification is device-independent |
| Sunshine session semantics on reconnect (paused-session resume vs new prepare round-trip) vary by client behavior | U5 thaws on the Sunshine signal; U7 covers the normal launch entrypoint; both paths are idempotent against each other (`already-thawed`) |

---

## Documentation / Operational Notes

- On-device validation sequence after deploy (mirrors `item.md` acceptance): launch Skate 3 via stream → hard-cut network → confirm frozen (`phase: "frozen"`, ~0% CPU) → reconnect → confirm thaw; lid close/open cycle on bandai for both local and stream sessions.
- The fakesuspend behavior change (terminate → freeze) alters what users observe on lid open for streams: the host game is paused, not gone. Note in any operator-facing changelog.
- `01KX75XAWDVGPD7XW4V7MJ55EK` is absorbed by U1 — remove from the backlog when this plan ships.

---

## Sources & References

- **Origin document:** [work/items/active/01KX76A6PV6AKPYPVRFK62S4DY-default-game-freeze/item.md](item.md)
- Shipped primitive: commit `ee2bf514` (`feat(sessiond): add managed launch freeze cycle`)
- Prior work constraints: `work/items/active/01KWMNX6R2N1BNCY124TWH94XF-stream-game-lifecycle-chord/` (hold-kill unchanged; freeze was an explicit deferred non-goal now being picked up), `work/items/active/01KX0B4ND41F4K3SUSP3ND000-refactor-guest-owned-fake-suspend/` (U3 deferred local-game pause primitive; R7 deliberate stream handling)
- Related parked item: `work/items/parking-lot/01KX6M0HJK6AJCF7JC9XVKAZBH-upgrade-managed-launch-freeze-to-cgroup-v2-systemd-scopes.md`
- Institutional learnings: see Context & Research
