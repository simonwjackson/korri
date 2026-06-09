---
id: 01KTPAJV90Z4X34YSBJAYWGAWC
slug: harden-user-mode-korrid-and-korri-inputd-systemd-sandboxes
title: "Harden user-mode korrid and korri-inputd systemd sandboxes"
origin: parked
legacy: backlog/task-092
status: To Do
priority: medium
labels:
  - "security"
  - "systemd"
  - "rootless-korri-runtime"
created: 2026-06-09
source: se-code-review
---

# Harden user-mode korrid and korri-inputd systemd sandboxes

## Why it matters

Security review noted that moving korrid and korri-inputd into user services removed or bypassed some system-mode sandbox assumptions. Tightening user-service hardening reduces blast radius if either daemon is compromised while preserving required input/render access.

## Acceptance Criteria

- [ ] korrid user service has explicit applicable sandboxing directives documented/tested for user-mode systemd.
- [ ] korri-inputd user service has explicit applicable sandboxing directives documented/tested for user-mode systemd.
- [ ] Nix module checks assert the chosen hardening directives do not regress.

## Related

- `product/systems/nixos/modules/korri-daemon.nix`
- `product/systems/nixos/modules/korri-input.nix`
- `tools/testing/nix/korri-daemon-module-check.nix`
- `tools/testing/nix/korri-input-module-check.nix`

## Notes

Raised as SEC-F2/SEC-F3 during rootless runtime implementation review.
