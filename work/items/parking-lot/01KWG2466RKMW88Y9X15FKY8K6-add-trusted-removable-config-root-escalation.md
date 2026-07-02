---
id: 01KWG2466RKMW88Y9X15FKY8K6
slug: add-trusted-removable-config-root-escalation
title: Add trusted removable config-root escalation
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - removable-media
  - config-cascade
created: 2026-07-02
source: user
---

# Add trusted removable config-root escalation

## Why it matters

SD-card Korri config roots are intentionally restricted to data collections, so launcher/runtime/global cascade cannot be validated or operated directly from removable media. A trusted-card marker or explicit dev-mode trust path would allow full-power config roots without making every inserted card execution-privileged.

## Acceptance Criteria

- [ ] Default removable media roots remain restricted to library/collections/users.
- [ ] A documented trusted-marker or explicit dev option allows a removable .korri root to contribute launchers/runtimes/profiles/host/global sections.
- [ ] Diagnostics clearly report when privileged sections are ignored on untrusted cards versus accepted on trusted cards.
- [ ] Tests cover untrusted restriction, trusted escalation, symlink-escape protection, and deterministic root ordering.

## Related

- `product/platform/library/proseql/config-graph-db.ts`
- `product/platform/library/library-source-layer-live.ts`
- `product/systems/nixos/modules/korri-removable-media.nix`
