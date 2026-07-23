---
id: 01KY5V52XKYXQ7NSSFVA9ZZ1QF
slug: auto-flow-installed-steam-games-into-the-korri-library
title: Auto-flow installed Steam games into the Korri library
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - library
  - discovery
  - scanner
created: 2026-07-22
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  repo: korri
---

# Auto-flow installed Steam games into the Korri library

## Why it matters

Newly-installed Steam games do not appear in the Korri library. The library is hand-curated in korri.yaml (Steam entries are authored with their AppID), and the automatic release scan is disabled for deploy safety plus a known runaway bug (01KWN0HSZV). A fully-installed, launchable game (Roundguard 848030, StateFlags 4) was invisible in the GUI until manually authored. Users reasonably expect installed Steam titles to show up without hand-editing config.

## Acceptance Criteria

- [ ] Installing a Steam game (appmanifest present, StateFlags fully-installed) surfaces it in the Korri library without manual korri.yaml edits.
- [ ] The Steam discovery provider's installed-manifest results merge into the catalog on a safe, bounded trigger (not the runaway full-filesystem scan).
- [ ] Removing/uninstalling a Steam game removes or marks it in the library.

## Related

- `product/plugins/steam/src/discovery.ts`
- `product/platform/library/discovery/release-candidate-scan.ts`
- `var/lib/korri/config/korri.yaml`
- `01KWN0HSZV6CFQ7MT8MDMXR52S`
