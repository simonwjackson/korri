---
id: 01KTWPQN3M0TED877M2ESWK4D2
slug: revisit-source-provenance-modeling-in-readable-library-confi
title: Revisit source/provenance modeling in readable library config
origin: parked
status: To Do
priority: high
labels:
  - library-config
  - sources
  - provenance
  - schema
created: 2026-06-12
source: se-challenge-plan
---

# Revisit source/provenance modeling in readable library config

## Why it matters

The Steam app-choice design exposed ambiguity around whether sources should influence launch behavior or appear at release level. We need a focused pass to ensure external service/provider metadata does not leak too much into user-authored config, while still preserving provenance, storage resolution, metadata-only releases, and mixed-origin library items.

## Acceptance Criteria

- [ ] Document which concepts belong to sources versus systems, releases, storage, and metadata evidence.
- [ ] Decide whether release-level source is removed, replaced, or constrained to provenance-only use.
- [ ] Define how mixed-origin items represent Steam, ROM, and metadata provenance without making sources drive launch behavior.
- [ ] Define how file target storage resolution works if release-level source is removed.
- [ ] Update or create a readable-library schema example that reflects the chosen source/provenance model.

## Related

- `work/items/active/01KTWFJXDKS8VYWPV94QTWCBEH-steam-readable-apps-v1/plan.md`
- `docs/brainstorms/2026-06-11-001-steam-readable-library-example.korri.yaml`
- `product/platform/library/config/records/source.ts`
- `product/platform/library/config/records/library-item.ts`
- `product/platform/library/config/source-target-resolution.ts`
