---
id: task-047
title: Shrink root flake to a public delegating contract
status: To Do
priority: medium
labels:
  - nix
  - flake
  - architecture
  - deep-module
  - follow-up
created: 2026-06-07
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: 4007452
  repo: simonwjackson/korri
  invoked_by: user
---

# Shrink root flake to a public delegating contract

## Why it matters

`flake.nix` is currently a 1,168-line mix of public flake API, package graph, image graph, app wrappers, checks, and dev-shell bootstrap. That makes every future Nix change start by reloading unrelated context. A thin root file would make the flake contract obvious and move product/system topology behind deeper modules where the relevant domain language lives.

## Acceptance Criteria

- [ ] `flake.nix` contains only `description`, `inputs`, `nixConfig`, and a single `outputs = inputs: import ./product/systems/nixos/flake inputs;` delegation (or an equally small equivalent).
- [ ] Input pin rationale is preserved in durable docs or in small comments at the owning input; the root file does not carry long-form implementation notes for package/image/check topology.
- [ ] `product/systems/nixos/flake/default.nix` becomes the public flake-output assembler and returns the same output families as before: `packages`, `apps`, `checks`, `devShells`, `lib`, `overlays`, `nixosModules`, and `nixosConfigurations`.
- [ ] Existing public output names continue to resolve, including representative outputs such as `packages.x86_64-linux.korri-portal`, `packages.x86_64-linux.korri-desktop`, `apps.x86_64-linux.korri-cli`, `checks.x86_64-linux.korri-bun-deps-policy`, `overlays.default`, `nixosModules.default`, and RockNix product `nixosConfigurations`.
- [ ] Run `nix flake show` and at least one targeted build/check for each moved output family before considering the root shrink complete.

## Related

- `flake.nix`
- `product/systems/nixos/flake/default.nix`
- `product/systems/nixos/flake/products.nix`
- `docs/solutions/tooling-decisions/align-flake-nixpkgs-to-downstream-pin-for-cache-coherence-2026-05-27.md`

## Notes

Architecture target from 2026-06-07 review: root `flake.nix` should be the public entrypoint only. Suggested target tree under `product/systems/nixos/flake/`: `default.nix` (assembles outputs), `pkgs.nix` (nixpkgs imports/overlays/secondary pins), `sources.nix` (narrowed filesets), `packages.nix`, `apps.nix`, `dev-shells.nix`, `checks.nix`, `modules.nix`, `overlays.nix`, `configurations.nix`, existing `products.nix`, and `rocknix-platform.nix`.
