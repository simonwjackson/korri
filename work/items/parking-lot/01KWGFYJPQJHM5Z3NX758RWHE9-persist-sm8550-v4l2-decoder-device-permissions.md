---
id: 01KWGFYJPQJHM5Z3NX758RWHE9
slug: persist-sm8550-v4l2-decoder-device-permissions
title: Persist SM8550 V4L2 decoder device permissions
origin: parked
status: To Do
priority: high
labels:
  - korri
  - rocknix-sm8550
  - moonlight
  - udev
created: 2026-07-02
source: se-debug
---

# Persist SM8550 V4L2 decoder device permissions

## Why it matters

Bandai’s Moonlight v4l2m2m path regressed because /dev/video0 and /dev/video1 were owned by an unknown gid (39), while the korri user is in video gid 26. The host hotfix makes streaming work until reboot, but a rebuild/udev fix is required so the decoder remains usable.

## Acceptance Criteria

- [ ] /dev/video* decoder nodes are group-owned by video or otherwise readable/writable by the korri user after boot
- [ ] Moonlight v4l2m2m can open the decoder without manual chgrp/chmod
- [ ] Bandai -> aka Pipes 2600 reaches an active stream without Initial Ping Timeout

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `../nix-on-rocks`
