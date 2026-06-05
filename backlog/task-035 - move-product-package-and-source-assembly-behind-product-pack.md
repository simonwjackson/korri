---
id: task-035
title: Move product package and source assembly behind product.packages
status: To Do
priority: medium
labels:
  - nix
  - flake
  - product
  - packaging
  - architecture
created: 2026-06-05
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: user
---

# Move product package and source assembly behind product.packages

## Why it matters

flake.nix currently owns the source-slice policy and package import wiring for shipped product runtime packages: portal, inputd, game-stream, sessiond, CLI, server, gamescope-control bridge, and headlessSource. Those source slices are important build-cache boundaries, especially for device/rootfs performance, but they are product package topology rather than root-flake behavior. Moving them behind ./product with a product.packages contract keeps flake.nix focused on assembling outputs and makes future package additions/change-invalidation rules local to the product boundary.

## Acceptance Criteria

- [ ] Add ./product/default.nix as the product package/source public Nix interface.
- [ ] Expose a structured contract such as product.packages.{portal,inputd,gameStream,sessiond,cli,server,gamescopeControlBridge,headlessSource} and product.sources for the intentional source slices.
- [ ] Move the current korriSources block and non-desktop product package import wiring from flake.nix into ./product/default.nix.
- [ ] Update flake.nix to import ./product once and consume product.packages/product.sources instead of owning the source-slice policy inline.
- [ ] Preserve existing source invalidation boundaries so docs, backlog, artifact downloads, tests, and unrelated Nix/package work do not unnecessarily invalidate device/runtime package builds.
- [ ] Keep the RockNix/rootfs build-performance check green, updating it to read product.sources where appropriate.
- [ ] Run nix formatting and relevant flake/package checks that exercise product package outputs.

## Related

- `flake.nix`
- `product/default.nix`
- `product/apps/portal/package.nix`
- `product/apps/cli/package.nix`
- `product/services/device/nix/inputd.nix`
- `product/services/device/nix/game-stream.nix`
- `product/services/device/nix/sessiond.nix`
- `product/services/device/nix/gamescope-control-bridge.nix`
- `product/services/server/package.nix`
- `tools/testing/nix/korri-rocknix-build-performance-check.nix`

## Notes

Use the name product.packages, not korriProduct or korri.packages. korri.packages would collide conceptually with public flake outputs/self.packages; product.packages matches the ./product boundary and keeps the seam precise.
