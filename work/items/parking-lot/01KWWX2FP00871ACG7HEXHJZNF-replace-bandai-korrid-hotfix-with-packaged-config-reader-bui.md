---
id: 01KWWX2FP00871ACG7HEXHJZNF
slug: replace-bandai-korrid-hotfix-with-packaged-config-reader-bui
title: Replace Bandai korrid hotfix with packaged config-reader build
origin: parked
status: To Do
priority: high
labels:
  - plugin-host
  - bandai
  - nix
  - follow-up
created: 2026-07-06
source: se-debug
---

# Replace Bandai korrid hotfix with packaged config-reader build

## Why it matters

Bandai is currently fixed by a user-service ExecStart override that runs a corrected local korrid.js bundle. This restores Store search now, but it is operational drift and can be lost or conflict with future system switches unless the aarch64 Nix package/toplevel is made to include the committed plugin config-reader code.

## Acceptance Criteria

- [ ] Bandai's packaged /nix/store korrid bundle contains plugins.json/localRoots/KORRI_PLUGIN_CONFIG config-reader code.
- [ ] korrid.service ExecStart points back to the packaged /nix/store korrid binary with no 95-local-plugin-config-hotfix.conf override.
- [ ] Store same-origin /api/rpc search returns @local providers after a normal nixos-rebuild switch and service restart.
- [ ] Document or test the package/toplevel dependency so plugin-host config changes invalidate the SM8550 korrid derivation.

## Related

- `product/plugin-host/config.ts`
- `product/plugin-host/state.ts`
- `product/plugin-host/acquisition.ts`
- `product/apps/portal/api/server/rpc-server.ts`
- `product/services/server/package.nix`
- `product/systems/nixos/flake/sources.nix`
