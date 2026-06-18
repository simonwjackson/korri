---
id: 01KVCFX2B3TX847Q6S4A7XCNAM
slug: refresh-fulfilled-plugin-resources-when-installable-outputs-
title: Refresh fulfilled plugin resources when installable outputs change
origin: parked
status: To Do
priority: medium
labels:
  - plugins
  - nix
  - runtime
created: 2026-06-18
source: se-work
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/street-fighter-x-mega-man-trunk
  branch: feat/street-fighter-x-mega-man-trunk
  repo: korri
---

# Refresh fulfilled plugin resources when installable outputs change

## Why it matters

Bandai kept using a stale `/var/lib/korri/plugins/resources/.../result` symlink after the SFXMM package output changed, which made managed dry-runs resolve an old launcher until the symlink was manually refreshed. Plugin resource fulfillment should detect stale outputs or expose an explicit refresh path so deploys do not silently keep old runtime wrappers.

## Acceptance Criteria

- [ ] Plugin resource dry-run/fulfillment can detect when the resolved Nix installable output differs from the existing `result` symlink.
- [ ] A changed first-party plugin package can be refreshed without manually editing `/var/lib/korri/plugins/resources`.
- [ ] A regression test covers stale symlink replacement for executable resources.

## Related

- `product/platform/plugin/resources.ts`
- `product/apps/portal/api/plugins/fulfill-resource.rpc-handler.ts`
- `product/plugins/street-fighter-x-mega-man/packages/street-fighter-x-mega-man/default.nix`
