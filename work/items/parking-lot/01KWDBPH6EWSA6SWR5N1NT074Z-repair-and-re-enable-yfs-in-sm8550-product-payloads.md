---
id: 01KWDBPH6EWSA6SWR5N1NT074Z
slug: repair-and-re-enable-yfs-in-sm8550-product-payloads
title: Repair and re-enable YFS in SM8550 product payloads
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - sm8550
  - yfs
  - follow-up
created: 2026-06-30
source: se-work
context:
  branch: work/disable-yfs-for-sm8550-payload
  commit: b51aae80
  repo: korri
---

# Repair and re-enable YFS in SM8550 product payloads

## Why it matters

Yoshi's Fabrication Station is temporarily removed from the SM8550 guest composition to unblock Thor branding/host rebuild payload generation after the upstream web-export fetch returned HTTP 522. Leaving it disabled permanently would silently remove YFS launch support from Bandai/Sobo.

## Acceptance Criteria

- [ ] YFS upstream web export is fetched from a stable, mirrored, or content-addressed source.
- [ ] `nix build .#packages.aarch64-linux.korri-thor-product-payload --no-link` succeeds with YFS enabled.
- [ ] SM8550 `KORRI_ENABLED_PLUGINS`, sessiond PATH, platform defaults, and system packages include YFS again intentionally.
- [ ] A launch/dry-run smoke confirms the YFS launcher is visible and resolves on SM8550.

## Related

- `korri: product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `korri commit b51aae80`
- `nix-on-rocks work/items/active/01KWD5FCKECTZYX0K9SDSD3EXZ-sm8550-thor-boot-fix-branding/plan.md`
