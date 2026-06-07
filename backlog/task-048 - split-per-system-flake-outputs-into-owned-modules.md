---
id: task-048
title: Split per-system flake outputs into owned modules
status: To Do
priority: medium
labels:
  - nix
  - flake
  - architecture
  - packaging
  - checks
  - dev-shell
created: 2026-06-07
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: 4007452
  repo: simonwjackson/korri
  invoked_by: user
---

# Split per-system flake outputs into owned modules

## Why it matters

Inside the current per-system `let`, unrelated output families share one scope: Bun source slices, product package imports, Electrobun packages, RockNix image systems, app wrappers, native checks, and shell hooks. This gives convenient variable access but poor locality. Moving each output family behind a small Nix module lets a future agent work on packages, checks, apps, or shells without loading the entire flake implementation.

## Acceptance Criteria

- [ ] Add per-output-family modules under `product/systems/nixos/flake/`, with at least `pkgs.nix`, `sources.nix`, `packages.nix`, `apps.nix`, `checks.nix`, and `dev-shells.nix`.
- [ ] Each module has an explicit argument contract instead of relying on one giant shared `let`; for example `apps.nix` consumes resolved packages, `checks.nix` consumes packages/sources/image systems, and `dev-shells.nix` consumes `pkgs`, desktop shell pieces, and the fallow wrapper inputs.
- [ ] Preserve the intentional source invalidation boundaries currently in the `korriSources` fileset block: docs, backlog, artifact downloads, tests, and unrelated Nix/package work must not invalidate device/runtime package builds.
- [ ] Coordinate with `task-035` rather than duplicating it: package/source assembly can either be moved first behind `product.packages` or consumed as the implementation behind the new `packages.nix` output module.
- [ ] The `commonShellHook` fallow wrapper remains available in both `devShells.default` and `devShells.ci`, with the same `PLAYWRIGHT_*`, `.nix-bin`, and `node_modules/.bin` behavior.
- [ ] Representative output checks still work after extraction: build/show `korri-portal`, one Linux runtime package (`korri-cli` or `korri-server`), one app (`korri-cli`), one check (`korri-bun-deps-policy`), and both dev shell attributes.

## Related

- `flake.nix`
- `product/systems/nixos/flake/default.nix`
- `product/systems/nixos/flake/pkgs.nix`
- `product/systems/nixos/flake/sources.nix`
- `product/systems/nixos/flake/packages.nix`
- `product/systems/nixos/flake/apps.nix`
- `product/systems/nixos/flake/checks.nix`
- `product/systems/nixos/flake/dev-shells.nix`
- `backlog/task-035 - move-product-package-and-source-assembly-behind-product-pack.md`
- `tools/testing/nix/korri-rocknix-build-performance-check.nix`

## Notes

Current root landmarks at capture: `packages` starts around line 412, `checks` around line 509, `apps` around line 864, `devShells` around line 969. Existing package/source backlog item `task-035` is narrower and should be treated as the product package/source seam; this item is the broader per-system flake-output split.
