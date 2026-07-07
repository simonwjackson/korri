---
id: 01KWXHYFPRBSKFJGZ0ZEDPXKKV
slug: route-removable-media-scans-to-card-local-config-files
title: Route removable-media scans to card-local config files
origin: parked
status: To Do
priority: high
labels:
  - library
  - removable-media
  - scout
  - follow-up
created: 2026-07-07
source: user
---

# Route removable-media scans to card-local config files

## Why it matters

Raw ROM auto-discovery should preserve the card as the owner of its generated library metadata. If Scout always writes discovered games to the internal config file, card-specific games become sticky after removal and SD cards do not maintain their own portable library state.

## Acceptance Criteria

- [ ] Scanning a removable storage root writes generated library entries to a card-local file such as `.korri/auto.korri.yaml` instead of `/var/lib/korri/config/korri.yaml`.
- [ ] Internal/non-removable storage scans continue to write to the existing local config path.
- [ ] Generated card files are separate from user-authored card fragments and are safe to recreate/update idempotently.
- [ ] Read-only/remounted-ro cards are detected and skipped or routed to internal fallback with an explicit diagnostic.
- [ ] The scan service sandbox allows only the necessary removable-media write path and remains constrained.
- [ ] Insert/remove validation shows discovered card games appear when the SD card is mounted and disappear when it is removed.

## Related

- `product/platform/library/discovery/release-candidate-scan.ts`
- `product/platform/library/library-source-layer-live.ts`
- `product/platform/library/proseql/config-graph-db.ts`
- `product/surfaces/terminal/korri-cli/scout-command.ts`
- `product/systems/nixos/modules/korri-daemon.nix`
- `product/systems/nixos/modules/korri-removable-media.nix`

## Notes

Exploration finding: scanner has a configPath knob, but boot scan currently hardcodes the internal local config. KorriConfigGraphRoot already carries writable?: boolean, but no authoring/write-target routing uses it yet. Proposed seam: resolve a per-storage write target; for SD card `/run/media/korri/<uuid>/roms`, write to `/run/media/korri/<uuid>/.korri/auto.korri.yaml` and publish/read that config root. Avoid mutating user-authored card files.
