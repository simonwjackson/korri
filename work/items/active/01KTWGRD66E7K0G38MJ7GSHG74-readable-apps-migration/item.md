---
id: 01KTWGRD66E7K0G38MJ7GSHG74
slug: migrate-readable-library-releases-to-apps-app-choices-before
title: Migrate readable library releases to apps[] app choices before Steam v1
origin: parked
status: To Do
priority: high
labels:
  - library-config
  - schema
  - steam
  - migration
created: 2026-06-11
source: se-challenge-plan
---

# Migrate readable library releases to apps[] app choices before Steam v1

## Why it matters

Steam v1 intentionally makes release-level apps[] the canonical launch choice model with no backwards compatibility for release.app/runtime. Existing configs and tests that still use release.app or release.runtime must be migrated first so the Steam work can land as a clean schema break rather than carrying transitional normalization code.

## Acceptance Criteria

- [ ] Tracked readable-library fixtures, tests, and example configs use releases[].apps[] instead of release.app/release.runtime.
- [ ] Schema tests reject release.app and release.runtime with clear diagnostics once apps[] is available.
- [ ] Repository/cascade tests cover single-app releases through apps[] before Steam-specific behavior lands.

## Related

- `work/items/active/01KTWFJXDKS8VYWPV94QTWCBEH-steam-readable-apps-v1/plan.md`
- `product/platform/library/config/records/library-item.ts`
- `product/platform/library/config/readable-cascade-resolver.test.ts`
- `product/platform/library/proseql/library-repository.test.ts`
