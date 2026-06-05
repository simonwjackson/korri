---
id: task-033
title: Move desktop Nix profile wiring behind product/apps/desktop/default.nix
status: To Do
priority: medium
labels:
  - nix
  - flake
  - desktop
  - architecture
  - electrobun
created: 2026-06-05
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  repo: simonwjackson/korri
  invoked_by: user
---

# Move desktop Nix profile wiring behind product/apps/desktop/default.nix

## Why it matters

flake.nix currently owns Electrobun desktop implementation details: runtime library sets, pkgs2405 cohesive WebKit/GTK device profile policy, shell hook exports, unwrapped build wiring, host/device/x86-kiosk wrapped variants, and the downstream wrap helper. Giving the desktop app a default.nix public Nix interface lets the root flake consume desktop outputs without knowing how the desktop profiles are built, improving locality and making future desktop/handheld profile changes happen beside the desktop package code.

## Acceptance Criteria

- [ ] Add product/apps/desktop/default.nix as the desktop app's public Nix interface; keep product/apps/desktop/nix/*.nix as private implementation details.
- [ ] Move desktop-specific profile wiring from flake.nix into the desktop default.nix seam, including unwrapped, host, device, and x86-kiosk package construction where supported.
- [ ] Expose a small structured contract from the desktop module, e.g. packages.unwrapped, packages.host, packages.device, packages.x86Kiosk, shell/runtime hook data, and lib.wrap.
- [ ] Update flake.nix to import ./product/apps/desktop once and consume the structured desktop outputs instead of importing desktop nix internals directly.
- [ ] Preserve the cohesive pkgs2405 device WebKit/GTK closure invariant and keep the existing desktop build-graph check green.
- [ ] Run nix formatting and the relevant flake checks for desktop package/output wiring.

## Related

- `flake.nix`
- `product/apps/desktop/default.nix`
- `product/apps/desktop/nix/electrobun-binaries.nix`
- `product/apps/desktop/nix/unwrapped.nix`
- `product/apps/desktop/nix/wrap.nix`
- `product/apps/desktop/nix/versions.nix`
- `tools/testing/nix/korri-desktop-build-graph-check.nix`
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`
- `docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md`

## Notes

This is the next flake.nix deepening opportunity after the product/device registry. Prefer ./product/apps/desktop/default.nix over importing a product/apps/desktop/nix/profiles.nix file from the root flake so the app owns its Nix public contract.
