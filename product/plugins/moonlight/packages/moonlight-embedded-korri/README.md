# moonlight-embedded-korri

`moonlight-embedded-korri` is Korri's downstream Moonlight Embedded package.

It layers on top of the nix-on-rocks Moonlight Embedded package inputs:

- nix-on-rocks owns the base SM8550/v4l2m2m Moonlight patch stack.
- Korri owns only the patches in this directory.

## Korri configuration surfaces

Korri intentionally keeps four Moonlight-related surfaces separate:

1. **Readable launch policy** — product configuration under `host.moonlight`, profile `moonlight`, or another readable cascade layer. It renders `moonlight stream` argv/env through Korri's typed `MoonlightPolicy`: command, stream dimensions/FPS/bitrate, platform name, mapping file, absolute-touch launch flags, auto-window-resize, process env overlays, local-control enablement/authority, and extra args.
2. **Local-control socket launch env** — per-spawn `MOONLIGHT_LOCAL_CONTROL_*` values allocated by the launcher when `moonlight.control.enable` is true. Readable policy can request a socket and choose authority, but the socket path/session id/runtime dir are runtime facts for that spawned process.
3. **Runtime command protocol** — JSON local-control messages implemented by the running Moonlight process. Command availability is advertised by `protocol.hello` / `state.snapshot` capabilities. It is not configured by readable policy; `moonlight.control.commands` is intentionally rejected by Korri config.
4. **Experimental runtime-settings env hooks** — downstream smoke-test hooks named `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_*` and `MOONLIGHT_RUNTIME_SETTINGS_MVP_*`. These remain experimental launch environment for patch validation and platform defaults; they are not the product adaptation policy.

Readable launch policy does not expose Moonlight actions, Sunshine app name, peer host, Moonlight config-file load/save, resolution presets, platform provenance, or an InputPlumber toggle. Korri product launches always render the `stream` action, inject the selected host, use the fixed Sunshine app `Korri Stream`, and rely on launcher preflight for required InputPlumber input.

## Korri patches

### `0004-add-absolutetouch-flag-for-tap-to-click.patch`

Adds `-absolutetouch` for handheld touchscreen tap-to-click over the stream. On dual-screen or split-touch devices, `-absolutetouchbounds x,y,w,h` narrows absolute touch to one raw ABS rectangle so touches outside the streamed game region are ignored instead of remapped into the game.

Static `-absolutetouchbounds` is a fallback/manual diagnostic seam. Managed dynamic sessions should use local-control runtime touch-bounds updates so moved, resized, or reshaped stream surfaces do not keep stale launch-time geometry.

### Sunshine runtime-settings patch series

Adds an experimental Sunshine runtime-settings request sender and ack logger for the `0x5504` / `0x5505` MVP protocol, split by review concern:

- `0005a-add-sunshine-runtime-settings-protocol-sender.patch` adds the Moonlight-common protocol constants, request payloads, and public `LiSendSunshineRuntimeSettingsMvp()` / capability-query entrypoints.
- `0005b-track-sunshine-runtime-settings-command-outcomes.patch` adds ack parsing, capability state, command lifecycle tracking, timeout/stale-ack handling, explicit current-applied state, and fail-closed capability validation.
- `0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch` adds the Linux timerfd-backed one-shot environment hook for manual runtime-settings smoke tests.
- `0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch` adds the opt-in connection-status spike adaptation experiment for bitrate/FPS only.

One-shot runtime settings requests are controlled by launch environment. Korri v1 readable policy does not model these hooks as first-class fields; platform defaults may render the raw env through `moonlight.environment` until the hook graduates. This env does not advertise runtime command support and does not prove that the host applied a command.

- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_KBPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION` (for example `1280x720`)
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED=1` remains a diagnostic-only escape hatch for hosts that advertise a proof-gated operation, not the Korri product path.

Connection-status adaptation experiments are spike-only and require `MOONLIGHT_RUNTIME_SETTINGS_MVP_ENABLE_SPIKE_ADAPTATION=1`. They remain outside v1 readable `MoonlightPolicy`; `moonlight.runtimeSettings` is intentionally rejected. The spike is controlled by:

- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_COOLDOWN_S`

Resolution requests are one-shot only; connection-status adaptation intentionally remains limited to bitrate/FPS experiments so product quality-ladder policy composes individual operations separately.

This is experimental and should remain gated until Sunshine-side capability negotiation is formalized. Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy. Runtime settings decisions distinguish local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof as separate facts. The current connection-status adaptation is spike-only and must not become the product adaptation path.

Runtime settings mechanism contract:

- Existing packet IDs remain stable: request `0x5504` and ack `0x5505`.
- Operation `0` is a non-mutating capability query for the active Sunshine session; one-shot validation requests send a capability query before the delayed mutation command.
- Moonlight records launch baseline bitrate, FPS, and resolution separately from current applied values when parsing capability acks.
- Restore is explicit: callers send normal set commands back to the launch baseline values; Moonlight does not auto-restore from network or command outcomes.
- Operations `1`, `2`, and `3` remain bitrate, FPS, and resolution mutation requests.
- Moonlight keeps bounded per-operation command state and serializes mutations globally: a new bitrate/FPS/resolution command is rejected with `conflict` while any mutation of any family is in flight, so a bitrate change cannot race a resolution encoder rebuild. The capability query (operation `0`) stays per-family and is exempt in both directions, so an in-flight mutation never blocks startup capability learning and vice versa. Moonlight records terminal `host-applied`, `host-rejected`, `timed-out`, `stale-ack-observed`, and `stream-ended` outcomes.
- Runtime settings command timeout is currently 3000 ms; an expired command records `timed-out` with reason `no-ack`, and a later matching ack is treated as stale diagnostic input.
- Moonlight parses both legacy no-reason mutation acks and additive reason-bearing acks while Sunshine and Moonlight patch payloads transition together.
- Runtime resolution is a normal runtime-settings operation for the validated Korri profile when operation `0` advertises support.
- Resolution requests are coerced, not rejected: local control clamps width/height to encoder-safe bounds and rounds to even before dispatch (accept-and-adapt), per the runtime-settings protocol contract's accept-and-adapt and never-stretch principles.
- Bitrate and FPS requests are likewise coerced, not rejected: local control clamps the requested value to the advertised encoder-safe min/max before dispatch, and the clamped value flows through applied-truth readback so out-of-range requests land at the nearest bound instead of erroring.
- Capability-gated dispatch: mutation commands are rejected locally when operation `0` has not advertised support.
- Operation `3` outcomes distinguish raw Sunshine ack state from caller-visible applied truth: Moonlight records Sunshine `server_applied=1` separately from applied width/height state used by local-control.
- Local command acceptance is non-terminal; host-applied outcomes or target-client proof arrive later through the runtime-settings mechanism/local-control handoff.
- Connection-status adaptation is spike-only and disabled unless `MOONLIGHT_RUNTIME_SETTINGS_MVP_ENABLE_SPIKE_ADAPTATION=1` is set.

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

Internal lifecycle values are `locally-rejected`, `accepted`, `sent`, `host-applied`, `host-rejected`, `timed-out`, `stale-ack-observed`, and `stream-ended`.

Current review gates:

- `nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link` is the source invariant/build check for packet IDs, operation IDs, capability query, reason fields, timeout/conflict markers, baseline tracking, and supported runtime-resolution markers.
- Existing bitrate/FPS live evidence proves the `h264_vaapi` applied path, and runtime-resolution evidence proves operation `3` for the validated Korri profile; disabled, invalid, unsupported, timeout, conflict, command-not-advertised, and stale-ack outcomes are covered by source invariants and/or documented smoke evidence.

Evidence is recorded in:

- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`
- `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`

## Moonlight local control protocol

The local control protocol is experimental downstream Moonlight Embedded functionality. It is a generic Moonlight session protocol, not a Korri-private log format or launcher API.

Version 1 is Linux-only local IPC over a filesystem Unix-domain socket created for a running `moonlight stream ...` process. A launcher supplies the session id and socket path under a private runtime directory; Moonlight owns the socket server for that stream process. LAN, HTTP, mDNS, Tailscale, browser-facing APIs, host discovery, pairing, and app launch orchestration are intentionally out of scope for this protocol.

The TypeScript contract in `product/platform/stream/moonlight-control-protocol.ts` defines the reviewable v1 message model before the native server is enabled:

- JSON-RPC-compatible request/response envelopes with newline-delimited JSON framing.
- `protocol.hello` for protocol metadata, session identity, authority, capabilities, and bounds.
- `state.snapshot` for late attachers to read lifecycle, shallow quality/adaptation, runtime settings, and input route facts.
- Ordered `moonlight.event` notifications with `seq` and monotonic timestamps so consumers can detect gaps and resync with `state.get`.
- Separate observer and controller authority. Read-only observability is the default; mutation commands require command-capable authority.
- Narrow command names only: request IDR, set bitrate, set FPS, and set resolution when advertised by capabilities.
- Local command responses describe local validation/acceptance only. Host-applied outcomes arrive later as correlated command-result events.

Consumers must ignore unknown additive fields and unknown event names. Breaking schema changes require a protocol major-version bump. Command values are bounded before native dispatch: bitrate, FPS, and resolution values must pass the v1 contract limits, only one mutation per command family may be in flight, and senders must honor the advertised command interval/backoff.

### `0006-add-local-control-observability-ipc.patch`

Adds the first local control socket scaffolding behind explicit environment configuration:

- `MOONLIGHT_LOCAL_CONTROL_SOCKET` — absolute filesystem Unix socket path.
- `MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR` — private launcher-owned runtime directory that must own the socket path.
- `MOONLIGHT_LOCAL_CONTROL_SESSION_ID` — launcher-generated session id returned by `protocol.hello` and `state.snapshot`.
- `MOONLIGHT_LOCAL_CONTROL_AUTHORITY` — `observer` by default, or `controller` to advertise command capability once mutation hooks are enabled.
- `MOONLIGHT_LOCAL_CONTROL_ALLOW_ROOT=1` — explicit opt-in for root peers in addition to same-UID peers.

The socket server rejects unsafe runtime directories, socket paths outside the runtime directory, non-socket stale paths, unauthorized peer credentials, blank frames, malformed JSON, and oversized frames. It serves `protocol.hello`, `state.get`, and `events.subscribe` for local observability.

### `0007-wire-local-control-runtime-command-events.patch`

Wires the first native local-control mutation path for controller-authorized running streams:

- `runtime.setBitrate` dispatches to runtime-settings operation `1` only when the active Sunshine capability ack advertises bitrate support.
- `runtime.setFps` dispatches to runtime-settings operation `2` only when the active Sunshine capability ack advertises FPS support.
- JSON-RPC response IDs remain transport correlation IDs; accepted command responses return a native numeric `requestId` used for Sunshine dispatch and later `runtime.commandResult` events.
- Runtime-settings capability and terminal outcome facts are handed to local-control through a narrow observer seam rather than log scraping.
- Subscribed local-control clients receive bounded `runtime.commandResult` events with monotonic sequence/timing metadata, and `state.get` exposes the latest terminal command for sequence-gap recovery.
- `runtime.setResolution` dispatches to runtime-settings operation `3` only when the active Sunshine capability ack advertises resolution support.

### `0012-add-runtime-touch-bounds-control.patch`

Adds the local input command path for dynamic absolute-touch geometry:

- `input.setTouchBounds` accepts raw touchscreen ABS `{ x, y, w, h }` bounds over Moonlight local-control and updates the client-side evdev filter without restarting the stream.
- The command is Moonlight-local input control, not a Sunshine runtime setting. `applied` means the local evdev bounds snapshot was updated; it is not a host-applied runtime-settings proof.
- `state.snapshot.input.absoluteTouch` reports whether absolute touch is enabled, whether bounds are required before sending touches, the active bounds, the primary touchscreen ABS range, and the latest input command result.
- `-absolutetouchrequirebounds` enables managed fail-closed behavior: absolute-touch events are ignored until startup fallback bounds or the first runtime bounds update is active.
- Bounds are stored as one synchronized evdev snapshot instead of independent globals so local-control updates cannot expose partially-updated rectangles to the evdev input loop.

### `0015-crop-coded-alignment-padding-on-present.patch`

Crops Venus/iris coded-alignment padding out of the presented frame:

- The SM8550 decoder exposes coded frame dimensions aligned to 128 (width) and
  32 (height) without crop metadata; the padding is uninitialized chroma that
  renders as solid green bars on the right/bottom for any resolution that is
  not already aligned (854x480, 960x540, 1486x836, ...).
- `local_control.c` publishes the host-applied runtime resolution
  (`runtime.commandResult` applied width/height) to the video layer.
- `frame_visible_width/height` prefer explicit frame crop metadata, then the
  host-applied runtime resolution, then the configured stream size — accepting
  a hint only when the coded dimension exceeds it by no more than the hardware
  alignment slack (127/31). The 16:9 guess remains only as a last resort for
  streams with no known target size.
