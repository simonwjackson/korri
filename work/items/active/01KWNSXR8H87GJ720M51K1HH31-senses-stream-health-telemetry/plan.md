---
title: "Senses (Layer 4): Surface numeric stream-health telemetry for the adaptive controller"
type: feat
status: active
date: 2026-07-03
verify_command: "bun test product/platform/stream product/plugins/moonlight product/surfaces/terminal/korri-cli && nix eval --raw .#checks.x86_64-linux.korri-moonlight-control-protocol-patch.drvPath"
---

# Senses (Layer 4): Surface numeric stream-health telemetry for the adaptive controller

## Summary

Expose the numeric network + decode health the Moonlight client already computes
(RTT/jitter, loss, delivered-vs-requested bitrate/FPS, decode/queue health,
first-frame timing) as a sampled `quality.sample` event and enriched snapshot
over the existing local-control channel, then normalize it in a
streamer-agnostic platform module into a rolling window the future controller
(Layer 5) reads. Sensing only — no adaptation decisions. Make the numbers
observable today through `korri stream show`.

---

## Problem Frame

The adaptive vision needs the system to continuously compute the best mix of
bitrate/FPS/resolution for live network conditions. Today the only "sense" the
stack exposes is a coarse four-value flag — `streamQuality.connection` =
`unknown|poor|okay|good` — and the snapshot even hardcodes it to `"unknown"`
(`0006-add-local-control-observability-ipc.patch`, `snapshot_locked`). A prior
env-gated spike (`0005d`) reacted to that blunt flag directly. Continuous math
cannot run on `poor|okay`; it needs real numbers. The Moonlight client already
computes them (moonlight-common-c `LiGetEstimatedRttInfo`; the decode path
tracks received/dropped frames and timing) — they are simply never surfaced.
Layer 4 exposes that decode-truth; it does not act on it.

---

## Requirements

- R1. Emit a structured, numeric stream-health sample over the local-control channel at a fixed cadence, sourced from the Moonlight client's own estimates (no external pinger/iperf/second process).
- R2. The sample carries the full sensor set: RTT and jitter (RTT variance), loss, delivered vs requested bitrate, delivered vs requested FPS, frames dropped, decode time, queue/buffer depth, and first-frame timing.
- R3. Include the latest sample in the `state.snapshot` `streamQuality` block, and wire the coarse `connection` field to the real client status (not hardcoded `"unknown"`).
- R4. Normalize samples in a streamer-agnostic platform module into a bounded rolling window with derived summaries (mean/variance/trend, delivered/requested ratios, loss rate) that Layer 5 can read.
- R5. Never silent: a gap in samples (stream stalled or client gone) surfaces as an explicit `stale` state, not a frozen last-good reading.
- R6. `korri stream show` renders the latest numeric health so it is observable and verifiable without Layer 5.
- R7. Layer 4 makes no adaptation decisions and changes no runtime settings.

---

## Scope Boundaries

- No adaptation/decision logic — that is Layer 5 (the controller). This plan ends at "a clean, normalized, rolling stream of numbers plus observability."
- No external measurement (no ping/iperf/bandwidth-probe process). Only the client's in-band decode-truth.
- No GUI/portal surfacing — CLI `korri stream show` is the only surface here (GUI is Layer 6).
- No new codec/host behavior; H.264 path only, consistent with the rest of the stack.

### Deferred to Follow-Up Work

- Perceptual/visual quality scoring (SSIM-like) beyond mechanical decode stats: separate follow-up if the controller needs it.
- Sunshine-side (host) health (encode time, capture backpressure): a later host-side senses pass; this plan sources from the Moonlight client.

---

## Context & Research

### Relevant Code and Patterns

- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0006-add-local-control-observability-ipc.patch` — the control-plane thread (`moonlight_local_control_thread`, 250 ms poll loop), mutex-guarded `control` struct, `moonlight_local_control_event_locked(name)` + `moonlight_local_control_write_json`, and `moonlight_local_control_snapshot_locked()` that builds `streamQuality`. This is the seam the sampler extends.
- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch` — hooks `connection_status_update(int status)` (the coarse CONN_STATUS source). Reuse the same hook to populate the real `connection` field; do not reuse its env-gated adaptation (that is Layer 5).
- `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0009-*` / `0010-*` — decoder reopen on output-size change; the first-frame timing signal (and the U-B decode-confirm work) share this seam.
- `product/plugins/moonlight/src/moonlight-control-protocol.ts` — `StreamQualitySnapshot`, `ConnectionQuality` literal, the `quality.connection` event, and the additive-object snapshot types. New sample schema + event go here.
- `product/plugins/moonlight/src/moonlight-control-client.ts` — `onEvent` delivery; the client already surfaces control events.
- `product/platform/stream/runtime-recovery.ts` and `runtime-recovery-supervisor.ts` — the layering pattern to mirror: platform code owns local types, imports no Moonlight plugin module, exposes a streamer-agnostic port, and is fed by a thin adapter at the edge.
- `product/surfaces/terminal/korri-cli/stream-quality.ts` (+ `.test.ts`) — `formatState`/`runStreamShow`; extend to render the health block.
- `tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix` — grep invariants + compile gate for the moonlight patches.

### Institutional Learnings

- Native concurrency/hardware-timing code must not ship "blind" — anything whose real values only appear on a running device is a verification gate, not a green checkmark (established during U-B).
- Platform must stay streamer-agnostic: `runtime-recovery.ts` dropped its `moonlight-control-protocol` import after the plugin refactor relocated it. The health normalizer must own its local types.
- `se_atomic_commit` stages the whole index in this shared tree — verify `git diff --cached --name-only` is empty before each commit.

### External References

- moonlight-common-c `Limelight.h`: `LiGetEstimatedRttInfo(uint32_t* rtt, uint32_t* variance)` returns availability + RTT/variance; connection status arrives via the `ConnListenerConnectionStatusUpdate` callback (CONN_STATUS_OKAY / CONN_STATUS_POOR). Frame accounting (received/dropped/network-dropped) is maintained by the client's decode submit path.

---

## Key Technical Decisions

- **Sample on the existing control-thread cadence, emit as a `quality.sample` event.** Reuse `0006`'s poll loop and event plumbing rather than adding a new thread; assemble a sample every fixed interval (target ~1 s; exact constant tuned on device). Rationale: fewer moving parts, honors "in-client truth," no external poller.
- **A mutex-guarded `moonlight_health_stats` struct bridges decode thread → control thread.** The decode/video path writes counters; the control thread reads under the existing `control.lock` (or a dedicated lock). Rationale: the numbers live on the decode thread; this is the minimal safe cross-thread bridge. Cross-thread timing is the device-gated risk.
- **Platform normalizer owns local types and a bounded ring buffer.** No Moonlight import; a `StreamHealthSample` input type is redeclared locally (mirroring `runtime-recovery.ts`). Rationale: layering rule.
- **Never-silent staleness is derived, not pushed.** The normalizer marks `stale` when no sample has arrived within a staleness window, so a dead stream can't masquerade as healthy. Rationale: R5.
- **Snapshot carries the latest sample; the event carries the stream.** `korri stream show` reads the snapshot (one-shot); a live consumer (Layer 5, later) subscribes to `quality.sample`. Rationale: `show` stays a simple readback.

---

## Open Questions

### Resolved During Planning

- Which signals in the first cut? Full sensor set (user decision): RTT+jitter, loss, delivered-vs-requested bitrate/FPS, frames dropped, decode time, queue depth, first-frame timing.
- External vs in-client measurement? In-client decode-truth only (user constraint).
- Does Layer 4 make decisions? No — sensing only; Layer 5 owns policy.

### Deferred to Implementation

- Exact sample cadence and the first-frame wait window — device-tuned constants.
- Whether every decode counter is cleanly reachable from moonlight-embedded's decode path or needs a small shared-stats shim — confirmed only when compiling against the vendored moonlight-common-c/decoder.
- Whether queue/buffer depth is exposed by the active v4l2m2m decoder or must be approximated from pending-frame counts.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
 decode thread (video pipeline)                control thread (0006 poll loop, ~250ms)
 ──────────────────────────────                ───────────────────────────────────────
  on frame submit/drop:                         every ~1s:
    health_stats.frames_received++                lock
    health_stats.frames_dropped += d              rtt,var = LiGetEstimatedRttInfo()
    health_stats.decode_time_ewma = ...           s = assemble_sample(health_stats, rtt,
    health_stats.queue_depth = pending                          var, connection, applied)
        │  (mutex-guarded)                         unlock
        └───────────────► shared struct ─────────► emit event "quality.sample" {s}
                                                   refresh snapshot.streamQuality.sample

        control socket (existing local-control channel)
                          │
      moonlight-control-client onEvent ──► thin adapter ──► StreamHealthMonitor (platform)
                                                              ring buffer + summaries
                                                              + stale detection
                                                                   │
                                          korri stream show ◄── snapshot readback
                                          (Layer 5 later)   ◄── live subscribe
```

---

## Implementation Units

### U1. Stream-health sample schema, event, and snapshot enrichment (protocol)

**Goal:** Define the wire contract: a `StreamHealthSample` schema, a `quality.sample` event, and a `streamQuality.sample` field on the snapshot.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `product/plugins/moonlight/src/moonlight-control-protocol.ts`
- Test: `product/plugins/moonlight/src/moonlight-control-protocol.test.ts` (extend the existing protocol test)

**Approach:**
- Add a `StreamHealthSample` struct: `rttMs`, `rttVarianceMs`, `lossFraction` (0..1), `deliveredBitrateKbps`, `requestedBitrateKbps`, `deliveredFps`, `requestedFps`, `framesDropped`, `decodeTimeMs`, `queueDepth`, `firstFrameMs` (optional), and a monotonic `sampledAtMs`/`seq`. All numeric fields optional-tolerant so a partial native sample still decodes (some counters may be unavailable early).
- Add event `{ name: "quality.sample", sample: StreamHealthSample }` alongside `quality.connection`.
- Extend `StreamQualitySnapshot` with optional `sample: StreamHealthSample` and keep `connection`.
- Keep additive-object posture (unknown fields tolerated) consistent with existing snapshot types.

**Patterns to follow:** the existing `quality.connection` event and `StreamQualitySnapshot` in the same file; `boundedInt`/optional schema helpers already used there.

**Test scenarios:**
- Happy path: a fully-populated `quality.sample` envelope decodes to the typed sample.
- Edge case: a sample missing optional counters (only `rttMs`, `lossFraction`, `seq`) still decodes.
- Edge case: `lossFraction` outside 0..1 or negative numeric fields are rejected by the schema.
- Happy path: a `state.snapshot` carrying `streamQuality.sample` decodes and preserves the sample.
- Edge case: a snapshot with no `sample` (older client) still decodes with `sample` undefined.

**Verification:** protocol tests pass; the new types are exported for client/platform use.

---

### U2. Native RTT/jitter sampling + real connection status (native)

**Goal:** Populate RTT, RTT variance, and the real coarse `connection` value in the control state, replacing the hardcoded `"unknown"`.

**Requirements:** R2, R3

**Dependencies:** U1 (field names/contract)

**Files:**
- Create: `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0016-add-stream-health-sampling.patch` (0016 is the next unused number — patches currently run through 0015)
- Modify: `product/plugins/moonlight/packages/moonlight-embedded-korri/README.md` (document the new patch)

**Approach:**
- Add fields to the `control` struct (or a dedicated `moonlight_health_stats`) for `rtt_ms`, `rtt_variance_ms`, and `connection` (enum unknown/poor/okay/good).
- In the control thread, call `LiGetEstimatedRttInfo(&rtt, &var)` under lock; store when available.
- Map the existing `connection_status_update(int status)` hook (shared with `0005d`) to set `connection` = okay/poor; leave `good`/`unknown` derivation for a later refinement (okay is the moonlight-common-c "good" baseline).
- Do not emit yet (U4 emits); this unit only makes the values live in state and in the snapshot's `connection`.

**Execution note:** Native cross-thread values are only real on hardware — compile + patch-apply is the machine gate here; correct live values are a device gate (see Risks / Phased Delivery).

**Patterns to follow:** `0006`'s mutex discipline and `0005d`'s `connection_status_update` hook.

**Test scenarios:** Test expectation: none (native C; validated by the Nix patch-apply+compile check in U4 and by device verification). No TS behavior changes.

**Verification:** patch applies and moonlight compiles; snapshot `connection` reflects the real status instead of a constant on a running stream (device gate).

---

### U3. Native decode/delivery stats bridge (native)

**Goal:** Capture delivered bitrate/FPS, frames dropped, decode time, queue depth, and first-frame timing from the decode path into the shared stats struct.

**Requirements:** R2

**Dependencies:** U2 (shared struct + patch file)

**Files:**
- Modify: `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0016-add-stream-health-sampling.patch`

**Approach:**
- Extend `moonlight_health_stats` with `frames_received`, `frames_dropped`, `decode_time_ewma_ms`, `queue_depth`, `delivered_bitrate_kbps`, `delivered_fps`, `first_frame_ms`.
- Update counters from the decode submit/drop path (mutex-guarded); derive delivered bitrate/FPS over the sample interval; take `requested_*` from the values `control` already holds (applied bitrate/fps/resolution).
- First-frame timing: arm a timestamp when a decoder (re)opens (shared seam with `0009`/`0010`) and record the delta to first decoded frame. This is the same signal U-B's decode-confirm will consume — expose it here, keep the recovery timer decision in U-B.
- Where a counter is not cleanly reachable, approximate (e.g., queue depth from pending-frame count) and mark it optional so U1's schema tolerates absence.

**Execution note:** Cross-thread counter wiring; real values are device-gated.

**Patterns to follow:** existing decode/video counters in moonlight-embedded; `0006` locking.

**Test scenarios:** Test expectation: none (native C; Nix compile gate in U4 + device verification).

**Verification:** compiles; on device, counters advance during a live stream and first-frame timing is non-zero after a resolution change.

---

### U4. Native cadence emit + snapshot sample + invariants (native)

**Goal:** Assemble and emit a `quality.sample` event at a fixed cadence and include the latest sample in the snapshot; guard the behavior with Nix invariants.

**Requirements:** R1, R3

**Dependencies:** U2, U3

**Files:**
- Modify: `product/plugins/moonlight/packages/moonlight-embedded-korri/patches/0016-add-stream-health-sampling.patch`
- Modify: `tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix`

**Approach:**
- In the control-thread loop, every ~1 s (constant tuned on device), build a JSON sample from the shared struct + `LiGetEstimatedRttInfo`, emit it via `moonlight_local_control_event_locked("quality.sample")` to subscribers, and store it so `moonlight_local_control_snapshot_locked()` includes `streamQuality.sample`.
- Only emit to clients subscribed to the `quality` event group (reuse existing subscription filter).
- Add grep invariants asserting: the `quality.sample` emit marker is present, `LiGetEstimatedRttInfo` is called, and no external-process/`system(`/`popen(` measurement was introduced (guards the "no external poller" rule).

**Execution note:** The emit is machine-verifiable via the compile+invariant check; correct sample *contents* are a device gate.

**Patterns to follow:** `0006`'s `event_locked` + `write_json`; the existing invariant style in the patch-check nix.

**Test scenarios:** Test expectation: none for C; the Nix check gains invariant assertions (verified by `nix eval`/`nix build` of the check).

**Verification:** `nix build .#checks.x86_64-linux.korri-moonlight-control-protocol-patch` passes (patch-apply + compile + invariants).

---

### U5. Streamer-agnostic stream-health normalizer (platform)

**Goal:** A pure module that ingests samples into a bounded rolling window and derives the summaries Layer 5 will read, with never-silent staleness.

**Requirements:** R4, R5, R7

**Dependencies:** U1 (shape reference only — types redeclared locally)

**Files:**
- Create: `product/platform/stream/stream-health.ts`
- Create: `product/platform/stream/stream-health.test.ts`

**Approach:**
- Redeclare a local `StreamHealthSample` input type (no Moonlight import — layering rule) and a `StreamHealthWindow` state.
- Pure functions: `ingestSample(window, sample) -> window` (bounded ring, drops oldest), and `summarize(window, nowMs) -> StreamHealthSummary` with mean/variance/trend for RTT, mean loss, delivered/requested ratios for bitrate and FPS, dropped-frame rate, decode-time mean, and a `freshness: "fresh" | "stale"` derived from `nowMs - lastSampleAt` against a staleness window.
- No side effects, no timers, no I/O — the edge (U6) drives it.

**Patterns to follow:** `product/platform/stream/runtime-recovery.ts` (pure reducer, local types, never-silent).

**Test scenarios:**
- Happy path: ingesting N samples yields correct rolling means for RTT/loss and correct delivered/requested ratios.
- Edge case: ring buffer caps at its bound; oldest samples evicted; summary reflects only the window.
- Edge case: empty window summarizes to a defined "no-data" result, not a throw.
- Error/never-silent: `summarize` with `nowMs` beyond the staleness window returns `freshness: "stale"` even though a last sample exists.
- Edge case: partial samples (missing optional counters) summarize without NaN — absent counters are excluded from their aggregate, not treated as 0.
- Edge case: trend detection reports rising/falling/flat RTT across an ordered window.

**Verification:** `bun test product/platform/stream/stream-health.test.ts` green; Biome clean; no Moonlight import in the module.

---

### U6. Client sample delivery + session-start wiring (integration)

**Goal:** Surface `quality.sample` from the control client and feed a `StreamHealthMonitor` at session start via a thin adapter.

**Requirements:** R4, R5

**Dependencies:** U1, U5

**Files:**
- Modify: `product/plugins/moonlight/src/moonlight-control-client.ts` (ensure `quality.sample` events are decoded and delivered via `onEvent`)
- Create: `product/platform/stream/stream-health-monitor.ts` (edge adapter: subscribes to a streamer-agnostic sample port, drives U5's window, exposes `latestSummary()`)
- Create: `product/platform/stream/stream-health-monitor.test.ts`
- Modify: the session lifecycle seam where a stream's control client is created/torn down, to start/stop the health monitor (this session-start wiring does not exist yet — the recovery supervisor is also still unwired; co-locate the two so a single seam owns both)

**Approach:**
- Mirror the recovery supervisor's port pattern: a `StreamHealthSamplePort` interface (`onSample(cb)`) that a thin Moonlight-client adapter implements by filtering `quality.sample` events; the platform monitor never imports the plugin.
- The monitor owns the window (U5) and exposes `latestSummary(nowMs)`; on `stale`, it surfaces that via its summary (never silent). No decisions.
- Introduce (or extend) a single session lifecycle seam that starts/stops both the health monitor and, when it lands, the recovery supervisor. If the recovery supervisor is still unwired at execution time, this unit establishes the seam; wiring the supervisor into it is a small follow-up, not a blocker for the monitor.

**Patterns to follow:** `product/platform/stream/runtime-recovery-supervisor.ts` (`RuntimeRecoveryControlPort`, session-start wiring).

**Test scenarios:**
- Happy path: samples pushed through the port update `latestSummary`.
- Integration: a filtered non-sample event (e.g. `quality.connection`) is ignored by the monitor.
- Error/never-silent: no samples within the staleness window → `latestSummary` reports `stale`.
- Edge case: monitor stop unsubscribes; late samples after stop are dropped without throwing.

**Verification:** monitor tests green; on device, launching a stream populates a live summary (device activation gate).

---

### U7. `korri stream show` renders numeric health (CLI)

**Goal:** Make the sensor set observable from the CLI without Layer 5.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Modify: `product/surfaces/terminal/korri-cli/stream-quality.ts`
- Modify: `product/surfaces/terminal/korri-cli/stream-quality.test.ts`

**Approach:**
- Extend `formatState`/`runStreamShow` to print a health block from `snapshot.streamQuality.sample`: RTT (ms) ± jitter, loss %, delivered vs requested bitrate and FPS, frames dropped, decode time, queue depth, first-frame ms, and connection.
- When no `sample` is present (older client / pre-first-sample), print a clear "health: not yet reported" line rather than blanks or `[object Object]`.
- Render deltas legibly (e.g. `bitrate: 11.9/13.4 Mbps (89%)`).

**Patterns to follow:** the existing `formatState` layout and the `describeControlError`/coercion formatting already in this file.

**Test scenarios:**
- Happy path: a snapshot with a full sample renders each metric with units and delivered/requested ratios.
- Edge case: a snapshot without a sample renders "not yet reported", no throw, no `[object Object]`.
- Edge case: a partial sample (RTT + loss only) renders present fields and omits absent ones cleanly.
- Edge case: `stale`-flagged snapshot (if surfaced) is labeled stale rather than shown as current.

**Verification:** `bun test product/surfaces/terminal/korri-cli/stream-quality.test.ts` green; `korri stream show` on device prints live numbers (device gate).

---

## System-Wide Impact

- **Interaction graph:** new `quality.sample` event flows client → control socket → client `onEvent` → monitor adapter → platform window; snapshot readback path unchanged except for the added optional field. Session-start seam gains a second lightweight consumer beside the recovery supervisor.
- **Error propagation:** sampling failures degrade to absent/optional fields and, on total silence, to a derived `stale` summary — never a throw, never a frozen "healthy" reading.
- **State lifecycle risks:** cross-thread stats struct must be mutex-guarded; monitor must unsubscribe on teardown to avoid leaks after stream end.
- **API surface parity:** the same `quality.sample` contract serves both `korri stream show` (snapshot) and the future Layer 5 controller (live subscribe) — one schema, two readers.
- **Unchanged invariants:** no runtime settings are changed by this plan; the accept-and-adapt mechanism, the global latch, and the recovery supervisor behavior are untouched. `streamQuality.connection` keeps its type; the coarse flag remains, now backed by real status.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Decode-thread counters not cleanly reachable in moonlight-embedded | Optional-tolerant schema (U1) + approximations (pending-frame count for queue depth); confirm at compile against vendored decoder. |
| Cross-thread timing / lock contention on the 250 ms loop | Sample at ~1 s, copy under lock then release before emit; device-gate the cadence constant. |
| Real values only appear on hardware | Split delivery: Phase 1 machine-verifiable (schema, normalizer, CLI vs synthetic samples); Phase 2/3 native + device gates. Do not mark device-only behavior "done" from a green compile. |
| Accidentally reintroducing an "external watcher" | Nix invariant (U4) forbids `system(`/`popen(`/external-process measurement; samples come only from `LiGetEstimatedRttInfo` + decode counters. |
| Layering violation (platform importing the plugin) | U5/U6 redeclare local types and use a port, mirroring `runtime-recovery.ts`. |

---

## Phased Delivery

### Phase 1 — Machine-verifiable (land without a device)
- U1 (protocol schema), U5 (platform normalizer), U7 (CLI formatting) — all provable with `bun test` against synthetic samples.

### Phase 2 — Native (compile + Nix invariants; real values device-gated)
- U2, U3, U4 — patch applies, moonlight compiles, invariants hold.

### Phase 3 — Wiring + device activation
- U6 client/monitor wiring; then a device session confirms live samples populate, `korri stream show` prints real numbers, and staleness trips when a stream ends. Tune the cadence and first-frame constants here.

---

## Sources & References

- Related backlog: `01KWN2M3GSW2FQST7F3M7RX0V2` (U-B watchdog — shares the first-frame/decode-confirm seam), `01KWMFWP8CYHDBGV7QCHR2ZDZR` (640×360 green-screen safety — a consumer of health once Layer 5 exists).
- Adaptive north star: `work/parking-lot/01KSXN94148T4616TA79KHQD9T-design-adaptive-stream-quality-ladder-with-hysteresis.md` (Layer 5, reframed continuous controller — the primary consumer of these senses).
- Governing contract: `docs/acceptance/runtime-settings-protocol-contract.md`.
- Layer 3 scope: `docs/korri-stream-layer3-safety-net-scope.md`.
