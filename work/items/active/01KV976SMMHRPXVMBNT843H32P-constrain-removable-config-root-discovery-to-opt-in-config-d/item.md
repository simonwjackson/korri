---
id: 01KV976SMMHRPXVMBNT843H32P
slug: constrain-removable-config-root-discovery-to-opt-in-config-d
title: Constrain removable config-root discovery to opt-in config directories
origin: parked
status: active
priority: medium
labels:
  - bandai
  - config-graph
  - performance
created: 2026-06-16
source: user-request
---

# Constrain removable config-root discovery to opt-in config directories

## Why it matters

Bandai's removable-media signal pointed at the whole Switch card root, causing ProseQL config graph scans to time out and peg korrid CPU. Removing the runtime symlink fixed catalog/dry-run responsiveness, but a persistent fix should avoid scanning entire media roots and only expose explicit config subdirectories/fragments.

## Acceptance Criteria

- [ ] Removable media config-root signal targets an explicit small config directory or is ignored when no opt-in config exists.
- [ ] Catalog snapshot on Bandai stays below the normal RPC timeout with the Switch card mounted.
- [ ] No full-card recursive scan occurs for **/*.korri.* discovery.

## Related

- `product/platform/library/library-source-layer-live.ts`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
