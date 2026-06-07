---
id: task-050
title: Group flake checks by contract owner
status: To Do
priority: medium
labels:
  - nix
  - flake
  - checks
  - architecture
  - verification
created: 2026-06-07
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: 4007452
  repo: simonwjackson/korri
  invoked_by: user
---

# Group flake checks by contract owner

## Why it matters

The current `checks` output is a long concatenation of native module checks, package-output checks, composed-system checks, patch contract checks, product payload checks, and standard-check aggregation. When a check fails or a new contract is added, maintainers must scan unrelated validation surfaces. Grouping checks by owner makes the Nix checks express the architecture: module contracts, package contracts, image/system contracts, vendor patch contracts, and RockNix product payload contracts.

## Acceptance Criteria

- [ ] Extract the `checks` output into `product/systems/nixos/flake/checks.nix` or a small check-suite directory imported by it.
- [ ] Preserve all existing check names so CI and `just` recipes do not lose their target attributes.
- [ ] Group check construction by owner/category instead of by incidental line order: module eval checks, package-output checks, composed-system/image checks, vendor patch checks, live-USB checks, RockNix product/payload checks, and standard aggregate checks.
- [ ] Keep `korri-standard-native` as an explicit aggregate over named checks and preserve the owner matrix semantics currently passed to `korri-standard-native-check.nix`.
- [ ] Make dependencies explicit at the check-suite boundary: `pkgs`, `packages`, `apps`, `sources`, image systems, product registry, configurations, and platform fact files should be passed in deliberately.
- [ ] Run `nix flake check` or targeted `nix build .#checks.<system>.<name>` for at least one check in each group after extraction.

## Related

- `flake.nix`
- `product/systems/nixos/flake/checks.nix`
- `tools/testing/nix/korri-standard-native-check.nix`
- `tools/testing/nix/korri-package-outputs-check.nix`
- `tools/testing/nix/korri-image-outputs-check.nix`
- `tools/testing/nix/korri-rocknix-product-payload-check.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `tools/testing/nix/korri-live-usb-config-check.nix`

## Notes

Current check block starts around line 509 in `flake.nix`. It includes always-on module checks (`korri-bun-deps-policy`, `korri-compositor-module`, `korri-input-module`, `korri-game-stream-module`, `korri-sessiond-module`, `korri-source-machine-image`, `korri-server-module`, `korri-module-identity-audit`), Linux vendor/package checks, x86 image/product/live-USB checks, RockNix payload checks, and `korri-standard-native` owner matrix. This item can be done after or alongside `task-048`; if `task-048` creates only a single `checks.nix`, this item deepens that module further.
