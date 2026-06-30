---
id: 01KWCX54434N0MSHMHWN6FHD37
slug: deduplicate-scanner-candidates-against-authored-library-entr
title: Deduplicate scanner candidates against authored library entries
origin: parked
status: In Progress
priority: high
labels:
  - scanner
  - library
  - dedupe
  - roms
created: 2026-06-30
source: se-debug
---

# Deduplicate scanner candidates against authored library entries

## Why it matters

Bandai cleanup showed the ROM scanner currently reserves only generated IDs and can add catalog entries for files already represented by manual/authored library entries. This creates duplicate games when scanner output and curated entries point to the same storage path or content hash.

## Acceptance Criteria

- [ ] Scanner builds a claimed-content index from existing effective library entries before adding candidates.
- [ ] A scanned file is skipped or merged when an existing manual entry has the same normalized storage+path, resolved absolute path, or content hash.
- [ ] Overlapping storage roots are detected or warned about so one physical SD card cannot be scanned twice under two storage keys.
- [ ] Tests cover manual ROM entry plus scanner candidate for the same file, and overlapping storage roots on the same card.

## Related

- `product/platform/library/discovery/rom-scan-classifier.ts`
- `product/platform/library/discovery/release-candidate-scan.ts`
- `/var/lib/korri/config/korri.yaml`
- `bandai cleanup 2026-06-30`

## Notes

Immediate Bandai cleanup rewrote generated scanner config to use only storage key `2tb-micro-sd`, removed stale active-root YAML backups, and deleted duplicate `roms/gba/wl4.gba`. Final verification: 53 entries, 0 duplicate hash groups, 0 duplicate storage+path groups.
