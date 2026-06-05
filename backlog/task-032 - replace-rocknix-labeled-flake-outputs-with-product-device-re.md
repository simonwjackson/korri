---
id: task-032
title: Replace RockNix-labeled flake outputs with product/device registry
status: In Progress
priority: medium
labels:
  - nix
  - flake
  - architecture
  - product-labels
  - substrate
created: 2026-06-05
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: user
---

# Replace RockNix-labeled flake outputs with product/device registry

## Why it matters

The root flake is outgrowing its role and currently exposes RockNix as product identity in package, configuration, and check labels. Moving product/device output truth into a registry lets Korri present public labels like Thor/Odin2Portal while keeping RockNix as an internal substrate detail, reducing drift across packages, checks, apps, and payload wiring.

## Acceptance Criteria

- [ ] Add a product/device registry that defines Thor and Odin2Portal product-facing metadata and keeps substrate = rocknix internal.
- [ ] Rename public flake package outputs to product/device labels only, e.g. korri-thor-kiosk-system, korri-thor-rootfs, korri-thor-product-payload, korri-odin2portal-kiosk-system, korri-odin2portal-rootfs, korri-odin2portal-product-payload.
- [ ] Rename NixOS configuration outputs to product/device labels only, e.g. korri-thor-kiosk and korri-odin2portal-kiosk.
- [ ] Remove old korri-rocknix-* public package/configuration aliases; no backwards compatibility aliases.
- [ ] Derive rootfs, kiosk system, product payload, payload-check specs, and standard native owner entries from the registry where practical.
- [ ] Update checks, just recipes, workflows, and references to assert/use the new product-facing names only while leaving implementation paths such as product/systems/rocknix/ unchanged.

## Related

- `flake.nix`
- `product/systems/rocknix/product-payload.nix`
- `product/systems/rocknix/product-payload-contract.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `tools/testing/nix/korri-rocknix-product-payload-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `tools/testing/nix/korri-standard-native-check.nix`

## Notes

User explicitly requested no backwards compatibility. Keep RockNix accurate in implementation paths and internal substrate metadata, but remove it from public labels/output identity.
