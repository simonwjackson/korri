---
id: 01KVEVWAK7QN2C410MSVSGB1PX
slug: 3dsen-box64-turnip-plugins
title: Productize 3dSen with Box64 and Turnip plugins
status: active
created: 2026-06-19
source: se-plan
origin: work/items/active/01KVEVWAK7QN2C410MSVSGB1PX-3dsen-box64-turnip-plugins/item.md
---

# Productize 3dSen with Box64 and Turnip plugins

Plan the first-party plugin work needed to turn the validated manual 3dSen Box64 + Turnip launch into reusable Korri infrastructure and app-like configured release behavior.

## 2026-06-19 implementation pass

Implemented the planned productization slices on branch `feat/3dsen-box64-turnip-plugins`:

- U1: extended `@korri:turnip` with a reusable `launch.compose` companion policy/wrapper.
- U2: added `@korri:box64-runtime` as a reusable runtime/launch companion plugin and Nix package skeleton.
- U3: added generic `launch.prepare` support and wired Korri control dry-run/check vs launch/commit execution.
- U4: added `@korri:3dsen` app integration, multi-profile ROM registry generation, launch.prepare handler, and readable launch materialization for `-id=<profile>`.
- U5: added staged executable resources so configured payload roots can resolve without committing proprietary game files.
- U6: registered Box64 and 3dSen as first-party plugins and exposed the 3dSen readable launch integration when enabled.
- U7: enabled the composed 3dSen/Box64/Turnip path for SM8550 sessiond/korrid plugin environments and documented Xwayland direct-launch defaults.

Verification:

```sh
bun test product/plugins/box64-runtime/src/plugin.test.ts product/plugins/box64-runtime/src/launch-companion/policy.test.ts product/plugins/box64-runtime/src/launch-companion/wrapper.test.ts product/plugins/turnip/src/plugin.test.ts product/plugins/turnip/src/launch-companion/policy.test.ts product/plugins/turnip/src/launch-companion/wrapper.test.ts product/plugins/3dsen/src/plugin.test.ts product/plugins/3dsen/src/rom-registry.test.ts product/plugins/3dsen/src/launch-prepare.test.ts product/plugins/3dsen/src/readable-launch-integration.test.ts product/platform/plugin/launch-prepare.test.ts product/platform/plugin/catalog-library-source.test.ts product/platform/control/korri-control-live.test.ts product/platform/plugin/staged-resource.test.ts product/platform/plugin/resources.test.ts product/plugins/index.test.ts product/systems/nixos/flake/plugins.test.ts
# 81 pass, 0 fail
```

`just typecheck` was also run. It still fails on known unrelated portal route / Mega Man Maker / PortMaster / SMW Central issues; the pass confirmed no remaining errors in the new 3dSen, Box64, Turnip, launch-prepare, staged-resource, readable-launch, or SM8550 files.
