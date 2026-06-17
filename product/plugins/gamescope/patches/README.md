# gamescope-korri patches

Korri's pinned package is Gamescope 3.16.23 plus the downstream patches listed
in `product/plugins/gamescope/default.nix`:

- `0001-rendervulkan-allow-render-only-vulkan-device.patch`
- `0002-waylandbackend-optional-explicit-sync.patch`
- `0003-rendervulkan-optional-pipeline-precompile.patch`

## Launch option inventory

The typed readable Gamescope policy is verified against the pinned 3.16.23
source used by the package:

- `src/main.cpp`: `gamescope_options`, usage text, and parsers for backend,
  scaler, filter, orientation, DRM mode generation, and touch mode values.
- `src/backend.h`: `VirtualConnectorStrategyToString` values.

Source-verified enum values for the readable policy are:

- backend: `auto`, `drm`, `sdl`, `openvr`, `headless`, `wayland`
- scaler: `auto`, `integer`, `fit`, `fill`, `stretch`
- filter: `linear`, `nearest`, `fsr`, `nis`, `pixel`
- orientation: `normal`, `right`, `left`, `upsidedown`
- DRM mode generation: `cvt`, `fixed`
- virtual connector strategy: `SingleApplication`, `SteamControlled`,
  `PerAppId`, `PerWindow`
- default touch mode: `0` hover, `1` left, `2` right, `3` middle,
  `4` passthrough

Both `--sharpness` and `--fsr-sharpness` are accepted by Gamescope 3.16.23 for
the same launch-time sharpness value (`0..20`). Korri's `extraArgs` field is a
last-resort launch escape hatch for flags not yet modeled in the typed policy;
it is appended after typed flags and before the child `--` separator, so modeled
options should stay in structured fields.

## Runtime control bridge

Korri v1 runtime control is separate from readable launch policy and is
guaranteed through the packaged `korri-gamescope-control-bridge` protocol. It
currently uses existing Gamescope Xwayland/root-atom controls for the supported
subset:

- `GAMESCOPE_XWAYLAND_MODE_CONTROL` (`server, width, height, allow_super_res`)
- `GAMESCOPE_SCALING_FILTER` (`0=linear`, `1=nearest`, `2=integer`, `3=fsr`, `4=nis`)
- `GAMESCOPE_SHARPNESS` (`0..20`)
- `GAMESCOPE_FSR_FEEDBACK` (`0/1` readback)

The public v1 API still includes the broader known control surface. Controls
that are not observable or writable through this backend return structured
`unsupported` command results rather than silently no-oping. Runtime filter
control intentionally does not accept the launch-only `pixel` filter until a
safe write/readback mapping is verified. Native Gamescope patches should be
added here when a contract row needs stronger readback/event truth than the
bridge can derive from existing mechanisms.
