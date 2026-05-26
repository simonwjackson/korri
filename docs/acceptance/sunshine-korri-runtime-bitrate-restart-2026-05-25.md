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

## Upshift validation

Launch at low bitrate, request `12000 kbps` after 10 seconds.

Moonlight markers:

```text
live-settings-mvp: runtime settings request scheduled delay_s=10 bitrate_kbps=12000
live-settings-mvp: sending runtime settings request request_id=1 bitrate_kbps=12000
live-settings-mvp: runtime settings request sent request_id=1 operation=1 bitrate_kbps=12000 packet=0x5504
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=12000 packet=0x5505
```

Sunshine markers:

```text
live-settings-mvp: request_id=1 operation=1 requested_bitrate_kbps=12000 configured_bitrate_kbps=1988 status=4
Creating encoder [h264_vaapi]
Streaming bitrate is 12000000
live-settings-mvp: async encoder restarted for runtime bitrate request_id=1 applied_kbps=12000
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=12000 applied_kbps=12000 status=0
```

Wire bitrate:

```text
pre packets=218 bytes=2402400 kbps=2745.6
early packets=662 bytes=13104000 kbps=14976.0
late packets=651 bytes=13104000 kbps=14976.0
allpost packets=1406 bytes=28080000 kbps=14976.0
```

## Downshift validation

Launch at high bitrate, request `3000 kbps` after 10 seconds.

Moonlight markers:

```text
live-settings-mvp: runtime settings request scheduled delay_s=10 bitrate_kbps=3000
live-settings-mvp: sending runtime settings request request_id=1 bitrate_kbps=3000
live-settings-mvp: runtime settings request sent request_id=1 operation=1 bitrate_kbps=3000 packet=0x5504
live-settings-mvp: runtime settings ack request_id=1 operation=1 status=0 applied_bitrate_kbps=3000 packet=0x5505
```

Sunshine markers:

```text
live-settings-mvp: request_id=1 operation=1 requested_bitrate_kbps=3000 configured_bitrate_kbps=8908 status=4
Creating encoder [h264_vaapi]
Streaming bitrate is 3000000
live-settings-mvp: async encoder restarted for runtime bitrate request_id=1 applied_kbps=3000
live-settings-mvp: capture_sync runtime bitrate request_id=1 requested_kbps=3000 applied_kbps=3000 status=0
```

Wire bitrate:

```text
pre packets=551 bytes=9828000 kbps=11232.0
early packets=298 bytes=3494400 kbps=3993.6
late packets=295 bytes=3494400 kbps=3993.6
allpost packets=639 bytes=7488000 kbps=3993.6
```

## Interpretation

True runtime bitrate changes are feasible for `h264_vaapi` when Sunshine recreates the active AVCodec/VAAPI encoder session in-place and keeps the stream/control session alive.

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
