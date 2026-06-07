---
id: task-049
title: Move RockNix product system selection behind a platform seam
status: To Do
priority: medium
labels:
  - nix
  - flake
  - rocknix
  - architecture
  - product
created: 2026-06-07
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: 4007452
  repo: simonwjackson/korri
  invoked_by: user
---

# Move RockNix product system selection behind a platform seam

## Why it matters

The bottom half of `flake.nix` currently owns RockNix-specific product topology: explicit product configs, by-compatible env handling, chipset inference, platform adapter selection, and kiosk system construction. That policy is real product/system behavior, not root flake boilerplate. A named platform seam would concentrate the compatible-string/chipset decision and keep `nixosConfigurations` as an output declaration rather than an algorithm.

## Acceptance Criteria

- [ ] Add a focused module such as `product/systems/nixos/flake/rocknix-platform.nix` that owns `ROCKNIX_GUEST_DEVICE_COMPATIBLE` handling, product chipset inference, and mapping products to platform adapter modules.
- [ ] Add `product/systems/nixos/flake/configurations.nix` that consumes the product registry and platform seam to expose the same `nixosConfigurations` names as today.
- [ ] Keep `product/systems/nixos/flake/products.nix` as the source of product identity, config aliases, package aliases, compatible strings, build targets, and device profiles.
- [ ] Preserve current behavior for explicit products: `korri-odin2portal-kiosk`, `korri-thor-kiosk`, and `korri-rg353m-kiosk` continue to build/evaluate from the same device profiles and platform adapters.
- [ ] Preserve current by-compatible behavior: when `ROCKNIX_GUEST_DEVICE_COMPATIBLE` is set, `korri-kiosk-by-compatible` and related package aliases still select RK3566 for `rockchip,rk3566-rk817-tablet` / `rockchip,rk3566`, otherwise SM8550.
- [ ] Add or keep a pure Nix check that proves explicit product aliases and by-compatible selection do not drift after the extraction.

## Related

- `flake.nix`
- `product/systems/nixos/flake/products.nix`
- `product/systems/nixos/flake/rocknix-platform.nix`
- `product/systems/nixos/flake/configurations.nix`
- `product/systems/nixos/images/common.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/images/platforms/rocknix-rk3566.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `tools/testing/nix/korri-rocknix-product-payload-check.nix`

## Notes

Current inline policy to extract: `rocknixTargetSystem = "aarch64-linux"`; import `products.nix`; derive `explicitProductList`, `byCompatibleProduct`, and `attrsForProducts`; import `images/common.nix` with `nix-on-rocks.inputs.nixpkgs`; define `hasRocknixGuestCompatible`; infer chipset from product or `ROCKNIX_GUEST_DEVICE_COMPATIBLE`; choose `rocknix-rk3566.nix` for RK3566 compatibles and `rocknix-sm8550.nix` otherwise; call `rocknixImages.mkKioskSystem` for explicit and by-compatible systems.
