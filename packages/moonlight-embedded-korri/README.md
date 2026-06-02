# moonlight-embedded-korri

`moonlight-embedded-korri` is Korri's downstream Moonlight Embedded package.

It layers on top of the nix-on-rocks Moonlight Embedded package inputs:

- nix-on-rocks owns the base SM8550/v4l2m2m Moonlight patch stack.
- Korri owns only the patches in this directory.

## Korri patches

### `0004-add-absolutetouch-flag-for-tap-to-click.patch`

Adds `-absolutetouch` for handheld touchscreen tap-to-click over the stream. On dual-screen or split-touch devices, `-absolutetouchbounds x,y,w,h` narrows absolute touch to one raw ABS rectangle so touches outside the streamed game region are ignored instead of remapped into the game.

### Sunshine runtime-settings patch series

Adds an experimental Sunshine runtime-settings request sender and ack logger for the `0x5504` / `0x5505` MVP protocol, split by review concern:

- `0005a-add-sunshine-runtime-settings-protocol-sender.patch` adds the Moonlight-common protocol constants, request payloads, and public `LiSendSunshineRuntimeSettingsMvp()` / capability-query entrypoints.
- `0005b-track-sunshine-runtime-settings-command-outcomes.patch` adds ack parsing, capability state, command lifecycle tracking, timeout/stale-ack handling, explicit current-applied state, and proof-gated validation.
- `0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch` adds the Linux timerfd-backed one-shot environment hook for manual runtime-settings smoke tests.
- `0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch` adds the opt-in connection-status spike adaptation experiment for bitrate/FPS only.

One-shot runtime settings requests are controlled by:

- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_KBPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION` (for example `1280x720`)
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED=1` for manual runtime-resolution smoke only when operation `3` is advertised as proof-gated rather than supported.

Connection-status adaptation experiments are spike-only and require `MOONLIGHT_RUNTIME_SETTINGS_MVP_ENABLE_SPIKE_ADAPTATION=1`. They are controlled by:

- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_COOLDOWN_S`

Resolution requests are one-shot only; connection-status adaptation intentionally remains limited to bitrate/FPS experiments until runtime resolution has client-side decode/render survival evidence.

This is experimental and should remain gated until Sunshine-side capability negotiation is formalized. Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy. Runtime settings decisions distinguish local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof as separate facts. The current connection-status adaptation is spike-only and must not become the product adaptation path.

Runtime settings mechanism contract:

- Existing packet IDs remain stable: request `0x5504` and ack `0x5505`.
- Operation `0` is a non-mutating capability query for the active Sunshine session; one-shot validation requests send a capability query before the delayed mutation command.
- Moonlight records launch baseline bitrate, FPS, and resolution separately from current applied values when parsing capability acks.
- Restore is explicit: callers send normal set commands back to the launch baseline values; Moonlight does not auto-restore from network or command outcomes.
- Operations `1`, `2`, and `3` remain bitrate, FPS, and resolution mutation requests.
- Moonlight keeps bounded per-operation command state, rejects same-family in-flight commands with `conflict`, and records terminal `host-applied`, `host-rejected`, `timed-out`, `stale-ack-observed`, and `stream-ended` outcomes.
- Runtime settings command timeout is currently 3000 ms; an expired command records `timed-out` with reason `no-ack`, and a later matching ack is treated as stale diagnostic input.
- Moonlight parses both legacy no-reason mutation acks and additive reason-bearing acks while Sunshine and Moonlight patch payloads transition together.
- Runtime resolution remains experimental/proof-gated; a Sunshine ack is not target-client proof.
- Capability-gated dispatch: mutation commands are rejected locally when operation `0` has not advertised support, and operation `3` requires the manual `MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED=1` smoke-test override while it is proof-gated.
- Runtime resolution proof gate: operation `3` is listed as proof-gated, not supported, in capability acks until same-session target-client proof exists.
- Operation `3` outcomes distinguish Sunshine-applied from client-proven: Moonlight records Sunshine `server_applied=1` separately from `client_proven=0` until device/client render evidence exists.
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
- `proof-gated`

Internal lifecycle values are `locally-rejected`, `accepted`, `sent`, `host-applied`, `host-rejected`, `timed-out`, `stale-ack-observed`, and `stream-ended`.

Current review gates:

- `nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link` is the source invariant/build check for packet IDs, operation IDs, capability query, reason fields, timeout/conflict markers, baseline tracking, and resolution proof-gate markers.
- Existing bitrate/FPS live evidence proves the `h264_vaapi` applied path; disabled, invalid, unsupported, timeout, conflict, command-not-advertised, and stale-ack outcomes are covered by source invariants and/or documented smoke evidence.
- Runtime resolution requires same-session target-client proof before it can be advertised as supported.

Evidence is recorded in:

- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`
- `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`

## Moonlight local control protocol

The local control protocol is experimental downstream Moonlight Embedded functionality. It is a generic Moonlight session protocol, not a Korri-private log format or launcher API.

Version 1 is Linux-only local IPC over a filesystem Unix-domain socket created for a running `moonlight stream ...` process. A launcher supplies the session id and socket path under a private runtime directory; Moonlight owns the socket server for that stream process. LAN, HTTP, mDNS, Tailscale, browser-facing APIs, host discovery, pairing, and app launch orchestration are intentionally out of scope for this protocol.

The TypeScript contract in `korri/shared/stream/moonlight-control-protocol.ts` defines the reviewable v1 message model before the native server is enabled:

- JSON-RPC-compatible request/response envelopes with newline-delimited JSON framing.
- `protocol.hello` for protocol metadata, session identity, authority, capabilities, and bounds.
- `state.snapshot` for late attachers to read lifecycle, shallow quality/adaptation, runtime settings, and input route facts.
- Ordered `moonlight.event` notifications with `seq` and monotonic timestamps so consumers can detect gaps and resync with `state.get`.
- Separate observer and controller authority. Read-only observability is the default; mutation commands require command-capable authority.
- Narrow command names only: request IDR, set bitrate, set FPS, and experimental set resolution when advertised by capabilities.
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
- Runtime resolution remains proof-gated and is not advertised as a supported local-control mutation command by this slice.
