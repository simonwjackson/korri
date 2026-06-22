---
id: 01KVNHQKSVADKGYYNTD6G699R9
slug: productize-scoped-controller-to-keyboard-input-for-yfs-style
title: Productize scoped controller-to-keyboard input for YFS-style web games
origin: parked
status: To Do
priority: medium
labels:
  - yfs
  - input
  - controller
  - launcher
created: 2026-06-21
source: user
---

# Productize scoped controller-to-keyboard input for YFS-style web games

## Why it matters

YFS and similar browser games primarily listen for keyboard controls, while Korri users play with controllers. The old evsieve prototype proved a scoped virtual keyboard tied to launcher lifetime avoids global InputPlumber profile changes, but it remains a /tmp-era pattern that needs productization.

## Acceptance Criteria

- [ ] Create a reusable scoped keyboard mapper package or platform service with lifecycle tied to the launcher process
- [ ] Ship a documented YFS binding profile: d-pad/left-stick to arrows, west/south to z, north to a, east to x, start to p, reflecting the proven/touched-up mapping
- [ ] Use process supervision/PID ownership, not broad `pkill -f`, and cleanly remove the virtual keyboard on launcher exit
- [ ] Add a local/device verification that the virtual device appears, sends expected key events, and disappears on stop
- [ ] Integrate the mapper into the YFS launcher without leaking a global InputPlumber profile or system-wide mutation

## Related

- `work/parking-lot/01KTPAJV8D7D2BPKQ6BRPH63TB-productize-scoped-game-controller-keyboard-wrapper-for-yfs-style-browser.md`
- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

## Notes

Consolidates legacy parking-lot scoped evsieve work; still relevant after choosing Chromium/web-canvas as the default runtime.
