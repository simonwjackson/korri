---
id: 01M1FAJABCE7XNZM79PAB4KKNX
slug: restore-korri-owned-headless-sway-compositor-on-zao
title: Restore Korri-owned headless Sway compositor on Zao
origin: parked
status: In Progress
priority: high
labels:
  - streaming
  - headless
  - wayland
  - sway
  - inputd
created: 2026-09-01
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/restore-linux-inputplumber
  branch: feat/restore-linux-inputplumber
  commit: 0d850dab0becd817347306dda1e170a35cffab22
  repo: korri
---

# Restore Korri-owned headless Sway compositor on Zao

## Why it matters

Sway/Wayland is a project requirement for real workspace and window switching. The persistent Xvfb consumer proves streaming transport but has no compositor semantics, uses a validation fixture instead of workspace switching, and underfeeds 1080p120 through CPU-backed X11 capture. The final host architecture must provide a GPU-backed headless Wayland session that Sunshine can capture without exposing compositor authority to games.

## Acceptance Criteria

- [ ] Korri's Linux host module starts a headless Sway/wlroots compositor and replaces x11-headless as the game-session display owner
- [ ] Korrid game scopes receive only the required WAYLAND_DISPLAY/Xwayland environment and cannot access compositor IPC authority
- [ ] Inputd workspace-prev/workspace-next and window movement actions invoke immutable bounded compositor commands and are physically/automatically verified
- [ ] Sunshine captures the compositor's actual output rather than an Xwayland root or blank surface
- [ ] Moving 1080p60 remains green and 1080p120 is either sustained or explicitly capped/fails closed
- [ ] Zao persistently consumes the compositor through only nixosModules.korri-linux-host

## Related

- `services/inputd/nix/korri-linux-host.nix`
- `services/inputd/nix/korri-input.nix`
- `services/korrid/src/host/`
- `services/sunshine/`
- `work/items/active/019fde6b-8c02-7b01-8dfb-ffe97bcb5ef1-restore-linux-inputplumber/work.md`
