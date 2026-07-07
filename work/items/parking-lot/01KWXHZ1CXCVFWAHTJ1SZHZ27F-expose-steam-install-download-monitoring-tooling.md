---
id: 01KWXHZ1CXCVFWAHTJ1SZHZ27F
slug: expose-steam-install-download-monitoring-tooling
title: Expose Steam install/download monitoring tooling
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - tooling
  - install-control
  - observability
created: 2026-07-07
source: user
context:
  cwd: .
  branch: trunk
  repo: korri
---

# Expose Steam install/download monitoring tooling

## Why it matters

Steam installs currently require ad-hoc SSH scraping when the active assistant tool surface lacks install-control-aware status calls, and the existing Korri status can lag behind Steam's real staging progress. First-class monitoring would reduce operator friction and prevent misleading progress reports during large downloads like Spider-Man 2.

## Acceptance Criteria

- [ ] A callable assistant tool can query `app.plugin.install.status` with install-control auth without printing secrets.
- [ ] The tool reports Steam manifest state, bytes downloaded/to-download, staged/download directory size, and recent content-log status for a target AppID.
- [ ] The tool handles remote source machines such as AKA using local auth/trusted peer validation rather than raw secret forwarding.
- [ ] Progress output clearly distinguishes Korri RPC state from raw Steam evidence when they disagree.

## Related

- `packages/pi-korrid-tools/src/korrid-tools.ts`
- `product/apps/portal/api/plugin-install/status.rpc-handler.ts`
- `product/plugins/steam/src/observability/install-state.ts`
