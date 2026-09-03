# Zao 1080p120 acceptance, 2026-09-03

## Result

Zao now persistently runs the accepted 1920x1080@120 generation.

- Generation: `/nix/store/g4d157qiizfi68g31d07ff1y60dsxb0b-nixos-system-zao-26.05.20260313.c06b4ae`
- Bundle: `/nix/store/qkxz0ab369b1b455fx4cv129ccd32dxd-korri-bundle-0.0.0`
- Compositor: Sway with `WLR_BACKENDS=headless` and `WLR_RENDERER=pixman`
- Capture: Wayland screencopy
- Encoder: strict H.264 NVENC
- Output: `HEADLESS-1`, 1920x1080, 120,000 mHz
- High-refresh profile: `performance`, `min_perf_pct=40`, `max_perf_pct=60`

No reboot or physical action occurred.

## Native motion source

Korri runs `korri-streaming-validation-motion` as the streaming gate. The X11 program derives its layout from the live window dimensions. It moves geometry on an absolute clock set from the configured refresh rate.

The producer logged rates from `119.987` through `120.014 FPS` during the accepted session. This proves that the source changed at a native 120 FPS. It did not duplicate 60 FPS frames.

## Bandai measurements

Five moving-content samples reported these incoming rates:

| Sample | Incoming FPS | Rendering FPS | Network loss |
|---:|---:|---:|---:|
| 1 | 124.19 | 115.25 | 0.00% |
| 2 | 124.57 | 116.13 | 0.00% |
| 3 | 124.38 | 112.44 | 0.00% |
| 4 | 124.13 | 99.41 | 0.00% |
| 5 | 124.94 | 115.98 | 0.00% |

The incoming-rate mean was `124.442 FPS`. The minimum was `124.13 FPS`.

The previous generation used the same runtime stream path for a separate two-minute soak. Its final incoming rate was `124.19 FPS`, with `0.00%` network loss. The final generation changed only failed profile-activation rollback and then repeated the five-sample acceptance.

The client overlay and packet markers use short sampling windows, so individual estimates can exceed the requested 120 FPS. The native producer log is the source-rate check.

## Stream and isolation gates

The persistent acceptance command reported:

```text
game-compositor-gate=pass xwayland=visible wayland=hidden control=hidden procfs=isolated unit=one
nvenc-stream-gate=pass encoder=h264_nvenc strict=yes capture=wayland invocation=current
compositor-gate=pass renderer=pixman output=HEADLESS-1 mode=1920x1080@120Hz performance=active wayland=stable xwayland=:0 sunshine-control=denied
```

The current Sunshine invocation contained no X11 capture, VAAPI fallback, software encoder fallback, unsupported SHM format, capture failure, or scaling failure.

## Persistent state

The final verification found:

```text
generation=/nix/store/g4d157qiizfi68g31d07ff1y60dsxb0b-nixos-system-zao-26.05.20260313.c06b4ae
default=/nix/store/g4d157qiizfi68g31d07ff1y60dsxb0b-nixos-system-zao-26.05.20260313.c06b4ae
bundle=/nix/store/qkxz0ab369b1b455fx4cv129ccd32dxd-korri-bundle-0.0.0
profile=performance min=40 max=60
mode=1920x1080@120Hz
services=active game-count=0 marker=absent lease=inactive
```

The high-refresh profile is reversible. Its service restores `balanced`, `min_perf_pct=16`, and `max_perf_pct=100` when the 120 Hz generation stops.

## Bandai restoration

Bandai returned to the saved client state after acceptance:

```text
adb=device min-refresh=60.0 peak-refresh=60.0 preferences=restored versionName=20.2.6
```

The restored preferences request 1280x720 at 60 FPS, use the automatic codec, keep unlocked FPS disabled, and keep the performance overlay disabled.
