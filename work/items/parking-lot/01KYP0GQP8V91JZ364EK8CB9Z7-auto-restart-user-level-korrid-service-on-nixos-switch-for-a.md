---
id: 01KYP0GQP8V91JZ364EK8CB9Z7
slug: auto-restart-user-level-korrid-service-on-nixos-switch-for-a
title: Auto-restart user-level korrid.service on NixOS switch for aka
origin: parked
status: To Do
priority: medium
labels:
  - deploy
  - nixos
  - korrid
created: 2026-07-29
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  repo: korri
---

# Auto-restart user-level korrid.service on NixOS switch for aka

## Why it matters

korrid runs as a systemd user service under user@1000 on aka, so nixos-rebuild switch updates the unit file but never restarts the running process — the previous deploy silently ran 7-day-old code until a manual `systemctl --user restart korrid`. Every future korrid deploy will silently no-op the same way unless the module (or nixie deploy flow) restarts the user unit on activation, e.g. via a system activation script, systemd-activate for user units, or moving korrid to a system service.

## Acceptance Criteria

- [ ] After `nix run .#nixie -- switch aka` with a changed korrid package, `pgrep -af korrid` on aka shows the new store path without manual intervention
- [ ] Running game session (sessiond) survives the korrid restart
