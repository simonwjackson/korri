---
id: 01KV78XS430G00YCC5WS5FCBN5
slug: rename-provider-migrated-source-modules
title: Rename provider-migrated source-* modules
origin: parked
status: To Do
priority: low
labels:
  - provider-claims
  - cleanup
created: 2026-06-16
source: se-work
---

# Rename provider-migrated source-* modules

## Why it matters

The provider/claim migration removed sourceName and SourceCandidate contracts, but several implementation file names still carry old source-* labels. Renaming them later will reduce cognitive friction without changing runtime behavior.

## Acceptance Criteria

- [ ] Provider acquisition modules use provider/claim filenames for search, details, validation, and health.
- [ ] Imports no longer reference provider-migrated source-* module paths.
- [ ] Typecheck and targeted acquisition tests pass after the rename.

## Related

- `product/platform/acquisition/source-details.ts`
- `product/platform/acquisition/source-search.ts`
- `product/platform/acquisition/source-names.ts`
- `product/platform/acquisition/validation/source-validation.ts`
- `product/platform/protocol/acquisition/source-health.ts`
