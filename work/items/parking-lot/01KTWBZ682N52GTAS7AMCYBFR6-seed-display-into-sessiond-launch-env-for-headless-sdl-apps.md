---
id: 01KTWBZ682N52GTAS7AMCYBFR6
slug: seed-display-into-sessiond-launch-env-for-headless-sdl-apps
title: Seed DISPLAY into sessiond launch env for headless SDL apps
origin: parked
status: To Do
priority: medium
labels:
  - sessiond
  - ryubing
  - env
created: 2026-06-11
source: se-debug
---

# Seed DISPLAY into sessiond launch env for headless SDL apps

## Why it matters

sessiond's environment carries the kiosk seed SDL_VIDEODRIVER=x11 but not DISPLAY (gamescope sets :0 after sessiond starts). Headless Ryujinx uses SDL: x11 driver with no DISPLAY degrades init and crashes. Patched on bandai by adding DISPLAY: ":0" to the app env in device config — the durable fix is for sessiond (or spec composition) to import the compositor's DISPLAY once gamescope is up, so first-class app kinds work without per-device env workarounds. Also verify the materializer's intentional dropping of XDG_DATA_HOME/XDG_CACHE_HOME from ryubing spec env.

## Acceptance Criteria

- [ ] Launch spec env includes the live compositor DISPLAY without per-app config
- [ ] kind: ryubing launches succeed on SM8550 with no DISPLAY entry in device yaml
- [ ] Documented contract for which env vars sessiond seeds into managed launches

## Related

- `product/services/device/sessiond.ts`
- `product/platform/stream/ryubing-launch-spec.ts`
- `product/platform/library/config/app-materializer.ts`
