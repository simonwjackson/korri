---
id: 01KTPAJV8XRPDXEFFT1H4CAGFT
slug: decide-korri-appliance-persistence-failure-policy
title: "Decide Korri appliance persistence failure policy"
origin: parked
legacy: backlog/task-083
status: To Do
priority: medium
labels:
  - "architecture"
  - "persistence"
  - "rootless-runtime"
  - "nix"
created: 2026-06-09
source: user
---

# Decide Korri appliance persistence failure policy

## Why it matters

The rootless Korri runtime design depends on durable `/home/korri` and `/var/lib/korri`, but the product behavior when persistence is missing or unsafe is unresolved. Deferring this explicitly prevents accidental `/storage` leakage or silent ephemeral state loss during the clean-break migration.

## Acceptance Criteria

- [ ] A policy is chosen for missing/unsafe persistence: fail visibly, fallback ephemeral with marker, or product-specific behavior.
- [ ] The policy is encoded in Korri image/root setup contracts, especially `korri-setup.service`, not hidden in RockNIX-specific paths.
- [ ] The policy preserves the clean guest path contract: Korri runtime still sees `/home/korri`, `/var/lib/korri`, `/var/lib/korri/content/games`, and XDG/runtime paths, not `/storage`.
- [ ] Nix checks or smoke tests prove the selected behavior for at least kiosk, source-machine, and headless images.
- [ ] Operator/user-facing diagnostics clearly state whether state is durable or ephemeral.

## Related

- `docs/plans/2026-06-09-001-refactor-rootless-korri-runtime-plan.md`
- `product/systems/nixos/images/live-usb-runtime.nix`
- `product/systems/nixos/images/common.nix`
- `product/systems/nixos/modules/korri-compositor.nix`
- `product/systems/nixos/modules/korri-daemon.nix`
- `product/systems/nixos/modules/korri-setup.nix`
