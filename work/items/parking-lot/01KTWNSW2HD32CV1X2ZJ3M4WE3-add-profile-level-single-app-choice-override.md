---
id: 01KTWNSW2HD32CV1X2ZJ3M4WE3
slug: add-profile-level-single-app-choice-override
title: Add profile-level single app-choice override
origin: parked
status: To Do
priority: medium
labels:
  - library-config
  - profiles
  - steam
  - schema
created: 2026-06-12
source: se-challenge-plan
---

# Add profile-level single app-choice override

## Why it matters

Steam and emulator launch modes will eventually need profile-specific app-choice overrides such as battery-mode Steam LaunchOptions or alternate emulator runtime choices. Keeping v1 limited to system and release apps[] reduces initial schema complexity, but the future shape should support a singular profile override without inventing a conflicting vocabulary later.

## Acceptance Criteria

- [ ] Profiles can declare one app-choice override using the agreed singular field name and existing app-choice grammar.
- [ ] Profile app-choice override composes with system/release app choices using documented precedence and inherit:false semantics.
- [ ] Tests cover a profile overriding Steam launch-options and a profile overriding an emulator runtime without requiring release-level duplication.

## Related

- `work/items/active/01KTWFJXDKS8VYWPV94QTWCBEH-steam-readable-apps-v1/plan.md`
- `product/platform/library/config/records/profile.ts`
- `product/platform/library/config/cascade-resolver.ts`
