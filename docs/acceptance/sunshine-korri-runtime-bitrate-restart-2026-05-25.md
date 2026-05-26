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
- Runtime operation: `1` = set bitrate kbps
- Gate: `SUNSHINE_LIVE_SETTINGS_MVP=1`
- Measurement: `nixpkgs#tcpdump` on local `tailscale0`, filtering Sunshine video UDP from port `48998`
- Current status contract: `0` applied, `1` failed/unsupported, `2` invalid, `3` disabled

## Current benchmark pass

Run date: 2026-05-25.

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

## Interpretation

True runtime bitrate changes are feasible for `h264_vaapi` when Sunshine recreates the active AVCodec/VAAPI encoder session in-place and keeps the stream/control session alive.

Unsupported encoders fail safely: the client receives `status=1`, and Sunshine reports the current applied bitrate instead of pretending that the requested bitrate was applied.

This does not prove live resolution, FPS, HDR, codec, or preset changes. It also does not prove NVENC, software encoders, HEVC, or AV1. Those should remain unsupported until separately validated.

## Package

The carried downstream patch lives at:

```text
packages/sunshine-korri/patches/0001-runtime-bitrate-restart-mvp.patch
```

Build target:

```sh
nix build .#sunshine-korri
```
