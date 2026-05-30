---
id: task-011
title: Harden sessiond system wiring
status: Done
priority: high
labels:
  - sessiond
  - nix
  - runtime
  - wiring
created: 2026-05-29
source: user
---

# Harden sessiond system wiring

## Context

The sessiond deep dive found several deploy/system seams that should be resolved before treating sessiond as the reliable foreground-session supervisor on every host. Kiosk wiring is comparatively explicit, but source-machine and game-stream wiring still have risky edges around token readability, partial configuration, runtime directory permissions, role inference, hardening exceptions, and PATH/env requirements for spawned children.

## Why it matters

A correct state machine is not enough if the unit cannot authenticate clients, spawn children with the expected tools, or start in the intended role. Wiring failures turn into black screens, busy hosts, or launch failures that look like lifecycle bugs.

## Acceptance Criteria

- [ ] Source-machine sessiond token sharing is verified and fixed so the non-root game-stream/Sunshine path can read `KORRI_SESSIOND_TOKEN_FILE` without broad chmod hacks.
- [ ] `services.korri.gameStream.sessiond.url` and `.tokenFile` have a both-or-neither assertion matching the server module posture.
- [ ] Runtime directory mode is made consistent between tmpfiles and token setup (`0700` vs `0755`) with an intentional choice documented in code comments.
- [ ] `services.korri.sessiond.role` inference comments/default text match actual behavior.
- [ ] Kiosk hardening exceptions (`ProtectHome = false`, `ReadWritePaths`) are preserved intentionally and covered by tests or module assertions.
- [ ] PATH/env requirements for `setsid`, `swaymsg`, `gamescope`, shell, renderer binary, and role-specific child processes are verified through Nix eval checks.
- [ ] `just test-nix` and relevant image/module checks pass.

## Related

- `nix/modules/korri-sessiond.nix`
- `nix/modules/korri-game-stream.nix`
- `nix/modules/korri-server.nix`
- `nix/images/kiosk.nix`
- `nix/images/source-machine.nix`
- `nix/tests/korri-sessiond-module-check.nix`
- `nix/tests/korri-server-module-check.nix`
- `nix/tests/korri-source-machine-image-check.nix`
- backlog/task-004 - stop-running-as-root.md

## Notes

Do this before relying on higher-level sessiond behavior in source-machine tests.
