---
id: 01KZANM6TYQG0F7R0A1XM35457
slug: harden-discovery-hash-cache-against-preserved-metadata-repla
title: Harden discovery hash cache against preserved metadata replacement
origin: parked
status: To Do
priority: medium
labels:
  - discovery
  - integrity
  - performance
created: 2026-08-06
source: se-work
context:
  cwd: korri
  branch: feat/user-selected-game-discovery
  repo: korri
  invoked_by: final adversarial review
---

# Harden discovery hash cache against preserved metadata replacement

## Why it matters

Discovery intentionally avoids rereading unchanged ROMs by trusting canonical path, size, and mtime. A tool that replaces bytes while preserving both size and timestamp can leave catalog identity/cover metadata describing old content while launch uses new bytes. This is rare but becomes more plausible with sync/copy tools.

## Acceptance Criteria

- [ ] A real-device-compatible freshness signal or bounded verification policy detects same-size/same-mtime byte replacement without rehashing every unchanged ROM on every scan.
- [ ] Identity-sensitive enrichment and launch never trust stale cached hashes after detected replacement.
- [ ] Performance evidence shows unchanged normal rescans still avoid full ROM reads.

## Related

- `services/korrid/src/discovery/scanner.rs`
- `services/korrid/src/launcher/retroarch.rs`
- `work/items/active/019fd344-b57a-723d-a089-762d7ca0b7e5-user-selected-game-discovery/plan.md`
