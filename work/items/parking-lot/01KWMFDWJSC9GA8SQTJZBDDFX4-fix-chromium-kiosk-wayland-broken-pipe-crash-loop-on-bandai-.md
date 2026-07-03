---
id: 01KWMFDWJSC9GA8SQTJZBDDFX4
slug: fix-chromium-kiosk-wayland-broken-pipe-crash-loop-on-bandai-
title: "Fix Chromium kiosk Wayland \"Broken pipe\" crash loop on Bandai stream→hub handoff"
origin: parked
status: To Do
priority: high
labels:
  - kiosk
  - chromium
  - sessiond
  - display
  - reliability
  - bandai
  - rocknix-sm8550
  - foreground-lifecycle
created: 2026-07-03
source: se-debug
---

# Fix Chromium kiosk Wayland "Broken pipe" crash loop on Bandai stream→hub handoff

## Why it matters

Returning to the GUI after a stream intermittently shows a blank/white screen. On Bandai (lanes policy, which is meant to keep the hub renderer alive), the Chromium kiosk is instead repeatedly crashing with "Error reading events from display: Broken pipe" / "Fatal Wayland communication error: Broken pipe" and being respawned by sessiond. When checked live during a stream the Chromium process count was 0 (dead, not merely hidden). If a respawn reloads and beacons ready the hub reappears ("eventually shows up"); if it crashes straight back into the broken display connection or the reload stalls, the white screen persists. The intermittency is a race on display/compositor state at handoff, which is why there is no clean repro trigger. This is an appliance-UX reliability defect: a normal stream in/out can leave the device with no visible GUI.

## Acceptance Criteria

- [ ] Chromium kiosk survives a normal stream launch and exit without losing its Wayland/compositor connection (no 'Broken pipe' crash on the display handoff)
- [ ] If the renderer does die, sessiond reliably restores a visible, ready hub — no persistent white/blank screen after return
- [ ] A repro is captured correlating a stream launch/exit cycle with chromium.log 'Broken pipe' + respawn entries
- [ ] Root trigger is identified: whether the nested gamescope stream grabbing/releasing scanout (DRM-master/display handoff) is what drops Chromium's compositor connection
- [ ] Confirm the lanes workspace wiring is correct (observed sway on numeric workspaces '1'/'2' rather than the expected korri:hub / korri:game:active while the renderer was dead)

## Related

- `work/items/parking-lot/01KWGHX442E8ZNEYWA16E1VZAK-recover-bandai-kiosk-hub-when-a-nested-gamescope-launch-abor.md`
- `backlog/task-001 - recover-compositor-after-drm-atomic-commit-permission-loss.md`
- `product/services/device/sessiond-renderer.ts`
- `product/services/device/sessiond-sway.ts`
- `product/systems/nixos/modules/korri-sessiond.nix`

## Notes

Live evidence on bandai (2026-07-03): ~/.local/state/korri/chromium.log shows a repeating cycle of "chromium spawn at ..." entries each ending in "Error reading events from display: Broken pipe" (and one "Fatal Wayland communication error: Broken pipe"). pgrep chrome count = 0 during an active stream. Policy is KORRI_SESSIOND_KIOSK_POLICY=lanes (keep hub renderer alive), so the renderer being dead is the bug, not expected teardown. Overlaps but is distinct from 01KWGHX442E8ZNEYWA16E1VZAK (nested gamescope SIGABRT → black screen, no recovery) and task-001 (DRM atomic-commit permission loss → black screen). The DBus UPower and GCM/DEPRECATED_ENDPOINT lines in the log are noise, not the cause. Consider whether recovery half is owned by 01KWGHX442E8ZNEYWA16E1VZAK and this item owns the crash-on-handoff root cause.
