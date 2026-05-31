# sunshine-korri

`sunshine-korri` is Korri's downstream Sunshine package for carried patches that are useful to Korri before they are upstreamed, redesigned, or retired.

The package is intentionally an umbrella, not a single-feature fork. Patches may be unrelated. Each patch should explain:

- what behavior it changes,
- whether it is experimental or intended for upstreaming,
- what evidence exists,
- when it can be removed.

## Current patches

### Runtime settings patch series

Experimental live runtime-settings MVP split by review concern:

- `0001-add-runtime-settings-protocol-surface.patch` adds packet IDs `0x5504`/`0x5505`, runtime-settings operations, statuses, reasons, request/ack structs, and mail names.
- `0002-wire-runtime-settings-control-plane.patch` adds the Sunshine control-plane parser, `SUNSHINE_LIVE_SETTINGS_MVP=1` gate, capability acks, mutation acks, launch/current-applied baselines, and request queueing.
- `0003-apply-runtime-bitrate-and-fps-changes.patch` introduced safe rejection for active-stream operation `1` and supports operation `2`: set effective stream FPS at or below launch FPS using runtime frame pacing.
- `0004-add-proof-gated-runtime-resolution-apply-path.patch` applies operation `3` with same-or-smaller same-aspect even dimensions, refreshes touch mapping after apply, and keeps runtime resolution proof-gated until client survival evidence exists.
- `0005-add-seamless-vaapi-runtime-bitrate-path.patch` enables operation `1` for the supported `h264_vaapi` path by mutating FFmpeg VAAPI rate-control private state, forcing an IDR, and avoiding encoder teardown/reconnect.
- Active-stream bitrate changes are advertised only for the seamless `h264_vaapi` VAAPI path; no reconnect or encoder-restart fallback is considered shippable.
- Runtime FPS is currently limited to `h264_vaapi` via Sunshine's AVCodec/VAAPI path.
- The series does not use the failed public AVCodec field/AVOption mutation fallback.

Runtime settings mechanism contract:

- Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy.
- Runtime settings decisions distinguish local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof as separate facts.
- Existing packet IDs remain stable: request `0x5504` and ack `0x5505`.
- Operation `0` is a non-mutating capability query for the active Sunshine session.
- Operation `0` returns a `0x5505` capability ack with gate status, reason, active-session supported operations, conservative bounds, launch baseline values, and current applied bitrate/FPS/resolution facts.
- Launch baseline bitrate, FPS, and resolution are tracked separately from current applied values for the lifetime of the stream.
- Restore is explicit: callers send normal set commands back to the launch baseline values; Sunshine does not auto-restore from network or command outcomes.
- Operations `1`, `2`, and `3` remain bitrate, FPS, and resolution mutation requests.
- Mutation acks carry the broad numeric status plus an additive reason field; current no-reason consumers must be updated before relying on reason-bearing payloads.
- Runtime resolution remains experimental/proof-gated; operation `0` does not advertise it as a production adaptive operation from a server ack alone.
- Runtime resolution proof gate: operation `3` is listed as proof-gated, not supported, in capability acks until same-session target-client proof exists.
- Capability support is conservative: active-stream bitrate and FPS are advertised only for the explicit live-settings gate on an active H.264 session using the supported VAAPI path; unsupported sessions return a reason without setting support bits.
- Operation `1` support requires same-session moving-video and bandwidth proof on the target client before it is treated as product-ready for that client/decoder combination.
- Operation `3` outcomes distinguish Sunshine-applied from client-proven: Sunshine may report `server_applied=1`, but `client_proven` remains `0` without device/client render evidence.

Runtime settings status contract:

- `0` — applied
- `1` — failed or unsupported
- `2` — invalid
- `3` — disabled

Reason codes:

- `none`
- `gate-disabled`
- `invalid-bounds`
- `invalid-payload`
- `unsupported-encoder`
- `unsupported-backend`
- `unsupported-operation`
- `apply-failed`
- `control-not-ready`
- `no-ack`
- `conflict`
- `stale-ack`
- `stream-ended`
- `proof-gated`

Current review gates:

- `nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link` is the source invariant/build check for packet IDs, operation IDs, capability query, reason fields, timeout/conflict markers, baseline tracking, and resolution proof-gate markers.
- Existing FPS live evidence proves the `h264_vaapi` applied path. SM8550/v4l2m2m evidence now proves seamless `h264_vaapi` bitrate changes with moving video and bandwidth deltas. Disabled, invalid, unsupported, timeout, conflict, command-not-advertised, and stale-ack outcomes are covered by source invariants and/or documented smoke evidence.
- Runtime resolution requires same-session target-client proof before it can be advertised as supported.

Evidence is recorded in:

- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`
- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`

## Removal/upstream policy

Remove or replace a carried patch when one of these becomes true:

1. Sunshine upstream accepts an equivalent feature.
2. Korri no longer needs the behavior.
3. A cleaner patch supersedes the current one.
4. The evidence shows the approach is unsafe or too narrow for continued carrying.
