# Institutional Learnings: Korri Stream-Quality Follow-Up

## Search Context

- **Feature/Task**: Stream-quality product follow-up — floor/startup/ceiling CLI grammar, launch startup profile, preflight launch-quality probe, health-driven/handoff-aware downshift. Covers Moonlight/Sunshine runtime stream settings, adaptive controller design, CLI surfaces, network shaping, stream health telemetry, resolution/FPS launch envelope, and related validation runbooks.
- **Keywords Used**: stream-control, moonlight, sunshine, bitrate, fps, resolution, adaptive, preflight, handoff, downshift, cli-contract, quality-ladder, health-window, panic-bitrate, emergency, cascade-policy, gamescope, runtime-settings, korrid-device-state, validation
- **Files Scanned**: ~35 across `docs/solutions/`, `docs/acceptance/`, `docs/research/`, parking-lot items, and active work items
- **Relevant Matches**: 15 high-relevance sources

---

## Critical Patterns

No `docs/solutions/patterns/critical-patterns.md` exists in this repo.

---

## Relevant Learnings

### 1. Runtime Settings Protocol Contract — the authoritative source of truth

- **File**: `docs/acceptance/runtime-settings-protocol-contract.md`
- **Module**: Sunshine/Moonlight runtime stream settings
- **Problem Type**: `architecture_pattern` (inferred — acceptance doc, not solutions frontmatter)
- **Relevance**: Every piece of the planned stream-quality follow-up (floor/startup/ceiling grammar, preflight, downshift, CLI surfaces) must comply with this contract. It defines the protocol envelope, mutation sequencing, applied-truth semantics, recovery rules, and product-support scope.
- **Key Insights**:
  - **Accepted ≠ applied.** `accepted` means the command entered the runtime-settings path. Only a terminal `applied` with an observable readback value (matching width/height/bitrate/fps) is success. CLI and adaptive controller must surface this distinction, not collapse it.
  - **Global one-at-a-time mutation queue.** Only one bitrate/FPS/resolution mutation may be in flight at a time — across all families. The per-family latch already exists (patch `0005b`); the global cross-family latch is a known gap (item `01KWN2KEGW61TJ54X13JP0BTZ2`). Any multi-setting adaptive step must serialize through this queue.
  - **Accept and adapt, never reject for preference.** No allowlist of approved resolutions/bitrates. Any positive value is accepted and coerced to the nearest achievable (encoder alignment, min/max). Coerced values are reported via applied truth. This is the foundation the adaptive controller sits on.
  - **Scale only, never stretch.** Aspect ratio is fixed at stream launch. Runtime resolution changes only scale along the fixed ratio. Off-ratio requests are rejected with `invalid`, not silently stretched. The ceiling patch (patch `0019`) clamps same-ratio requests to the launch-negotiated ceiling per-dimension.
  - **Recovery is the caller's job, not the protocol's.** The protocol exposes launch baseline, current applied values, and last-command status so that higher-level recovery logic can issue an explicit revert. There is no protocol auto-rollback.
  - **Capability is required before mutation.** If the active session has not reported runtime-settings support, product mutation attempts must not be sent blindly. `protocol.hello` / `state.snapshot` capabilities gate access.
  - **Proven product profile**: h264\_vaapi + v4l2m2m (bandai/aka) is the only validated combination for live bitrate and FPS. Resolution remains proof-gated until client-side decode proof exists. Other codecs/encoders are diagnostic-only until separately validated (see `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`).
- **Severity**: critical (foundational contract for all planned work)

---

### 2. Resolution Is the Last-Resort Adaptive Lever — measured physics

- **File**: `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md`
- **Module**: stream-adaptive-controller, moonlight-embedded-korri
- **Problem Type**: `tooling_decision` / `best_practice` (inferred — findings doc)
- **Relevance**: Determines the lever-priority ordering for the floor/startup/ceiling grammar and the continuous adaptive controller design.
- **Key Insights**:
  - **Host-bound, not client-bound.** Measured live on bandai↔aka: 149.5ms host gap (Sunshine encoder teardown+rebuild, during which it sends nothing) + 62ms client pipeline = ~212ms total perceived freeze per resolution switch. 71% is host-side. No client-side work can make resolution switching seamless.
  - **The host is already optimized.** Patches 0012/0013/0014 are deployed on aka. 149ms is the already-optimized floor; it is not a regression.
  - **Confirmed design decision: bitrate/FPS are continuous live dials (~0ms freeze); resolution costs ~200ms because the host rebuilds its pipeline.** The adaptive controller must prefer bitrate/FPS and touch resolution rarely with strong hysteresis/damping. This closes the seamlessness question for the current hardware path.
  - **Decoder reopen (~30ms) is load-bearing and cannot be safely deleted.** Patch 0010 deliberately replaced in-place resize with a full `avcodec_free_context` + reopen because the iris FFmpeg-v4l2m2m path produces corrupt frames across a resolution change without it. Do not revert to in-place reconfig.
  - **10× rapid stress cycle confirms robustness.** Zero dropped frames, no crash, no latency growth. The mechanism is solid; the frequency/hysteresis is the tuning target.

---

### 3. Layer 3 Safety Net — global latch + decode-confirmed applied-truth

- **File**: `docs/korri-stream-layer3-safety-net-scope.md`
- **Module**: stream-control, moonlight-embedded-korri
- **Problem Type**: `architecture_pattern` (inferred)
- **Relevance**: Two specific engineering gaps must close before an autonomous adaptive controller is safe to ship. The scope doc specifies the implementation shape, anti-patterns, and what already exists.
- **Key Insights**:
  - **U-A (global latch, `01KWN2KEGW61TJ54X13JP0BTZ2`)**: Promote the in-flight latch from per-family to global. A new mutation while any mutation is in flight is rejected with `conflict`. Hard constraint: must not starve the operation-0 capability query (it shares the send path). Do this through the moonlight patch-export workflow.
  - **U-B (decode-confirmed applied-truth, `01KWN2M3GSW2FQST7F3M7RX0V2`)**: For resolution changes, "applied" must mean host-applied AND client-decoded a frame at the new size. A timer armed only during a change watches the decode loop; if no frame arrives in the window, report `failed` reason `decode-stall` and let Korri policy issue an explicit revert to last known-good. **Anti-pattern explicitly called out**: do NOT build a separate process that polls `korri stream show` / runtime-watch and infers screen state. That is tools-watching-tools — laggy, guessy, structurally blind to decode state. The mechanism lives in the client's decode loop.
  - **Last known-good**: the last decode-confirmed applied settings, falling back to the launch baseline. Never the last merely-requested value.
  - **Sequencing**: do both U-A and U-B in one moonlight patch-export checkout to avoid double patch churn. U-A first (mostly machine-verifiable); U-B test-first, tune threshold on device.
  - **Conflict policy for the adaptive controller**: reject with `conflict` now (already the per-family behavior); revisit coalescing when Layer 5 (controller) exists.

---

### 4. Continuous Adaptive Controller Design — NOT a preset ladder

- **File**: `work/items/active/01KSXN94148T4616TA79KHQD9T-adaptive-stream-controller/item.md`
- **Module**: stream-adaptive-controller, product-policy
- **Problem Type**: `architecture_pattern` (inferred — active work item)
- **Relevance**: Defines the north-star design for the adaptive controller that floor/startup/ceiling CLI grammar and the downshift/preflight items must plug into.
- **Key Insights**:
  - **No fixed table of blessed quality levels.** The controller derives bitrate/FPS/resolution mathematically from live measurements (throughput, latency, loss). Any internal ladder is at most a damping/fallback representation, not the source of allowed values. The legacy item title says "ladder"; the 2026-07-03 direction correction is explicit: treat the deliverable as a continuous adaptive controller with an objective bias.
  - **Accept-and-adapt is the required foundation.** The controller emits arbitrary computed values and expects the mechanism to coerce any value to the nearest achievable (clamp + even-round + host letterbox). Resolution coercion shipped; bitrate/FPS clamp (`01KWN2KEGT3NGTJZ6SHDRJ3YEG`) and host arbitrary-ratio + letterbox (`01KWN5M3AQR7TVMDDB0FHQ29GA`) are next.
  - **Mental model from testing**: FPS 120→30 at the same bitrate changes frame pacing but leaves bitrate (bandwidth) unchanged. To reduce bandwidth, lower bitrate explicitly. Resolution scaling is a tertiary lever that makes low bitrate more watchable by reducing pixels/second — not a substitute for bitrate control.
  - **Damping/hysteresis applies around a continuous setpoint** (avoid oscillation/flapping), not by snapping between named rungs.
  - **Objective-parametrized**: optimize for a chosen goal on a latency↔throughput/quality axis. The objective is a tunable bias, later surfaceable as a slider; defaults to fully automatic.

---

### 5. Stream-Control Command Outcome Contract — RPC envelope

- **File**: `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md`
- **Module**: stream-control, moonlight-control, gamescope-control
- **Problem Type**: `architecture_pattern`
- **Relevance**: Any CLI command or product RPC that mutates stream settings must use this outcome envelope. Defines the product-level lifecycle contract that hides backend-specific raw JSON-RPC payloads.
- **Key Insights**:
  - **Outcome shape is stable across backends.** Single-target: `{ kind: "single", status: "applied"|"pending"|"failed", error?: string }`. Linked (moon+gamescope): `{ kind: "linked", status: "applied"|"pending"|"partial"|"failed", moonlight: {...}, gamescope: {...} }`.
  - **Do not treat backend ACK as applied state.** Preserve `pending` when the backend accepted but readback hasn't confirmed.
  - **Preserve linked partial failure** — do not collapse to success.
  - **Raw protocol payloads are diagnostic-only.** Product consumers use `outcome`; debugging inspects `response`.
  - **Displayed UI values must come from `state.get` readback**, not command outcome.

---

### 6. Three New Parking-Lot Items Directly in Scope

These three items were parked as part of the same session that produced this planning request. They define the concrete work the plan must cover:

**a) Preflight probe for stream launch quality selection** (`01KWX9Q78A1BQ5AAAANNM4SCRJ`)
- **File**: `work/items/parking-lot/01KWX9Q78A1BQ5AAAANNM4SCRJ-add-preflight-probe-for-stream-launch-quality-selection.md`
- Lightweight probe (compare iperf3 vs product-owned) to choose a safe launch profile before Moonlight starts flooding the connection. Maps probe results to explicit profiles such as 1080p120/high, 1080p60/medium, 720p60/safe, 640x360/30/rescue.
- **Key distinction**: this is launch-time quality selection (before the stream), not handoff rescue (during a running stream).

**b) Handoff-aware preemptive downshift** (`01KWX9Q78CY3QNQ5BXV1BJ47ER`)
- **File**: `work/items/parking-lot/01KWX9Q78CY3QNQ5BXV1BJ47ER-add-handoff-aware-preemptive-stream-downshift.md`
- Detects route/interface changes (Wi-Fi → cellular, RTT spike, reconnect) on already-running streams and drops to a playable floor preemptively — before congestion builds. Waiting for normal adaptive health windows can make runtime control commands fail mid-choke.
- Recovery behavior: quality climbs only after the new connection is stable.

**c) Explore replacing explicit emergency mode with unified controller** (`01KWX6X2C5RZ08BTG9FSXYBHNY`)
- **File**: `work/items/parking-lot/01KWX6X2C5RZ08BTG9FSXYBHNY-explore-replacing-explicit-stream-emergency-mode-with-unifie.md`
- Investigates whether the current shed/emergency burst path can be replaced by a single continuous control law (ceiling/startup/floor constraints, same math for downshift and recovery). Must still reach a playable floor quickly under 6mbit/55ms/2% loss without overreacting during startup warmup.

---

### 7. CLI Exit-Code Contract — one canonical table

- **File**: `docs/solutions/tooling-decisions/korri-cli-exit-code-contract-2026-07-03.md`
- **Module**: korri-cli
- **Problem Type**: `tooling_decision`
- **Relevance**: Any new CLI command surfaces for stream quality (floor/startup/ceiling grammar, preflight probe, downshift triggers) must route through the canonical exit-code table and `renderOutcome`. Competing numbering schemes have already been consolidated; any addition that invents new codes outside the table is a contract violation.
- **Key Insights**:
  - Canonical table owned by `product/surfaces/terminal/korri-cli/cli-outcome.ts`.
  - Relevant codes for stream-quality work: `3` (not-found), `5` (host-unreachable), `6` (host-service-off), `9` (host-refused — includes preflight rejection), `10` (launch-failed — game started but exited non-zero), `11` (stop-pending).
  - **A failed launch reports the game's own exit code in the message and returns `10`** — does not leak the child code as korri's process code.
  - The standalone `foreground-session-status` binary still uses its own `0/2/20/30` scheme; folding it onto this table is a separate follow-up.
  - Changing a command's failure code is a public-contract change: update table + `renderOutcome` + tests together, never silently.

---

### 8. Explicit Cascade-Folded Policy Over Heuristics — launch quality composition

- **File**: `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`
- **Module**: korri/shared/library/config, stream-control
- **Problem Type**: `design_pattern`
- **Relevance**: Launch startup profiles, floor/startup/ceiling constraints, and preflight-derived launch quality must all be expressed as named, cascade-folded policy fields — never as argv/env sniffing or wrapper-side inference. This pattern has bitten three subsystems already.
- **Key Insights**:
  - **Intent must be explicit in cascade policy fields.** The component that knows a fact records it. The composer emits strictly from the resolved policy with no branching on incidental signals.
  - **Provide a correct-for-typical-deployment default.** The floor of the cascade encodes the production deployment shape. Callers in atypical deployments override per-game/launcher in YAML; common-case callers need not think about the field at all.
  - **Delete the heuristic when you ship the field.** Leaving a heuristic alongside a new explicit policy field creates a parallel universe where both can disagree and the loser is silent.
  - **Why this matters for quality selection**: a preflight-derived quality profile or floor/ceiling envelope must be a named field on the launch policy (e.g. `streamQuality: { floor: ..., startup: ..., ceiling: ... }`), not inferred from network conditions at compose time without a stable policy seam.
  - Same-pattern siblings: input-bus action source tagging, Electrobun active-focus attribute.

---

### 9. Generic Stream Runner Validation Runbook

- **File**: `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`
- **Module**: korri-game-stream, sunshine, moonlight
- **Problem Type**: `workflow_issue`
- **Severity**: medium
- **Relevance**: Acceptance runbook for validating any stream-quality change that touches the Sunshine/Moonlight path. Captures critical gotchas that made failures look like runner bugs when they were contract/workflow misunderstandings.
- **Key Insights**:
  - **Enqueue first, then launch.** The intent is one-shot. If you launch `Korri Stream` without a fresh intent, the runner will fail (preflight failure) and not overwrite the prior status — which looks like a regression but is by design.
  - **Check Sunshine as a user service, not a system unit.** `systemctl status sunshine` returns exit code `4` because there is no system unit. Use `systemctl --user status sunshine`.
  - **Two Moonlight entries in the app list are different.** `Korri Stream` → generic runner requiring a pending intent. `Korri Stream Profile` → host display/profile app; does not exercise the runner.
  - **`status.json` is the primary low-friction diagnostic** (user mode: `$XDG_RUNTIME_DIR/korri-game-stream/status.json`; system mode: `/run/korri-game-stream/status.json`). Use this before reaching for Sunshine journals.
  - **Validation target must stay generic.** Do not validate the generic runner by turning Sunshine into a per-game launcher. Smoke with a Nixpkgs game (`supertux`, `extremetuxracer`) to preserve the contract.
  - **References**: `work/01KRW63S14EZX008ANYWY3P8Z1-feat-headless-game-stream-runner/`, `work/01KRYRGG160HR51KYGS0E53ZQG-feat-korri-cli-stream-launch/requirements.md`

---

### 10. Above-Launch-Ceiling Resolution Clamping (patch 0019)

- **File**: `work/items/parking-lot/01KWSYPQ0VW56DS0EK1E5Q5VQD-make-above-launch-ceiling-resolution-requests-clamp-or-expla.md`
- **Module**: moonlight-embedded-korri, stream-control CLI
- **Problem Type**: `tooling_decision` (inferred)
- **Relevance**: The resolution ceiling clamp is compile-verified but has an unconfirmed device validation gate (blocked by bandai↔aka federation disconnect on 2026-07-05). The plan must include a device verification step for this.
- **Key Insights**:
  - **Patch 0019 clamps above-ceiling resolution requests per-dimension**, preserving aspect ratio for same-ratio requests (e.g. 1920×1080 → 1280×720 on a 720p-launched stream). Chosen behavior is clamp (matches bitrate/FPS coercion posture), not explicit reject.
  - **Residual**: on-device runtime verification that an above-ceiling request coerces instead of failing is pending. Genuinely non-ceiling failures (conflict/unsupported/host error) still surface as the generic CLI message `runtime command dispatch failed` — a follow-up item exists to translate those tags more specifically.
  - **Acceptance test**: `korri stream resolution 1920x1080` on a 720p-launched stream should return a coerced `1280x720` applied result, not `runtime command dispatch failed`.

---

### 11. Gamescope Runtime Control Contract — FIFO serialization

- **File**: `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md`
- **Module**: gamescope-control, stream-control
- **Problem Type**: `architecture_pattern`
- **Relevance**: Stream-quality changes that touch Gamescope (scaling, filter, framerate) must go through the bridge-level typed protocol and its FIFO queue — the same serialization lesson the runtime-settings contract has for Moonlight.
- **Key Insights**:
  - **`applied` only after required readback matches.** Readback mismatch, readback failure, timeout, backend absence, and session abort are explicit non-success states.
  - **Mutations serialize through one bridge-wide FIFO queue.** No concurrent writes to shared compositor state.
  - **No high-level quality-profile command in v1.** Product code calls individual controls. Multi-plugin stream control coordination is a backlog item (`01KVBPNPXZ3X49XSCFXPY6CVW8`).
  - **Capability-gate stock Gamescope.** `gamescope-korri` is the guaranteed target; stock Gamescope is best-effort and must be capability-gated.
  - **Verification reference**: `docs/acceptance/gamescope-control-api-coverage-contract.md` as the method/event/error coverage matrix.

---

### 12. Stream CLI Noun Decision — settle before the surface hardens

- **File**: `work/items/parking-lot/01KWTMPE4MJXVR940R4X9GB0PR-reconsider-stream-as-a-first-class-cli-noun-vs-an-implementa.md`
- **Module**: korri-cli, streaming
- **Problem Type**: `tooling_decision` (inferred)
- **Relevance**: The floor/startup/ceiling CLI grammar is being designed now. This item flags that the decision of whether these controls attach to a `stream` noun or to the game/session/launch should be settled before the surface hardens.
- **Key Insights**:
  - **Current posture**: adaptive quality controls (bitrate/fps/resolution/lean/auto boundaries) are under `korri stream ...`, treating 'stream' as a first-class concept.
  - **Competing view**: streaming is an implementation detail of playing a remote game. Boundaries should attach to the game/session/launch (`korri play --bitrate-floor=... --fps-ceiling=...`), with no separate stream noun. Same flat key=value boundary schema on launch and on the running session.
  - **Shared constraint regardless**: the design must support live mid-session adjustment and observability (watch feed) without reintroducing a separate stream concept if stream is retired.
  - **Action required**: settle this before the floor/startup/ceiling grammar is implemented. Record the decision in the task-067 spec so CLI and future GUI share one noun model.

---

## Recommendations

### Ordered by execution sequence

**1. Read and gate against `docs/acceptance/runtime-settings-protocol-contract.md` before every design decision.**
All planned work (preflight, floor/startup/ceiling grammar, continuous controller, downshift) must comply with this contract. Specifically: capability before mutation, accepted ≠ applied, global serialization, accept-and-adapt, scale-only-never-stretch, explicit recovery.

**2. Close Layer 3 (U-A + U-B) before shipping an autonomous adaptive controller.**
The plan (`docs/korri-stream-layer3-safety-net-scope.md`) is already scoped. Both gaps must close: global cross-family latch (U-A, `01KWN2KEGW61TJ54X13JP0BTZ2`) and decode-confirmed applied-truth with auto-revert (U-B, `01KWN2M3GSW2FQST7F3M7RX0V2`). Build these together in one moonlight patch-export checkout. Do not build a poller or screen-scraper for U-B — the mechanism lives in the client's decode loop.

**3. Confirm the above-ceiling clamp (patch 0019) on device before building the ceiling grammar.**
The patch is compile-verified but not device-verified (blocked by bandai↔aka federation disconnect). Re-pair the devices and run `korri stream resolution 1920x1080` on a 720p-launched stream to confirm coercion, not a generic failure. See `docs/acceptance/runtime-settings-gate-a-accept-and-adapt-2026-07-03.md` for the Gate-A runbook.

**4. Use the seamlessness findings to set lever priorities in the continuous controller.**
Bitrate: ~0ms, use freely. FPS: ~0ms, use freely. Resolution: ~200ms host-bound, use rarely with strong hysteresis. Do not invert this ordering. See `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md`.

**5. Settle the `korri stream` noun vs game/session/launch boundary before implementing the floor/startup/ceiling grammar.**
Blocking decision. See `01KWTMPE4MJXVR940R4X9GB0PR`. Record the choice in the task-067 spec before the CLI hardens.

**6. Express floor/startup/ceiling as named cascade-folded policy fields, not runtime inference.**
Follow the explicit cascade-folded policy pattern (`docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`). The preflight-derived launch profile, floor/ceiling constraints, and handoff override must all be named fields in the stream launch policy — not inferred from argv/env at compose time.

**7. Route all CLI stream quality command outcomes through `renderOutcome` in `cli-outcome.ts`.**
See `docs/solutions/tooling-decisions/korri-cli-exit-code-contract-2026-07-03.md`. Preflight rejection is exit code `9` (host-refused). No new exit codes without updating the table, `renderOutcome`, and tests together.

**8. For stream runner validation: enqueue intent first, verify `status.json`, use a generic Nixpkgs smoke target.**
See `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md`. The runbook distinguishes the two Moonlight app entries, the user vs system service scope, and the one-shot intent model.

**9. Treat h264\_vaapi + v4l2m2m as the only proven live-control path.**
Bitrate/FPS: supported (validated 2026-05-31). Resolution: server-applied but not client-decode-proven (needs U-B). Other codecs/encoders are diagnostic-only until separately validated. See `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`.

**10. Preflight probe: iperf3 vs lightweight product-owned probe decision must happen early.**
Item `01KWX9Q78A1BQ5AAAANNM4SCRJ` is un-decided on whether iperf3 (accurate but requires setup/latency) or a product-owned lighter probe (less friction) is the right shape. Capture the tradeoff analysis before designing the probe-to-launch-profile mapping.

**11. Handoff-aware downshift is separate from preflight.**
Preflight: before the stream starts (launch quality selection). Handoff downshift: while the stream is running (preemptive rescue on network transition). Do not merge these into one mechanism. See `01KWX9Q78CY3QNQ5BXV1BJ47ER`.

**12. Emergency mode unification (replacing shed/emergency burst with unified controller) should be the last item.**
It depends on having the continuous controller working first. It is a design-debt exploration, not a new capability. See `01KWX6X2C5RZ08BTG9FSXYBHNY`. Current shed/emergency path works; this is about principle, not rescue.

---

## Acceptance / Runbook Reference Paths

All paths are repo-relative.

| Runbook / Contract | Path |
|---|---|
| Runtime settings protocol contract | `docs/acceptance/runtime-settings-protocol-contract.md` |
| Gate A: accept-and-adapt device validation | `docs/acceptance/runtime-settings-gate-a-accept-and-adapt-2026-07-03.md` |
| Seamless bitrate on SM8550 (h264\_vaapi + v4l2m2m) | `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md` |
| Runtime resolution evidence (server-applied, not client-proven) | `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md` |
| Moonlight live-settings validation — Sobo | `docs/acceptance/moonlight-live-settings-validation-sobo-2026-05-25.md` |
| Gamescope control API coverage contract | `docs/acceptance/gamescope-control-api-coverage-contract.md` |
| Gamescope scaling policy | `docs/acceptance/gamescope-scaling-policy.md` |
| Resolution switch seamlessness findings | `docs/korri-stream-resolution-switch-seamlessness-findings-2026-07-05.md` |
| Layer 3 safety net scope | `docs/korri-stream-layer3-safety-net-scope.md` |
| Generic stream runner validation contract | `docs/solutions/workflow-issues/generic-game-stream-runner-validation-contract-2026-05-19.md` |

| Architecture Pattern | Path |
|---|---|
| Stream-control command outcome contract | `docs/solutions/architecture-patterns/stream-control-command-outcome-contract-2026-06-03.md` |
| Gamescope runtime control contract | `docs/solutions/architecture-patterns/gamescope-runtime-control-contract-2026-06-02.md` |
| Gamescope as plugin-owned composition | `docs/solutions/architecture-patterns/gamescope-as-plugin-owned-composition-2026-06-17.md` |
| Kiosk foreground app policy | `docs/solutions/architecture-patterns/kiosk-foreground-app-policy-over-gamescope-overlay-2026-05-24.md` |
| Korrid device state (battery for stream-control) | `docs/solutions/architecture-patterns/korrid-device-state-subscriptionref-2026-07-01.md` |

| Design Pattern | Path |
|---|---|
| Explicit cascade-folded policy over heuristics | `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md` |

| Tooling Decision | Path |
|---|---|
| CLI exit-code contract | `docs/solutions/tooling-decisions/korri-cli-exit-code-contract-2026-07-03.md` |

| Active / Parking-Lot Items | Path |
|---|---|
| Adaptive stream controller (continuous, not a ladder) | `work/items/active/01KSXN94148T4616TA79KHQD9T-adaptive-stream-controller/item.md` |
| Preflight probe for launch quality selection | `work/items/parking-lot/01KWX9Q78A1BQ5AAAANNM4SCRJ-add-preflight-probe-for-stream-launch-quality-selection.md` |
| Handoff-aware preemptive downshift | `work/items/parking-lot/01KWX9Q78CY3QNQ5BXV1BJ47ER-add-handoff-aware-preemptive-stream-downshift.md` |
| Explore replacing emergency mode with unified controller | `work/items/parking-lot/01KWX6X2C5RZ08BTG9FSXYBHNY-explore-replacing-explicit-stream-emergency-mode-with-unifie.md` |
| `stream` noun vs game/session noun decision | `work/items/parking-lot/01KWTMPE4MJXVR940R4X9GB0PR-reconsider-stream-as-a-first-class-cli-noun-vs-an-implementa.md` |
| Above-ceiling clamp verification (device-pending) | `work/items/parking-lot/01KWSYPQ0VW56DS0EK1E5Q5VQD-make-above-launch-ceiling-resolution-requests-clamp-or-expla.md` |
| Global one-at-a-time latch (U-A) | Backlog: `01KWN2KEGW61TJ54X13JP0BTZ2` |
| Decode-confirmed applied-truth + auto-revert (U-B) | Backlog: `01KWN2M3GSW2FQST7F3M7RX0V2` |
| Bitrate/FPS coercion (patch-export) | Backlog: `01KWN2KEGT3NGTJZ6SHDRJ3YEG` |
| Host arbitrary-ratio + letterbox | Backlog: `01KWN5M3AQR7TVMDDB0FHQ29GA` |
