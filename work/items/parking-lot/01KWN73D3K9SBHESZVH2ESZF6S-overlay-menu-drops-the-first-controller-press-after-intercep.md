---
id: 01KWN73D3K9SBHESZVH2ESZF6S
slug: overlay-menu-drops-the-first-controller-press-after-intercep
title: Overlay menu drops the first controller press after intercept engages
origin: parked
status: To Do
priority: high
labels:
  - korri
  - overlay
  - inputplumber
  - intercept
  - input-routing
created: 2026-07-04
source: user
---

# Overlay menu drops the first controller press after intercept engages

## Why it matters

On the decision menu, the first A/nav press is consistently lost — you have to press twice, and the first press 'feels like it's recognizing the controller for the first time'. Persisted even when the intercept was enabled early, so it is not the busctl set-property latency. Most likely InputPlumber consumes/drops the first input event when it transitions the CompositeDevice into intercept (ALL) mode (or the dbus0 target isn't fully receiving until after the first event). Needs device investigation of InputPlumber's intercept-transition behavior (SetInterceptActivation, DbusDevices/TargetDevices state) and possibly a warm-up/priming so the first real press registers.

## Acceptance Criteria

- [ ] The first A/nav press in the decision menu registers (no double-press)
- [ ] Root-caused: whether InputPlumber drops the first event on intercept transition, or the dbus target needs priming
- [ ] Verified on Bandai across repeated menu opens

## Related

- `product/services/device/overlay-intercept.ts`
- `product/services/device/overlay-intercept-live.ts`
