# Stream Quality Plan — Flow Analysis

**Scope**: Four work items analyzed for user flows, state transitions, edge cases, and test scenarios.
1. Extend adaptive boundary grammar to `floor..startup..ceiling`
2. Use `startup` for conservative launch/establish; preserve explicit `ceiling` and `floor`
3. Preflight launch-quality selection before Moonlight starts
4. Health-driven / handoff-aware early downshift for running streams

**Codebase version**: trunk @ c90182f6

---

## Phase 1: Codebase Ground Truth

Key files read before analysis:

| Area | Path |
|---|---|
| Boundary grammar | `product/platform/stream/stream-adaptive-boundaries.ts` |
| Adaptive controller | `product/platform/stream/stream-adaptive-controller.ts` |
| Adaptive runner | `product/platform/stream/stream-adaptive-runner.ts` |
| Stream session | `product/platform/stream/stream-session.ts` |
| Handoff trigger | `product/platform/stream/stream-handoff-trigger.ts` |
| Moonlight launcher | `product/apps/portal/stream/moonlight-launcher.ts` |
| Moonlight launch spec | `product/plugins/moonlight/src/moonlight-launch-spec.ts` |
| Moonlight policy | `product/plugins/moonlight/src/config/policy.ts` |
| CLI launch command | `product/surfaces/terminal/korri-cli/launch-command.ts` |
| CLI entry point | `product/surfaces/terminal/korri-cli/korri-cli.ts` |
| Stream quality CLI | `product/surfaces/terminal/korri-cli/stream-quality.test.ts` |
| Platform limits | `product/platform/stream-control/limits.ts` |
| Moonlight removability | `product/plugins/moonlight/removability.test.ts` |

### Existing structure relevant to the plan

**Boundary grammar** (`NumericLeverBoundary`): supports `{ floor?, ceiling?, pinned?, free? }`. CLI grammar: `5000..20000` (range), `5000` (pinned), `..20000` (ceiling-only), `5000..` (floor-only), `auto` (free). No `startup` slot exists.

**Establish phase**: `StreamAdaptiveControllerPhase = "steady" | "establishing"` exists in the controller. When phase is `"establishing"`, the controller uses `Math.min(bitrateCeiling, coldStartBitrateKbps)` — currently `8_000` kbps hardcoded in `DEFAULTS`. **Critical gap**: the adaptive runner (`createStreamAdaptiveRunner`) never passes a `phase` argument to `computeStreamAdaptiveDecision`. The establish path in the controller is effectively dead from the runner's perspective and only exercises via the scenario runner.

**Effective ceilings**: `effectiveBoundaries` in `stream-adaptive-runner.ts` automatically caps all levers at Moonlight's initial reported values (bitrate, fps, resolution). This is the "launch values act as envelope" invariant — already implemented.

**Handoff module**: `stream-handoff-trigger.ts` provides `normalizeHandoffTrigger → StreamHandoffHint` and `handoffHintPressure → StreamAdaptivePressure`. **No runtime consumer exists**. Both functions are only referenced in their own test.

**Plugin removability**: `@platform/stream` (boundaries, controller, runner) is the platform layer. `@product/plugins/moonlight` is the plugin layer. The boundary type lives in platform and must remain plugin-agnostic. The removability test enforces zero shipped imports of the moonlight package outside the plugin host.

---

## Phase 2: User Flows

### Flow 1 — Static launch with explicit startup bitrate

**Entry**: `korri launch <game> --bitrate=5000..10000..20000`

```
User invokes CLI with 3-part bitrate flag
    │
    ▼
parseStreamBoundaryArgs() — needs to parse "10000" as startup slot
    │  [gap: current parser rejects >2 parts]
    ▼
StreamBoundaries.levers.bitrate = { floor: 5000, startup: 10000, ceiling: 20000 }
    │
    ▼
launchMoonlight()
    │
    ├── Moonlight spawned with ceiling values in args (-bitrate ceiling, -width/-height/-fps from policy)
    │   [question: does the policy bitrate === ceiling? or is startup passed to Moonlight directly?]
    │
    └── startStreamRuntimeSession()
           │
           ▼
        adaptiveRunner created; startup → coldStartBitrateKbps
           │  [gap: no path from boundaries.startup → params.coldStartBitrateKbps]
           │
           ▼
        runner.tick() with phase="establishing"
           │  [gap: runner never sets phase on tick calls]
           │
           ▼
        establish mode: start at min(ceiling, startup) = 10000 kbps
           │
           ▼
        gradually climb toward ceiling as health permits
           │
           ▼
        phase transitions to "steady" after N healthy samples
           │  [gap: no phase-transition logic in runner]
```

**Terminal states**: Stream running at ceiling if healthy; stream at floor if link poor; Moonlight exits.

---

### Flow 2 — Preflight quality selection

**Entry**: `korri launch <game>` (no explicit bitrate; preflight selects quality profile)

```
User invokes launch
    │
    ▼
runLaunchCommand() — before launchMoonlight()
    │
    ▼
[new] runPreflight(host) — probe link to source machine
    │
    ├── probe timeout? → use rescue profile (640x360/30fps/startup=4000)
    ├── probe result: excellent → use high profile (1080p/120fps/startup=20000)
    ├── probe result: good → use medium profile (1080p/60fps/startup=12000)
    ├── probe result: fair → use safe profile (720p/60fps/startup=8000)
    └── probe fails (tool missing, refused) → abort or use rescue profile
    │
    ▼
launchMoonlight({ adaptiveBoundaries: probeResult })
    │
    ▼
stream runs as in Flow 1
```

**Decision points**: abort-on-failure vs rescue-on-failure; whether explicit flags override probe.

---

### Flow 3 — Handoff-aware early downshift (running stream)

**Entry**: User is streaming; network transitions (Wi-Fi → cellular, or RTT spike detected)

```
Stream running normally (adaptive in steady/fine-tune phase)
    │
    ▼
External signal arrives: signalPercent drops below 30, or handoffInProgress=true
    │
    ▼
normalizeHandoffTrigger(signal) → { kind: "collapse-likely", severity }
    │
    ▼
handoffHintPressure(hint) → synthetic StreamAdaptivePressure
    │  [gap: no consumer in runner; synthetic pressure not injected into tick]
    │
    ▼
[new] runner.injectPressure(pressure) — triggers immediate downshift without waiting for next tick
    │
    ├── bitrateKbps → floor (e.g. 500 kbps)
    ├── fps → playable floor (e.g. 30)
    └── resolution → playable floor (e.g. 640x360)
    │
    ▼
Stream stabilizes at playable floor
    │
    ▼
Recovery window: wait N samples of healthy RTT/loss before climbing
    │
    ▼
Gradual climb back toward startup, then ceiling
```

**Terminal states**: Stream survives handoff at low quality; stream drops (outage supervisor handles); user manually raises quality.

---

### Flow 4 — Manual runtime set under active handoff

**Entry**: User runs `korri stream bitrate 20000` while handoff/congestion is in progress

```
korri stream bitrate 20000
    │
    ▼
runStreamSet({ kind: "bitrate", bitrateKbps: 20000 }, io)
    │
    ▼
client.setBitrate({ bitrateKbps: 20000 }) → Promise.reject or command.rejected
    │  [known: spec says "manual commands can fail if stream floods link"]
    │
    ├── rejected → err output "bitrate out of bounds" or transport error
    │   [question: should CLI warn that a handoff may be in progress?]
    └── silently accepted but link drops new frames → stream degrades further
    │
    ▼
exit code 1; no retry; user must try again
```

---

## Phase 3: Gaps

### Critical

**C1 — Establish phase is dead code from the runner**

The controller has an "establish" mode gated on `input.phase === "establishing"`, but `createStreamAdaptiveRunner` never passes `phase` to `computeStreamAdaptiveDecision`. The startup bitrate logic (`coldStartBitrateKbps`) only activates in this phase. Adding a `startup` field to `NumericLeverBoundary` is wasted if the runner never transitions through the establish phase.

_Existing pattern_: `stream-adaptive-scenario.ts` does pass `phase` — it's the right model. The runner needs equivalent phase lifecycle: `establishing` for the first N healthy samples, then `steady`.

_Required_: Add phase state to the runner (or to `StartStreamRuntimeSessionOptions`). Define the transition predicate (e.g., `sampleCount >= coldStartSampleCount && healthyEnoughForGrowth`). Expose phase in runner events for observability.

---

**C2 — No path from `boundaries.levers.bitrate.startup` to `params.coldStartBitrateKbps`**

Even after the grammar extension, the startup value in `StreamBoundaries` has no path into the controller. `StreamAdaptiveControllerParams` is a separate type. The runner's `computeStreamAdaptiveDecision` call in `stream-adaptive-runner.ts` passes `boundaries` but not `params`.

_Options_: (a) Add a `startup` field to `NumericLeverBoundary` and have the controller read it directly from boundaries, keeping params as overrides. (b) Extract `startup` from boundaries in the runner and inject as `params.coldStartBitrateKbps`. Option (a) is cleaner — boundaries already express the user's intent; params are internal tuning.

---

**C3 — Handoff trigger has no runtime consumer**

`stream-handoff-trigger.ts` is fully isolated. No runner, session, or launcher reads it. The plan treats it as a building block, but the wiring between signal acquisition, hint normalization, and adaptive dispatch doesn't exist.

_Required_: Define the signal acquisition source (network manager events? RTT spike from health monitor? explicit API call?). Wire `normalizeHandoffTrigger` → `handoffHintPressure` → runner. Decide whether the runner polls or receives pushed events. The current tick model is polling — handoff needs a lower-latency path.

---

**C4 — Preflight probe protocol is unspecified**

The parking lot item captures the intent but leaves probe mechanism open (iperf3 vs custom). Without specifying the protocol, the implementation cannot be planned: the source machine needs a server, the probe duration constrains UX, and failure modes differ between iperf3 and a product-owned TCP probe.

_Decision needed before implementation_: protocol choice, probe duration budget, server-side capability requirement, and whether the probe is opt-in or default.

---

### Important

**I1 — Moonlight launch bitrate vs startup bitrate**

`renderStreamArgs` passes `stream.bitrateKbps` from the policy to Moonlight's `-bitrate` flag. If the policy encodes the ceiling, Moonlight negotiates at ceiling bandwidth. The adaptive runner then issues `setBitrate` at startup. There is a window (connect → first adaptive tick, up to `tickIntervalMs = 5000ms`) during which the stream runs at full ceiling bitrate. On a constrained link this window can flood the connection and drop packets before the first correction.

_Question_: Should `startup` be passed as the initial `-bitrate` arg to Moonlight (capping what Moonlight negotiates) with only resolution/fps at ceiling? Or should Korri issue a `setBitrate(startup)` immediately after the control socket connects, before the first adaptive tick?

_Implication_: if Moonlight is launched with a lower `-bitrate` than the ceiling, Sunshine may refuse to serve higher bitrates even after adaptive upgrades. The spec says "current Moonlight launch resolution/FPS act as envelope" — not bitrate. This asymmetry needs an explicit statement.

---

**I2 — Grammar serialization is a contract**

`serializeStreamBoundaries` and `serializeNumericLever` produce strings like `bitrate=5000..20000` that round-trip through `parseStreamBoundaryArgs`. After adding a startup slot, existing serialized strings (e.g., from `korri stream adaptive show --json`) will not carry startup information, and new strings will not parse on old CLI versions. The RPC call `app.stream-control.adaptive.set` passes `{ args: string[] }` — adding `startup` to args is backward-compatible for the server, but old servers will silently drop the field.

_Required_: Define the serialized form (`5000..10000..20000` vs `floor=5000,startup=10000,ceiling=20000` vs a separate key `bitrate-startup=10000`). If the 3-part form is chosen, update `serializeNumericLever` and all round-trip tests.

---

**I3 — Phase transition predicate is unspecified**

When does `establishing` end and `steady` begin? The controller uses `coldStartSampleCount: 3` as the threshold, but that's sample count, not health quality. A stream can accumulate 3 samples on a flooded link; reaching sample count alone is not a sufficient "established" signal.

_Recommended_: Transition to `steady` when `sampleCount >= coldStartSampleCount && healthyEnoughForGrowth(pressure)` (matching the existing `healthyEnoughForGrowth` predicate). Document this as the contract.

---

**I4 — Preflight failure must have a defined resolution**

If the probe fails (tool not found, host refuses, timeout), the launch must have a specified behavior. Three options:

1. **Abort**: fail with a clear error (high friction, safe).
2. **Rescue fallback**: use the lowest safe profile (640x360/30fps/floor bitrate).
3. **Skip**: proceed with user-specified or default values, warn that preflight failed.

Without specifying this, every implementation path will make a different choice, leading to inconsistent UX across devices and operators.

---

**I5 — Handoff recovery boundary is undefined**

After a handoff downshift, when does quality recovery begin? The current adaptive controller recovers toward ceiling whenever `healthyEnoughForGrowth`. There is no "post-handoff cooldown" or "wait for N stable samples before allowing recovery." On a flapping mobile connection, this could cause thrash: downshift → recover → downshift → recover.

_Required_: Define a recovery gate specific to post-handoff state (e.g., minimum N samples within healthy thresholds after the last handoff signal). This likely requires new state in the runner.

---

**I6 — `startup` applicability to fps and resolution levers**

The spec says "startup to choose conservative launch/establish behavior." Is `startup` meaningful for fps and resolution? For fps, a conservative launch at 30fps with ceiling at 60fps is a valid UX (lower latency during establish). For resolution, launching at 720p and growing to 1080p is already the current resolution-recovery behavior.

If `startup` is only for bitrate, the grammar extension should be scoped (`bitrateFloor..startup..ceiling` in docs, not a generic 3-part form). If it applies to all levers, fp and resolution behavior during establish must be specified.

---

**I7 — Explicit ceiling vs preflight result conflict**

If the user passes `--resolution=1280x720 --fps=60` and the preflight suggests a 1080p120 profile is safe, which wins? Similarly, if the user passes explicit boundaries but the probe says the link is too weak for the ceiling, does the probe override the ceiling?

_Recommended_: Explicit flags always win. Preflight only populates missing fields. Document this precedence.

---

### Minor

**M1 — `--startup` flag omitted from `streamBoundaryFlags`**

`korri-cli.ts` defines `streamBoundaryFlags` with `bitrate`, `fps`, `resolution`, `lean`, `auto`, `max-latency`, `min-fps`. If startup is a separate concept (not embedded in the bitrate range string), a `--startup-bitrate` flag is needed. If it's embedded in the `--bitrate` value string, the flag set is unchanged but the help text and validator need updating.

---

**M2 — `parseStreamBoundaryArgs` error messages for 3-part ranges**

The current rejection message `"invalid range for bitrate: 5000..10000..20000"` will appear until the parser is updated. After the update, the error for `floor > startup` vs `startup > ceiling` vs `floor > ceiling` must be distinct.

---

**M3 — Preflight is optional for local launches**

The `launchRemoteEntry` path in `launch-command.ts` handles remote launches. Local launches use `launchLocal` (sessiond). Preflight only makes sense for remote streams. The code must not run a network probe for local launches. The existing remote/local branch at `findEntryForChoice` is the right insertion point for preflight.

---

**M4 — `coldStartBitrateKbps` default confusion after startup is added**

Once `startup` is a first-class boundary value, the `DEFAULTS.coldStartBitrateKbps = 8_000` in the controller is a fallback, not the user-facing value. Its relationship to `startup` must be documented: when `startup` is absent, `coldStartBitrateKbps` is used; when `startup` is present, it overrides. The distinction matters for DEFAULTS audits.

---

## Phase 4: Questions

**Q1 — Does the establish phase apply only to bitrate, or also to fps and resolution?**

_Stakes_: If fps and resolution also have startup values, the grammar extension and controller logic are significantly larger. If it's bitrate-only, the grammar can stay simpler (`floor..startup..ceiling` only valid for `bitrate=`).
_Default assumption_: Bitrate only for startup. fps and resolution follow existing recovery behavior.

---

**Q2 — Should Moonlight be launched with `startup` bitrate or `ceiling` bitrate as the `-bitrate` flag?**

_Stakes_: If launched with ceiling, there is a 0–5000ms window of full-ceiling bandwidth usage before adaptive kicks in. On a 6 Mbit link with a 20 Mbit ceiling, this can cause immediate packet loss and control command failure. If launched with startup, Sunshine may cap the stream at that value even after adaptive upgrades — depending on how Sunshine handles runtime bitrate vs negotiated bitrate.
_Default assumption_: Launch with ceiling value (preserve full capability negotiation); issue an immediate `setBitrate(startup)` command as soon as the control socket connects, before the first adaptive tick. Define the sequence explicitly in the launcher.

---

**Q3 — What is the preflight probe mechanism: iperf3 or product-owned?**

_Stakes_: iperf3 requires server-side setup, adds a dependency, and takes 3–10 seconds. A product-owned TCP probe can be faster and self-contained but less accurate. This decision gates whether the source daemon needs a new service listener.
_Default assumption_: Product-owned lightweight probe (TCP round-trip + small payload, <1s). Document iperf3 tradeoffs in the parking lot item.

---

**Q4 — What happens when preflight fails: abort, rescue profile, or skip?**

_Stakes_: Aborting is safest but creates friction on flaky networks. Skip-with-warning may cause the exact unrecoverable-choke problem the feature is designed to prevent.
_Default assumption_: Use the rescue profile (`640x360/30fps/startup=4000kbps`) on probe failure, with a visible warning. Do not abort.

---

**Q5 — What signal source feeds the handoff trigger at runtime?**

_Stakes_: RTT spike from health data is already available and requires no new wiring. Network manager / interface-change events are more accurate but platform-specific and require a new integration point. Without a source, `normalizeHandoffTrigger` remains unused.
_Default assumption_: For the first cut, use RTT spike from health data as a synthetic handoff signal (if RTT exceeds a threshold suddenly, treat it as a collapse-likely hint). External network signals are a follow-on.

---

**Q6 — Does handoff downshift preempt the next tick or happen immediately?**

_Stakes_: If the runner ticks every 5 seconds, a handoff detected between ticks waits up to 5 seconds before the downshift — long enough for control commands to fail.
_Default assumption_: Handoff signal triggers an immediate out-of-band dispatch (bypassing the tick interval) to the playable floor. The runner needs a `triggerDownshift()` method or the signal must be injected into health data such that the next tick (re-scheduled immediately on signal) responds.

---

**Q7 — What is the post-handoff recovery gate?**

_Stakes_: Without a cooldown, aggressive recovery on a flapping mobile connection causes quality thrash. With too long a cooldown, the user is stuck at floor even after the connection stabilizes.
_Default assumption_: Require `coldStartSampleCount` (3) consecutive healthy samples after the last handoff signal before allowing upward recovery. Use the same `healthyEnoughForGrowth` predicate.

---

**Q8 — Should `startup` serialize as a 3-part token (`5000..10000..20000`) or a separate key (`bitrate-startup=10000`)?**

_Stakes_: The 3-part token is compact and extends the existing grammar family. It changes `serializeNumericLever` output format and will not parse on older CLI builds. A separate key is additive and backward-compatible but splits a single conceptual boundary across two flags.
_Default assumption_: 3-part token (`floor..startup..ceiling`) for consistency with the existing range grammar. Document as a minor breaking change to the serialized format.

---

## Test Scenarios

Organized by work item. New test files/locations suggested in parentheses.

### Work Item 1 — Grammar extension

| # | Scenario | Expected |
|---|---|---|
| T1 | `parseStreamBoundaryArgs(["bitrate=5000..10000..20000"])` | `{ floor: 5000, startup: 10000, ceiling: 20000 }` |
| T2 | `parseStreamBoundaryArgs(["bitrate=..10000..20000"])` | `{ startup: 10000, ceiling: 20000 }` |
| T3 | `parseStreamBoundaryArgs(["bitrate=5000..10000.."])` | `{ floor: 5000, startup: 10000 }` |
| T4 | `bitrate=5000..20000` (existing 2-part) still parses | No regression |
| T5 | `bitrate=20000..10000..5000` (startup < floor) | Throw `startup must be >= floor` |
| T6 | `bitrate=5000..30000..20000` (startup > ceiling) | Throw `startup must be <= ceiling` |
| T7 | `bitrate=5000..10000..20000` serializes to `"5000..10000..20000"` | Round-trip |
| T8 | `mergeStreamBoundaries` with startup in lower layer and ceiling in upper | Last-write-wins per lever, not per sub-field |

_Location_: `product/platform/stream/stream-adaptive-boundaries.test.ts`

---

### Work Item 2 — Startup → establish wiring

| # | Scenario | Expected |
|---|---|---|
| T9 | Runner tick with `phase="establishing"` and `startup=10000`, `ceiling=20000` | First decision targets 10000, not 20000 |
| T10 | Runner transitions phase after `coldStartSampleCount` healthy samples | Mode shifts from `establish` to `fine-tune` |
| T11 | Runner with `startup` in boundaries and no explicit `params` | Startup extracted from boundaries, not hardcoded 8000 |
| T12 | Runner with phase `"establishing"` and no startup in boundaries | Falls back to `DEFAULTS.coldStartBitrateKbps = 8000` |
| T13 | Scenario: stream starts at startup=10000 and healthy samples arrive | Bitrate grows toward ceiling without overshoot |
| T14 | Scenario: stream starts at startup=10000, link is stressed | Drops to floor, not ceiling, during establish |
| T15 | `effectiveBoundaries` with explicit ceiling | Startup does not exceed ceiling |

_Location_: `product/platform/stream/stream-adaptive-runner.test.ts`, `product/platform/stream/stream-adaptive-scenario.test.ts`

---

### Work Item 3 — Preflight quality selection

| # | Scenario | Expected |
|---|---|---|
| T16 | Probe returns excellent result | Boundaries set to high profile (1080p120 ceiling, startup=20000) |
| T17 | Probe returns fair result | Boundaries set to safe profile (720p60, startup=8000) |
| T18 | Probe times out | Rescue profile used, warning emitted, launch proceeds |
| T19 | Probe tool not found | Rescue profile used, warning emitted; exit code 0 (launch proceeds) |
| T20 | Probe host unreachable | Rescue profile, warning; not an abort |
| T21 | User passes explicit `--bitrate=..20000` and probe says 8000 safe | Explicit ceiling wins; probe may adjust startup, not ceiling |
| T22 | Local launch does not invoke probe | `runPreflight` never called on local entry |
| T23 | Probe result composes with user boundary args | merge order: probe < explicit flags |

_Location_: New test file near `product/surfaces/terminal/korri-cli/launch-command.test.ts`; a pure probe result → boundary adapter unit test at `product/platform/stream/`

---

### Work Item 4 — Handoff-aware downshift

| # | Scenario | Expected |
|---|---|---|
| T24 | `signalPercent=10` during running stream | Runner dispatches to playable floor before next scheduled tick |
| T25 | `handoffInProgress=true` | Immediate downshift; severity=1 maps to full shed |
| T26 | `signalPercent=80` (healthy) | No downshift triggered |
| T27 | Signal arrives, link recovers, N healthy samples elapse | Quality recovery begins; no premature upshift |
| T28 | Signal arrives again before recovery completes | Recovery gate resets; floor maintained |
| T29 | Manual `korri stream bitrate 20000` during handoff | CLI emits warning "stream may be congested"; error from rejected command surfaces cleanly |
| T30 | Handoff hint + organic shed simultaneously | Shed path wins; no double-dispatch |
| T31 | Handoff downshift with `floor` boundary set | Downshift stops at floor, not at absolute minimum |

_Location_: `product/platform/stream/stream-adaptive-runner.test.ts`; `product/platform/stream/stream-handoff-trigger.test.ts` (signal-to-dispatch integration)

---

## Recommended Next Steps (ordered)

1. **Resolve Q2** (Moonlight launch bitrate vs startup bitrate) before any code is written. It determines whether the launcher needs a new immediate `setBitrate` call, which affects the moonlight-launcher contract and test doubles.

2. **Fix the dead establish phase (C1)**. Add phase lifecycle to `createStreamAdaptiveRunner`: `phase` state initialized to `"establishing"`, transitions to `"steady"` after the predicate from I3. This is the prerequisite for items 1 and 2. Unblock with T9–T15.

3. **Extend `NumericLeverBoundary` with `startup?` (C2, I2)**. Add the field; update `parseNumericLever`, `serializeNumericLever`, `mergeStreamBoundaries`, and `definedNumericLever`. Wire `startup` into controller params (resolve Q8 for serialization form first). Cover T1–T8.

4. **Resolve Q3 and Q4** (preflight mechanism and failure behavior) before building preflight. The probe protocol determines what server-side capability is required on the source machine. The failure behavior determines whether `runPreflight` is a pure adapter or has side effects on the launch path.

5. **Wire handoff trigger into runner (C3)**. Decide on signal source (Q5) and timing (Q6). The simplest first cut: expose a `triggerHandoffDownshift(signal: StreamHandoffSignal)` method on the runner that immediately dispatches to the floor without waiting for the next tick. Cover T24–T31.

6. **Build preflight adapter** once Q3/Q4 are resolved. Pure function: `probeLinkQuality(host) → LinkQualityResult`; separate function: `selectLaunchProfile(result, userBoundaries) → StreamBoundaries`. Test as two pure units (T16–T23).

7. **Add `--startup` to CLI `streamBoundaryFlags`** only after the boundary type and runner wiring are stable. This is the last step because CLI flag naming (`--bitrate=5000..10000..20000` vs `--startup-bitrate`) depends on Q8 resolution. Update `launch-command.ts`, `korri-cli.ts`, and help text.

---

## Open Invariants to Document Before Implementation

- `floor ≤ startup ≤ ceiling` must hold; enforcement point: `parseNumericLever`.
- Startup bitrate never exceeds the initial Moonlight-reported bitrate (effective ceiling). If `startup > initial.bitrateKbps`, clamp startup to ceiling silently or error.
- Plugin removability: `StreamBoundaries` with `startup` lives at `@platform/stream`. The Moonlight launcher reads it without importing the plugin. The `STREAM_CONTROL_LIMITS` in `product/platform/stream-control/limits.ts` does not need a startup limit (startup is a boundary concept, not a control-surface validation concern).
- The `establish → steady` transition is a one-way latch per session. Re-connecting (outage supervisor re-establish) should reset phase to `"establishing"`.
