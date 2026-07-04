---
id: 01KVM8TD6VY4G1Q19GETM7T2RY
slug: repair-bandai-steam-gamescope-steam-ui-launch-mismatch
title: Repair Bandai steam-gamescope Steam UI launch mismatch
origin: parked
status: To Do
priority: high
labels:
  - steam
  - gamescope
  - bandai
  - runtime
created: 2026-06-21
source: user
---

# Repair Bandai steam-gamescope Steam UI launch mismatch

## Why it matters

Post-deploy policy materialization works, but controller-safe steam-gamescope exits 134 because Steam switches from publicbeta to steamdeck_stable and then fails loading steamui.so with libvideo.so undefined symbol av_malloc_tracked. This blocks full manual gameplay screenshot validation through the accepted gamescope path.

## Acceptance Criteria

- [ ] Launching steam-gamescope via korrid keeps gamescope and Steam alive instead of exiting 134.
- [ ] Steam UI no longer logs dlmopen steamui.so/libvideo.so av_malloc_tracked failures.
- [ ] Flinthook can be launched through the gamescope path and verified with gamescopectl screenshot.

## Related

- `/var/lib/korri/steam-gamescope-session.korrid.log`
- `product/plugins/steam/packages/steam-korri/scripts/steam-guest-run`
- `product/plugins/steam/packages/steam-korri/scripts/steam-arm64-seed`

## Notes

Direct dry-run/materialization passes and uses proton-cachyos. steam-gamescope command /var/lib/korri/bin/steam-gamescope-session fails after Steam reports Client beta changed from publicbeta to steamdeck_stable and Failed to load steamui.so.

## Evidence 2026-07-04 (bandai)

- `korri-steam-gamescope.service` started at 02:48:53 and held DSI-2 fullscreen
  with Steam `-silent` — solid black screen, no UI, no device-side recovery.
- sessiond reported `mode=stopped active=none` the whole time (system unit is
  invisible to it — the ownership gap 01KV3A5RNC covers).
- `steam-runtime-launcher-service: not found` → "possible problem, disabling" —
  Steam came up degraded.
- Recovery used: `sudo systemctl stop korri-steam-gamescope.service` returned
  the kiosk to the hub.
