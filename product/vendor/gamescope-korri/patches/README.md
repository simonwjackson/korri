# gamescope-korri patches

No Gamescope source patches are carried yet.

Korri v1 runtime control is guaranteed through the packaged
`korri-gamescope-control-bridge` protocol and currently uses existing
Gamescope Xwayland/root-atom controls for the supported subset:

- `GAMESCOPE_XWAYLAND_MODE_CONTROL` (`server, width, height, allow_super_res`)
- `GAMESCOPE_SCALING_FILTER` (`0=linear`, `1=nearest`, `2=integer`, `3=fsr`, `4=nis`)
- `GAMESCOPE_SHARPNESS` (`0..20`)
- `GAMESCOPE_FSR_FEEDBACK` (`0/1` readback)

The public v1 API still includes the broader known control surface. Controls
that are not observable or writable through this backend return structured
`unsupported` command results rather than silently no-oping. Native Gamescope
patches should be added here when a contract row needs stronger readback/event
truth than the bridge can derive from existing mechanisms.
