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
- `0004-add-proof-gated-runtime-resolution-apply-path.patch` applies operation `3` with same-or-smaller even dimensions whose aspect ratio matches the stream within the sub-pixel tolerance of even-integer rounding (same-ratio scaling, e.g. 854x480 on a 16:9 stream); genuinely different aspect ratios are still rejected so the game is never stretched. Refreshes touch mapping after apply, and is treated as supported for the validated Korri runtime profile. The same-ratio tolerance replaces the former exact same-aspect equality in `0002-wire-runtime-settings-control-plane.patch`.
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
- Runtime resolution is a normal runtime-settings operation for the validated Korri profile; operation `0` advertises operation `3` only when the active session supports it.
- Capability support is conservative: active-stream bitrate, FPS, and resolution are advertised only for the explicit live-settings gate on an active H.264 session using the supported VAAPI path; unsupported sessions return a reason without setting support bits.
- Operation `1` support requires same-session moving-video and bandwidth proof on the target client before it is treated as product-ready for that client/decoder combination.
- Operation `3` outcomes distinguish raw Sunshine ack state from caller-visible applied truth: Sunshine may report `server_applied=1`, while local-control must still expose applied width/height state for callers to verify.

VAAPI runtime-bitrate maintenance policy:

- A stable FFmpeg helper/API is the preferred replacement for Sunshine-side private-struct mirroring, but Korri is not carrying that downstream FFmpeg API yet. The current path stays inside `sunshine-korri` because it has SM8550 evidence and avoids forking FFmpeg's encoder internals before an upstreamable helper shape is clear.
- The private mirror is allowed only for the exact pinned FFmpeg/libavcodec version encoded in the patch. FFmpeg upgrades, including same-major minor/micro updates, must fail at compile/source-check time until the mirrored VAAPI layout is reviewed.
- Rollback remains the Nix-owned live-settings gate: disable `services.korri.daemon.streaming.runtimeSettings.enable` to keep Sunshine deployed while omitting `SUNSHINE_LIVE_SETTINGS_MVP=1`.

Runtime-resolution VAAPI destructor teardown policy:

- Runtime-resolution replacement crosses an encoder generation boundary: the replacement session is primed with the first post-switch frame and then becomes the active session.
- Destructor drain/flush is skipped only for the AVCodec session pair that participates in that runtime VAAPI replacement path: the outgoing generation and the primed replacement generation. Normal encoder sessions still drain on destruction.
- The evaluated alternatives are pre-drain, async teardown, skip-drain, and packet-drop alternatives. Pre-drain can re-enter the crashing FFmpeg hardware teardown after a generation break; async teardown moves the same lifetime hazard to another thread; packet drop risks hiding required end-of-stream data. Narrow skip-drain is the carried option until physical soak evidence proves a safer upstreamable teardown.
- Long-cycle no-crash and leak evidence belongs with the runtime-resolution hardware soak follow-up; source checks only prove the skip remains narrow and documented.

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

Current review gates:

- `nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link` is the source invariant/build check for packet IDs, operation IDs, capability query, reason fields, timeout/conflict markers, baseline tracking, and supported runtime-resolution markers.
- Existing FPS live evidence proves the `h264_vaapi` applied path. SM8550/v4l2m2m evidence now proves seamless `h264_vaapi` bitrate changes with moving video and bandwidth deltas, and runtime-resolution evidence proves operation `3` for the validated Korri profile. Disabled, invalid, unsupported, timeout, conflict, command-not-advertised, and stale-ack outcomes are covered by source invariants and/or documented smoke evidence.

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
