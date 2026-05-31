# Sunshine Korri seamless VAAPI runtime bitrate evidence on SM8550

## Summary

Validated true active-stream bitrate changes from `aka` (Sunshine `h264_vaapi`) to `bandai` (Moonlight `-platform v4l2m2m`) without Moonlight reconnect, decoder reset, or Sunshine encoder restart.

Result: **supported for this path** (`SUNSHINE_LIVE_SETTINGS_MVP=1`, `h264_vaapi`, SM8550 Moonlight `v4l2m2m`).

## Setup

- Host: `aka` at `192.168.1.117`
- Client: `bandai`
- Sunshine binary: `/tmp/sunshine-seamless-bitrate-aka-host`
- Sunshine build: `/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri`
- Moonlight: `/nix/store/0gz7wgzlx9pblyzk418644i4nmgd3ag1-moonlight-embedded-korri-2.7.1-korri/bin/moonlight`
- Stream: `Desktop`, H.264, `1080p@120fps`, initial `-bitrate 12000`, `-platform v4l2m2m`, `-input /dev/input/event8`
- Motion source: fullscreen `foot` terminal on `aka` continuously updating frame/time text.

## Capability and baseline

Moonlight local-control advertised both commands:

```json
"commands":["runtime.setBitrate","runtime.setFps"]
```

Baseline state before bitrate changes:

```json
"streamQuality":{"bitrateKbps":8908,"fps":120,"width":1920,"height":1080}
```

Baseline moving-video and bandwidth evidence:

```text
baseline_rx_kbps=14460 delta_bytes=5422683
162e9b72c269c28964e126b748d46ffffbc17ebf7f4d41a36ac04db24a59703d  /tmp/bandai-seamless-before-a.png
f2831a30d020c30c40b9fdc66df9c1f6decda0f24b421f1bd579adae08258dce  /tmp/bandai-seamless-before-b.png
```

The screenshot hashes differ across one second while the motion source is active.

## Runtime bitrate upshift: 25 Mbps

Command/result:

```json
{"_tag":"command.accepted","requestId":100001,"command":"runtime.setBitrate"}
{"name":"runtime.commandResult","requestId":100001,"command":"runtime.setBitrate","status":"applied","reason":0}
```

State after apply:

```json
"streamQuality":{"bitrateKbps":25000,"fps":120,"width":1920,"height":1080}
"runtimeSettings":{"appliedBitrateKbps":25000,"appliedFps":120}
```

Moving-video and bandwidth evidence:

```text
after_25mbps_rx_kbps=33198 delta_bytes=12449256
9c84a72fda55601c95b49d2cd24726ba84d86a4da1f6a5371463b404b7310caf  /tmp/bandai-seamless-after25-a.png
d05a07329682d8dcacb19189ac7181963f8799be494755344148ce65e6db94c8  /tmp/bandai-seamless-after25-b.png
```

## Runtime bitrate downshift: 6 Mbps

Command/result:

```json
{"_tag":"command.accepted","requestId":100002,"command":"runtime.setBitrate"}
{"name":"runtime.commandResult","requestId":100002,"command":"runtime.setBitrate","status":"applied","reason":0}
```

State after apply:

```json
"streamQuality":{"bitrateKbps":6000,"fps":120,"width":1920,"height":1080}
"runtimeSettings":{"appliedBitrateKbps":6000,"appliedFps":120}
```

Moving-video and bandwidth evidence:

```text
after_6mbps_rx_kbps=10253 delta_bytes=3845043
621ed4df4de0a659bda9952a1d79ba5152133a6f48db19c94059a6daca3c188c  /tmp/bandai-seamless-after6-a.png
10404167e6469c7588420996e142f0bbe2a3af44349e9dc51b2524621f9db346  /tmp/bandai-seamless-after6-b.png
```

## Sunshine markers

```text
live-settings-mvp: capability request_id=100000 enabled=true launch_bitrate_kbps=8908 launch_fps=120 launch_width=1920 launch_height=1080 current_bitrate_kbps=8908 current_fps=120 current_width=1920 current_height=1080
live-settings-mvp: VAAPI runtime bitrate params updated without encoder restart requested_kbps=25000 bits_per_second=25000000 target_percentage=100 window_size=8 rc_mode=CBR
live-settings-mvp: capture_sync runtime bitrate request_id=100001 requested_kbps=25000 applied_kbps=25000 status=0 reason=0 seamless_vaapi=1
live-settings-mvp: VAAPI runtime bitrate params updated without encoder restart requested_kbps=6000 bits_per_second=6000000 target_percentage=100 window_size=8 rc_mode=CBR
live-settings-mvp: capture_sync runtime bitrate request_id=100002 requested_kbps=6000 applied_kbps=6000 status=0 reason=0 seamless_vaapi=1
```

## Interpretation

The `h264_vaapi` runtime bitrate path is seamless for the validated SM8550 Moonlight `v4l2m2m` client: command acks applied, local-control state changed, measured receive bandwidth moved in the expected direction, and moving-video screenshots continued to change after each bitrate change.

This evidence does not generalize to other encoders, codecs, or clients. Non-VAAPI-H.264 paths must continue to reject active-stream bitrate changes rather than reconnecting or restarting the encoder.
