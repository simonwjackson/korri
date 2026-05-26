# sunshine-korri

`sunshine-korri` is Korri's downstream Sunshine package for carried patches that are useful to Korri before they are upstreamed, redesigned, or retired.

The package is intentionally an umbrella, not a single-feature fork. Patches may be unrelated. Each patch should explain:

- what behavior it changes,
- whether it is experimental or intended for upstreaming,
- what evidence exists,
- when it can be removed.

## Current patches

### `0001-runtime-bitrate-restart-mvp.patch`

Experimental live bitrate-control MVP:

- Adds Sunshine control packet `0x5504` for runtime settings requests.
- Adds Sunshine control packet `0x5505` for structured acks.
- Supports operation `1`: set stream bitrate in kbps.
- Supports operation `2`: set effective stream FPS at or below the launch FPS.
- Supports operation `3`: set stream resolution to same-or-smaller same-aspect even dimensions.
- Requires `SUNSHINE_LIVE_SETTINGS_MVP=1`.
- Only `h264_vaapi` via Sunshine's AVCodec/VAAPI path is currently supported.
- Recreates the active AVCodec/VAAPI encoder session with the requested bitrate or resolution.
- Applies runtime FPS as experimental frame pacing without renegotiating stream resolution or client capabilities.
- Runtime resolution remains experimental until client-side decode/render survival evidence is recorded.
- Does not use the failed AVCodec field/AVOption mutation fallback.
- Verified on `aka` with `h264_vaapi` and Moonlight receiving `status=0` acks.

Runtime settings mechanism contract:

- Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy.
- Runtime settings decisions distinguish local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof as separate facts.
- Existing packet IDs remain stable: request `0x5504` and ack `0x5505`.
- Operation `0` is a non-mutating capability query for the active Sunshine session.
- Operation `0` returns a `0x5505` capability ack with gate status, reason, supported operations, conservative bounds, and current applied bitrate/FPS/resolution facts.
- Operations `1`, `2`, and `3` remain bitrate, FPS, and resolution mutation requests.
- Mutation acks carry the broad numeric status plus an additive reason field; current no-reason consumers must be updated before relying on reason-bearing payloads.
- Runtime resolution remains experimental/proof-gated; operation `0` does not advertise it as a production adaptive operation from a server ack alone.

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

Evidence is recorded in:

- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`

## Removal/upstream policy

Remove or replace a carried patch when one of these becomes true:

1. Sunshine upstream accepts an equivalent feature.
2. Korri no longer needs the behavior.
3. A cleaner patch supersedes the current one.
4. The evidence shows the approach is unsafe or too narrow for continued carrying.
