---
id: 01KW3XE9BVJ3JSMPKQKKZ49095
slug: force-real-target-inputplumber-map-builds-in-platform-checks
title: Force real target InputPlumber map builds in platform checks
origin: parked
status: To Do
priority: medium
labels:
  - nix
  - inputplumber
  - testing
created: 2026-06-27
source: se-work
context:
  cwd: worktree:.worktrees/refactor/inputplumber-platform-policy
  branch: refactor/inputplumber-platform-policy
  repo: korri
---

# Force real target InputPlumber map builds in platform checks

## Why it matters

The new helper check proves xb360 patch logic with host fixtures, but composed SM8550/RK3566 checks still avoid building aarch64 InputPlumber outputs because host-only checks hit platform mismatch. A future target-aware check or builder-backed validation would catch upstream YAML path drift before device deployment.

## Acceptance Criteria

- [ ] A check builds or otherwise inspects the real SM8550 `02-ayn-controller.yaml` and RK3566 `01-rg353m.yaml` patched outputs.
- [ ] The check asserts `xb360` is present and `xbox-series` is absent in both real target maps.
- [ ] The check runs in CI or documents the required target builder path instead of failing on x86 platform mismatch.

## Related

- `product/systems/nixos/images/inputplumber-platform-helpers.nix`
- `tools/testing/nix/korri-inputplumber-xb360-helper-check.nix`
- `tools/testing/nix/korri-rocknix-rk3566-config-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
