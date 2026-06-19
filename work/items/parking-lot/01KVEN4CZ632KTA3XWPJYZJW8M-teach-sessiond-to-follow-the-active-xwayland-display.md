---
id: 01KVEN4CZ632KTA3XWPJYZJW8M
slug: teach-sessiond-to-follow-the-active-xwayland-display
title: Teach sessiond to follow the active Xwayland display
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - bandai
  - sessiond
  - compositor
created: 2026-06-19
source: user
---

# Teach sessiond to follow the active Xwayland display

## Why it matters

Bandai's compositor can restart Xwayland on :2 after stale sockets or failed game experiments, while sessiond is configured for DISPLAY=:0. That leaves the home renderer unable to launch until a manual display override is installed.

## Acceptance Criteria

- [ ] sessiond discovers or receives the active Xwayland display after compositor restart
- [ ] home renderer relaunches without hand-edited display.conf when Xwayland is not :0
- [ ] stale /tmp/.X11-unix permissions/sockets are handled or reported clearly

## Related

- `product/services/device/sessiond-role.ts`
- `/etc/systemd/user/korri-sessiond.service`
- `bandai runtime: /home/korri/.config/systemd/user/korri-sessiond.service.d/display.conf`

## Notes

Observed after 3dSen launch testing: /tmp/.X11-unix mode was 0755, Sway logged Xwayland socket Permission denied for X2..X32. After chmod 1777, Sway started Xwayland :2; sessiond needed DISPLAY=:2 override to restore portal.
