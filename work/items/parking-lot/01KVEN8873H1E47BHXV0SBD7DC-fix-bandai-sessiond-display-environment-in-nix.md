---
id: 01KVEN8873H1E47BHXV0SBD7DC
slug: fix-bandai-sessiond-display-environment-in-nix
title: Fix bandai sessiond display environment in Nix
origin: parked
status: To Do
priority: high
labels:
  - nixos
  - bandai
  - sessiond
  - steam
created: 2026-06-19
source: se-debug
---

# Fix bandai sessiond display environment in Nix

## Why it matters

After deploying trunk, korri-sessiond could not reach home because Electrobun inherited DISPLAY=:0 while sway/Xwayland was actually on :2, causing GTK 'cannot open display'. A manual user-service drop-in was needed on bandai before 30XX could launch.

## Acceptance Criteria

- [ ] bandai deployment starts korri-sessiond to mode home without manual user-service drop-ins
- [ ] Electrobun logs no longer show GTK 'cannot open display: :0' after switch/restart
- [ ] 30XX launch preflight succeeds from a clean deployed system

## Related

- `product/systems/nixos/modules`
- `/home/korri/.config/systemd/user/korri-sessiond.service.d/display.conf on bandai`

## Notes

Runtime workaround used during launch test: set DISPLAY=:2 and GDK_BACKEND=x11 for korri-sessiond; Xwayland socket observed at /tmp/.X11-unix/X2.
