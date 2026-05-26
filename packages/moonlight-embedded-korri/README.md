# moonlight-embedded-korri

`moonlight-embedded-korri` is Korri's downstream Moonlight Embedded package.

It layers on top of the nix-on-rocks Moonlight Embedded package inputs:

- nix-on-rocks owns the base SM8550/v4l2m2m Moonlight patch stack.
- Korri owns only the patches in this directory.

## Korri patches

### `0004-add-absolutetouch-flag-for-tap-to-click.patch`

Adds `-absolutetouch` for handheld touchscreen tap-to-click over the stream.

### `0005-add-sunshine-runtime-settings-mvp.patch`

Adds an experimental Sunshine runtime-settings request sender and ack logger for the `0x5504` / `0x5505` MVP protocol. One-shot runtime settings requests are controlled by:

- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_KBPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS`
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION` (for example `1280x720`)
- `MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S`

Connection-status adaptation experiments are controlled by:

- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS`
- `MOONLIGHT_RUNTIME_SETTINGS_MVP_COOLDOWN_S`

Resolution requests are one-shot only; connection-status adaptation intentionally remains limited to bitrate/FPS experiments until runtime resolution has client-side decode/render survival evidence.

This is experimental and should remain gated until Sunshine-side capability negotiation is formalized.

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
