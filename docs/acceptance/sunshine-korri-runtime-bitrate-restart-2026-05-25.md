# Sunshine Korri runtime bitrate restart evidence

## Summary

The live bitrate-control spike proved that a Sunshine control-stream extension can change the active stream bitrate at runtime when Sunshine recreates the active AVCodec/VAAPI encoder session with the requested bitrate.

The earlier direct `AVCodecContext` field/AVOption mutation path acknowledged success but did **not** change wire bitrate. The working path is encoder-session restart, not in-place field mutation.

## Scope proven

- Host: `aka` / `100.117.97.45`
- Sunshine backend: `h264_vaapi`
- Client: patched Moonlight sender
- Request packet: `0x5504`
- Ack packet: `0x5505`
- Runtime operations: `1` = set bitrate kbps, `2` = set effective FPS
- Gate: `SUNSHINE_LIVE_SETTINGS_MVP=1`
- Measurement: `nixpkgs#tcpdump` on local `tailscale0`, filtering Sunshine video UDP from port `48998`
- Current status contract: `0` applied, `1` failed/unsupported, `2` invalid, `3` disabled
- Current reason-bearing contract: acks now include a machine-readable reason field while Moonlight still parses legacy no-reason acks during transition.
- Current capability contract: operation `0` reports active-session support, launch baselines, current applied values, and proof-gated operations before mutation.

## Current benchmark pass

Run dates: 2026-05-25 and 2026-05-26.

The live smoke logs below predate the additive reason-bearing ack payload. They remain valid evidence for the proven `h264_vaapi` bitrate/FPS behavior; current patched Moonlight logs include `reason=<code>` on runtime-settings acks and command lifecycle markers such as `host-applied`, `host-rejected`, `timed-out`, `conflict`, and `stale-ack-observed`.

Setup:

- Sunshine: current `.#sunshine-korri`, launched as an ephemeral alternate-port instance on `48989`
- Moonlight: current `.#moonlight-embedded-korri`, launched with `-platform fake`
- Capture: `tcpdump` on `tailscale0`, Sunshine video UDP source port `48998`

### Upshift validation

Launch at low bitrate, request `12000 kbps` after 10 seconds.

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=12000 packet=0x5505
```

Sunshine markers:

```text
Creating encoder [h264_vaapi]
Streaming bitrate is 1268000
live-settings-mvp: request_id=1 operation=1 requested_bitrate_kbps=12000 configured_bitrate_kbps=1268 queued=1
Creating encoder [h264_vaapi]
Streaming bitrate is 12000000
live-settings-mvp: async encoder restarted for runtime bitrate request_id=1 applied_kbps=12000
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=12000 applied_kbps=12000 status=0
```

Wire bitrate:

```text
pre_2_9s          packets=421 bytes=2184000  kbps=2496.0
transition_9_13s packets=310 bytes=5538000  kbps=11076.0
post_13_20s      packets=593 bytes=13104000 kbps=14976.0
late_20_27s      packets=549 bytes=13104000 kbps=14976.0
all_post_13_27s  packets=1142 bytes=26208000 kbps=14976.0
```

### Downshift validation

Launch at high bitrate, request `3000 kbps` after 10 seconds.

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=3000 packet=0x5505
```

Sunshine markers:

```text
Creating encoder [h264_vaapi]
Streaming bitrate is 8908000
live-settings-mvp: request_id=1 operation=1 requested_bitrate_kbps=3000 configured_bitrate_kbps=8908 queued=1
Creating encoder [h264_vaapi]
Streaming bitrate is 3000000
live-settings-mvp: async encoder restarted for runtime bitrate request_id=1 applied_kbps=3000
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=3000 applied_kbps=3000 status=0
```

Wire bitrate:

```text
pre_2_9s          packets=653 bytes=10046400 kbps=11481.6
transition_9_13s packets=283 bytes=3034720  kbps=6069.4
post_13_20s      packets=457 bytes=3931200  kbps=4492.8
late_20_27s      packets=458 bytes=3931200  kbps=4492.8
all_post_13_27s  packets=915 bytes=7862400  kbps=4492.8
```

### Unsupported HEVC validation

Launch with HEVC, request `3000 kbps` after 10 seconds. HEVC is intentionally unsupported by the runtime restart patch.

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=1 applied_bitrate_kbps=5708 packet=0x5505
```

Sunshine markers:

```text
Creating encoder [hevc_vaapi]
Streaming bitrate is 5708000
live-settings-mvp: request_id=1 operation=1 requested_bitrate_kbps=3000 configured_bitrate_kbps=5708 queued=1
live-settings-mvp: runtime bitrate unsupported encoder request_id=1 encoder=vaapi codec=hevc_vaapi
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=3000 applied_kbps=5708 status=1
```

Wire bitrate stayed near the original stream rate after the request:

```text
pre_2_9s     packets=435 bytes=6552000 kbps=7488.0
post_13_20s packets=430 bytes=6552000 kbps=7488.0
```

### Runtime FPS validation

Launch at `60 FPS`, request `30 FPS` after 10 seconds.

Moonlight ack:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=0 applied_fps=30 packet=0x5505
```

Sunshine markers:

```text
Creating encoder [h264_vaapi]
Streaming bitrate is 5708000
[h264_vaapi] RC framerate: 60/1 (60.00 fps)
live-settings-mvp: request_id=1 operation=2 requested_value=30 configured_bitrate_kbps=5708 configured_fps=60 queued=1
live-settings-mvp: capture_sync runtime FPS request_id=1 requested_fps=30 applied_fps=30 status=0
```

Frame-level measurement used unique RTP timestamps from the captured video UDP pcap:

```text
pre_2_9s      frames=420 fps=60.0
post_13_20s   frames=210 fps=30.0
late_20_27s   frames=210 fps=30.0
second_08     frames=60
second_09     frames=60
second_10     frames=30
second_11     frames=30
```

Packet cadence and wire bitrate also dropped after the request:

```text
pre_2_9s      packets=430 pps=61.4 kbps=7488.0
post_13_20s   packets=216 pps=30.9 kbps=3744.0
late_20_27s   packets=220 pps=31.4 kbps=3744.0
```

A second downshift to `15 FPS` showed the same frame-level behavior:

```text
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=0 applied_fps=15 packet=0x5505
pre_2_9s      frames=420 fps=60.0
post_13_20s   frames=105 fps=15.0
second_09     frames=60
second_10     frames=15
second_11     frames=15
```

### Runtime FPS edge cases

Historical ack examples:

```text
# FPS above launch FPS is invalid.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=2 applied_fps=60 packet=0x5505

# HEVC remains unsupported.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=1 applied_fps=60 packet=0x5505

# Gate disabled returns disabled.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=3 applied_fps=60 packet=0x5505

# Moonlight refuses ambiguous one-shot input.
live-settings-mvp: set only one runtime settings value: bitrate, fps, or resolution
```

Current reason-bearing equivalents preserve the same broad status while adding a reason code:

```text
# FPS above launch FPS is invalid.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=2 reason=2 applied_fps=60 packet=0x5505

# HEVC remains unsupported.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=1 reason=4 applied_fps=60 packet=0x5505

# Gate disabled returns disabled.
live-settings-mvp: runtime settings ack request_id=1 operation=2 status=3 reason=1 applied_fps=60 packet=0x5505
```

### Bitrate regression after generic runtime settings protocol

The generic `operation/value` packet shape preserved the proven bitrate path:

```text
# 8000-ish launch, request 12000 kbps after 5s.
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=12000 packet=0x5505
pre_2_9s        kbps=11303.3
transition_9_13s kbps=14976.0

# 12000 launch, request 3000 kbps after 5s.
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=3000 packet=0x5505
pre_2_9s        kbps=7407.2
post_13_20s     kbps=2877.5
```

## Build/check evidence after mechanism hardening

The final hardened mechanism is covered by the source invariant/build check:

```text
nix build .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).korri-sunshine-runtime-bitrate-patch --no-link
```

That check requires stable packet/operation IDs, operation `0` capability query support, active-session capability gating, reason-bearing acks with legacy parsing, explicit launch baseline tracking, timeout/no-ack, conflict, stale-ack markers, and proof-gated runtime resolution markers. No new live bitrate/FPS smoke was run for the documentation refresh; the existing live evidence above remains the behavior proof for `h264_vaapi`.

## Interpretation

True runtime bitrate changes are feasible for `h264_vaapi` when Sunshine recreates the active AVCodec/VAAPI encoder session in-place and keeps the stream/control session alive.

Runtime FPS downshifts are feasible for `h264_vaapi` as frame pacing: the stream stays alive, acks report the applied FPS, and unique RTP timestamp cadence drops to the requested FPS without renegotiating stream resolution or client capabilities.

Unsupported encoders fail safely: the client receives `status=1`, and Sunshine reports the current applied bitrate/FPS instead of pretending that the requested value was applied.

This does not prove HDR, codec, or preset changes. It also does not prove NVENC, software encoders, HEVC, or AV1. Those should remain unsupported until separately validated.

A later runtime resolution spike added operation `3` and proved Sunshine-side `h264_vaapi` encoder-session replacement with a fake Moonlight client. That evidence is intentionally documented separately because client decoder/render survival is still unproven: `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`.

## Package

The carried downstream patch lives at:

```text
packages/sunshine-korri/patches/0001-runtime-bitrate-restart-mvp.patch
```

Build target:

```sh
nix build .#sunshine-korri
```
