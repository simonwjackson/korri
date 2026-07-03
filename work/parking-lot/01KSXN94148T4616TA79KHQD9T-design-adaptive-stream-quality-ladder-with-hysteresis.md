---
id: 01KSXN94148T4616TA79KHQD9T
slug: design-adaptive-stream-quality-ladder-with-hysteresis
title: Design adaptive stream quality ladder with hysteresis
origin: parked
legacy: task-067
status: To Do
priority: medium
labels:
  - runtime-settings
  - adaptive-streaming
  - quality-ladder
  - product-policy
created: 2026-05-31
source: user
---

# Design adaptive stream quality ladder with hysteresis

## Why it matters

For heavy network fluctuations, bitrate is the bandwidth lever while FPS and resolution control pixels-per-second and perceived quality under that bitrate. Treating resolution as an independent quick knob risks unstable oscillation, reconnects, or worse image quality; the product needs a coherent ladder that changes bitrate, FPS, and eventually resolution together with recovery rules.

## Acceptance Criteria

- [ ] Define a conservative ladder from healthy network to emergency mode, including bitrate, FPS, and optional resolution targets for each rung.
- [ ] Add hysteresis/cooldown rules so transient network status changes do not flap between quality levels.
- [ ] Keep h264_vaapi as the default proven path for live controls until the support matrix proves other codecs/encoders.
- [ ] Specify when product policy should use resolution changes, based on validated Korri profiles, applied-state observability, cooldown, and recovery behavior.
- [ ] Document operator-visible behavior: what users see during quality drops, recovery, command rejection, and unsupported encoder/client cases.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `./01KSXN940WHC4SJ684MBEH0JNW-integrate-live-bitrate-controls-into-product-launches.md`
- `./01KSXN940Y4B1TE24SNM4QM0RW-harden-live-bitrate-capability-and-safety-guardrails.md`
- `./01KSXN9412G9QBBR5Q6K6B6SDX-define-live-bitrate-support-matrix-and-compatibility-scope.md`
- `packages/moonlight-embedded-korri/README.md`
- `packages/sunshine-korri/README.md`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`

## Notes

Mental model captured from testing: setting FPS 120→30 at the same bitrate changed frame pacing but left bitrateKbps unchanged; to reduce bandwidth, lower bitrate explicitly. Resolution scaling should be a tertiary lever that makes low bitrate more watchable by reducing pixels/sec, not a substitute for bitrate control.

2026-07-03 direction correction (user north star): this is NOT a hard list of predetermined rungs. The intended design is a continuous, math-driven controller that computes the best combination of bitrate/FPS/resolution for the measured network conditions in the moment, and scales settings up and down continuously to meet them. Requirements:

- No fixed table of blessed quality levels. The controller derives targets mathematically from live measurements (throughput, latency, loss). Any internal ladder is at most a damping/fallback representation, not the source of allowed values.
- Objective-parametrized: optimize for a chosen goal on a latency-versus-throughput/quality axis. The objective is a tunable bias, later surfaceable as a slider (GUI, deferred to the end), defaulting to fully automatic under the hood.
- Triggered by changing conditions, including mobility/roaming (on the road, network changes) and general network fluctuation, continuously — not only at discrete thresholds.
- Depends on accept-and-adapt: the controller emits arbitrary computed values, so the mechanism must accept any value and coerce to the nearest achievable (clamp + even-round + host letterbox), never reject for not matching a preset. Accept-and-adapt work (resolution coercion shipped; bitrate/FPS clamp 01KWN2KEGT3NGTJZ6SHDRJ3YEG; host arbitrary-ratio + letterbox 01KWN5M3AQR7TVMDDB0FHQ29GA) is the foundation this controller sits on.
- Damping/hysteresis still applies, but around a continuous setpoint (avoid oscillation/flapping), not by snapping between named rungs.

The word "ladder" in this item's title is legacy; treat the deliverable as a continuous adaptive controller with an objective bias, not a preset ladder.
