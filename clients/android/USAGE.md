# Artemis Usage Guide

## Intent-Based Launching

Launch streaming sessions via ADB, deep links, or `.art` files.

---

## ADB

```bash
adb shell am start -n com.limelight.noir/.ShortcutTrampoline \
  --es UUID "your-pc-uuid" \
  --es AppName "Desktop" \
  --ei Width 2560 \
  --ei Height 1440 \
  --ei Fps 120 \
  --ei Bitrate 50000 \
  --es FramePacing "balanced" \
  --es UltraLowLatency "true" \
  --es VideoScaleMode "fit" \
  --es Codec "hevc" \
  --es DisplayTopCenter "true" \
  --es ReduceRefreshRate "true" \
  --es LowLatencyFrameBalance "true" \
  --es TightVsync "true" \
  --es Pip "true" \
  --es AutoOrientation "true" \
  --es FlipFaceButtons "true" \
  --es Hdr "true" \
  --es MouseEmulation "true" \
  --es TouchscreenMode "trackpad-natural" \
  --es AbsoluteMouseMode "true"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `UUID` | string | PC UUID (or use `Name`) |
| `Name` | string | PC name (or use `UUID`) |
| `AppName` | string | App to launch |
| `AppUUID` | string | App UUID (alternative to AppName) |
| `AppId` | string | App ID (alternative to AppName) |
| `Width` | int | Stream width |
| `Height` | int | Stream height |
| `Fps` | int | Target framerate |
| `Bitrate` | int | Bitrate in Kbps (e.g., 50000 = 50 Mbps) |
| `FramePacing` | string | Frame pacing: `latency`, `balanced`, `cap-fps`, `smoothness`, `warp`, `warp2` |
| `UltraLowLatency` | string | `true` or `false` (experimental, SD8Gen2/8Gen3/MTK) |
| `VideoScaleMode` | string | Video scaling: `fit`, `fill`, `stretch` |
| `Codec` | string | Video codec: `auto`, `av1`, `hevc` (or `h265`), `h264` |
| `DisplayTopCenter` | string | `true` or `false` (align to top, useful for foldables) |
| `ReduceRefreshRate` | string | `true` or `false` (allow lower refresh rates to save power) |
| `LowLatencyFrameBalance` | string | `true` or `false` (experimental LFR, drops frames for lower latency) |
| `TightVsync` | string | `true` or `false` (experimental, tighter vsync thresholds) |
| `Pip` | string | `true` or `false` (enable Picture-in-Picture observer mode) |
| `AutoOrientation` | string | `true` or `false` (follow device orientation vs force landscape) |
| `FlipFaceButtons` | string | `true` or `false` (swap A↔B and X↔Y for Nintendo-style layout) |
| `Hdr` | string | `true` or `false` (enable HDR10 streaming if display supports) |
| `MouseEmulation` | string | `true` or `false` (enable gamepad mouse emulation toggle via Start button) |
| `TouchscreenMode` | string | Touchscreen mode: `multitouch`, `absolute`, `trackpad-natural`, `trackpad-gaming`, `disabled`, `absolute-swapped` |
| `AbsoluteMouseMode` | string | `true` or `false` (use absolute mouse positioning for desktop use) |

---

## Deep Links

```
art://launch?host_uuid=xxx&app_name=Desktop&width=2560&height=1440&fps=120&bitrate=50000&frame_pacing=balanced&ultra_low_latency=true&video_scale_mode=fit&codec=hevc&display_top_center=true&reduce_refresh_rate=true&low_latency_frame_balance=true&tight_vsync=true&pip=true&auto_orientation=true&flip_face_buttons=true&hdr=true&mouse_emulation=true&touchscreen_mode=trackpad-natural&absolute_mouse_mode=true
```

| Parameter | Description |
|-----------|-------------|
| `host_uuid` / `host_name` | PC identifier (one required) |
| `app_name` / `app_uuid` / `app_id` | App identifier |
| `width`, `height` | Resolution (both required if used) |
| `fps` | Target framerate |
| `bitrate` | Bitrate in Kbps (e.g., 50000 = 50 Mbps) |
| `frame_pacing` | Frame pacing mode (see values above) |
| `ultra_low_latency` | `true` or `false` (experimental) |
| `video_scale_mode` | Video scaling mode (see values above) |
| `codec` | Video codec (see values above) |
| `display_top_center` | `true` or `false` (align to top) |
| `reduce_refresh_rate` | `true` or `false` (reduce refresh rate) |
| `low_latency_frame_balance` | `true` or `false` (LFR mode) |
| `tight_vsync` | `true` or `false` (tight vsync mode) |
| `pip` | `true` or `false` (PIP mode) |
| `auto_orientation` | `true` or `false` (auto orientation mode) |
| `flip_face_buttons` | `true` or `false` (swap face buttons) |
| `hdr` | `true` or `false` (HDR streaming) |
| `mouse_emulation` | `true` or `false` (gamepad mouse emulation) |
| `touchscreen_mode` | Touchscreen mode (see values above) |
| `absolute_mouse_mode` | `true` or `false` (absolute mouse mode) |

---

## .art Files

Text files with `.art` extension:

```
[host_uuid] 550e8400-e29b-41d4-a716-446655440000
[app_name] Desktop
[width] 2560
[height] 1440
[fps] 120
[bitrate] 50000
[frame_pacing] balanced
[ultra_low_latency] true
[video_scale_mode] fit
[codec] hevc
[display_top_center] true
[reduce_refresh_rate] true
[low_latency_frame_balance] true
[tight_vsync] true
[pip] true
[auto_orientation] true
[flip_face_buttons] true
[hdr] true
[mouse_emulation] true
[touchscreen_mode] trackpad-natural
[absolute_mouse_mode] true
```

Export from app: Long-press app → Export launcher file

---

## Notes

- Resolution requires **both** width and height
- Resolution and FPS are one-time overrides (not saved to preferences)
- Bitrate is specified in Kbps (e.g., 50000 = 50 Mbps). No upper limit enforced.
- Frame pacing valid values: `latency` (lowest latency), `balanced`, `cap-fps`, `smoothness`, `warp` (2x warp), `warp2` (4x warp)
- Ultra low latency is experimental; effective only on SD8Gen2/8(s)Gen3/8Elite and MTK devices
- Video scale mode: `fit` (letterbox/pillarbox), `fill` (crop to fill), `stretch` (ignore aspect ratio)
- Codec: `auto` (recommended), `av1` (experimental), `hevc`/`h265`, `h264`
- Display top center aligns the stream to the top of screen instead of centered (useful for foldable phones)
- Reduce refresh rate allows the display to use lower refresh rates matching the stream FPS to save power (adds latency)
- LFR (Low-latency Frame Balance) is experimental; minimizes delay by dropping queued frames
- Tight Vsync is experimental; uses tighter vsync-based thresholds for lower latency but may increase frame drops
- PIP (Picture-in-Picture) enables observer mode - stream continues in floating window but input is disabled
- Auto orientation: when `true`, stream follows device orientation; when `false`, defaults to landscape
- Flip face buttons: when `true`, swaps A↔B and X↔Y (Nintendo-style layout); affects both physical and virtual controllers
- HDR: when `true`, requests HDR10 streaming (requires Android 7.0+ and HDR10-compatible display); on external displays enables 10-bit streaming
- Mouse emulation: when `true`, holding Start button toggles gamepad mouse mode (analog sticks control cursor); when `false`, this toggle is disabled
- Touchscreen mode: `multitouch` (send multi-touch events), `absolute` (direct cursor positioning), `trackpad-natural` (natural scrolling), `trackpad-gaming` (inverted scrolling), `disabled` (no touch input), `absolute-swapped` (absolute with swapped L/R click)
- Absolute mouse mode: when `true`, sends absolute mouse positions for natural desktop mouse acceleration; when `false`, uses relative movement (better for games)
