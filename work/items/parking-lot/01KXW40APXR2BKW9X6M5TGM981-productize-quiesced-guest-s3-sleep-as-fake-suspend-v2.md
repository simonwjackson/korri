---
id: 01KXW40APXR2BKW9X6M5TGM981
slug: productize-quiesced-guest-s3-sleep-as-fake-suspend-v2
title: Productize quiesced-guest S3 sleep as fake-suspend v2
origin: parked
status: To Do
priority: medium
labels:
  - power
  - sm8550
  - fakesuspend
  - architecture
created: 2026-07-19
source: user
---

# Productize quiesced-guest S3 sleep as fake-suspend v2

## Why it matters

Live-validated on Bandai 2026-07-19: pause host service watchdogs, freeze the entire rocknix-guest.service cgroup, enter deep S3, thaw on wake — the running Ryujinx game (PIDs, session launchId, rendering, input) survived exactly. This replaces the ~0.87W/3-4%/h fake-suspend floor with true SoC sleep once the spurious-wake blocker is fixed. Needs a real protocol: substrate-owned quiesce verb (host side), lid-close wiring from korri-fakesuspend-toggle, watchdog pause scoped to the guest unit rather than globally, and rescue timers for fail-safe thaw.

## Acceptance Criteria

- [ ] A substrate verb (nix-on-rocks host side) implements pause-watchdog -> freeze guest -> S3 -> thaw -> restore with fail-safe rescue
- [ ] Korri lid-close path routes to the new verb behind a config flag, falling back to current fake suspend
- [ ] Guest watchdog handling is per-unit (no global service-watchdogs toggle) or explicitly justified
- [ ] Lid-open wakes the device via power key/lid GPIO and the game resumes without visible discontinuity

## Related

- `product/services/device/fakesuspend-controller.ts`
- `../nix-on-rocks/guest/modules/powerstate.nix`
- `work/items/active/01KX76A6PV6AKPYPVRFK62S4DY-default-game-freeze/plan.md`

## Notes

Blocked on backlog item 01KXW3ZX58F6WYQHR4N1ND2GAK (spurious wake). S4 hibernate (swap on /storage + resume= cmdline) is the follow-on once S3 holds; both share the same quiesce stage. Watchdog kill evidence: journalctl showed rocknix-guest.service watchdog timeout at 15s into a freeze, SIGABRT then SIGKILL cascade, cold restart.
