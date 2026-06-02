# gamescope-korri patches

No Gamescope source patches are carried yet.

Korri v1 runtime control uses existing Gamescope Xwayland/root-atom controls:

- `GAMESCOPE_XWAYLAND_MODE_CONTROL` (`server, width, height, allow_super_res`)
- `GAMESCOPE_SCALING_FILTER` (`0=linear`, `1=nearest`, `2=integer`, `3=fsr`, `4=nis`)
- `GAMESCOPE_SHARPNESS` (`0..20`)
- `GAMESCOPE_FSR_FEEDBACK` (`0/1` readback)

Native Gamescope patches should be added here only after the socket API's ack,
readback, and event semantics have been validated against the out-of-tree bridge.
