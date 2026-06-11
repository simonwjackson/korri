---
id: 01KTVX0FH3M3CVCQ8CCG53GV8S
slug: sweep-config-paths-for-storage-template-tokens
title: Sweep config paths for storage template tokens
origin: parked
status: To Do
priority: medium
labels:
  - config-graph
  - storage
  - follow-up
created: 2026-06-11
source: se-challenge-plan
---

# Sweep config paths for storage template tokens

## Why it matters

Ryubing path planning exposed repeated absolute media-root paths. Other config surfaces likely have similar path fields that would be safer and more portable with explicit storage-root tokens instead of duplicated mount paths.

## Acceptance Criteria

- [ ] Inventory config schemas with filesystem path fields.
- [ ] Identify where `{storage:<id>}`-style tokens improve portability without weakening trust boundaries.
- [ ] Add or plan token support for appropriate surfaces with tests for unresolved tokens and path escape prevention.

## Related

- `work/items/active/01KTVNVZSZ4J4YRZPARV25BK6H-ryubing-app-kind/plan.md`
- `out/tmp/ryubing-full.korri.yaml`
