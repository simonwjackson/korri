---
id: 01KWNPB86M0S6JVQBXQHDT2HC8
slug: add-a-check-that-nix-rendered-plugin-settings-decode-against
title: Add a check that Nix-rendered plugin settings decode against the plugin policy schemas
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - nix
  - schema-skew
  - ci
  - regression-guard
created: 2026-07-04
source: se-debug
---

# Add a check that Nix-rendered plugin settings decode against the plugin policy schemas

## Why it matters

The rpcs3 command/env migration (f7d2f867) tightened the TS policy schema (STRICT unknown-key rejection) but the plugin's Nix module kept rendering the removed command key, so every host built from trunk bricked its own RPCS3 launches at materialization (fixed in cdfcd156). Nothing cross-checks what nix/nixos-module.nix renders into settings.plugin / host.plugin against what src/policy.ts accepts, so TS-side schema migrations can silently strand Nix renderings. A flake check that evaluates each plugin's module platformDefaults and runs the rendered plugin settings through the plugin's decode function (or a golden-file equivalent) would catch this class at CI time for all plugins, not just rpcs3.

## Acceptance Criteria

- [ ] A check fails when a plugin nix module renders a key its TS policy schema rejects (reproduce with the removed rpcs3 command key).
- [ ] Covers at least rpcs3 and one other plugin with a nix module rendering settings.plugin/host.plugin.
- [ ] Runs in just test-nix / flake checks.

## Related

- `product/plugins/rpcs3/nix/nixos-module.nix`
- `product/plugins/rpcs3/src/policy.ts`
