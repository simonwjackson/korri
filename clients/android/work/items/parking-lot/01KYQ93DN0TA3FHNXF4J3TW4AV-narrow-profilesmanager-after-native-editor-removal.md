---
id: 01KYQ93DN0TA3FHNXF4J3TW4AV
slug: narrow-profilesmanager-after-native-editor-removal
title: Narrow ProfilesManager after native editor removal
origin: parked
status: To Do
priority: low
labels:
  - profiles
  - dead-code
  - api-surface
  - refactor
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 5a208d39af59
  repo: artemis
  invoked_by: Tier-2 shipping review
---

# Narrow ProfilesManager after native editor removal

## Why it matters

After deleting ProfilesActivity/EditProfileActivity/ProfilesAdapter, production code only needs profile loading and overlay reads, but ProfilesManager still exposes list/create/update/delete/activate/listener APIs retained primarily by tests. Narrowing this surface would reduce dead production API without risking the current demolition's explicit keep-engine contract.

## Acceptance Criteria

- [ ] Inventory production versus test-only ProfilesManager and SettingsProfile methods after the UI deletion.
- [ ] Remove or package-narrow mutation/listener APIs with no retained production consumer.
- [ ] Rewrite tests to seed persisted profile fixtures or use the smallest supported setup seam.
- [ ] Keep profile load, active overlay application, persistence compatibility, and startup error handling covered.

## Related

- `app/src/main/java/com/limelight/profiles/ProfilesManager.java`
- `app/src/main/java/com/limelight/profiles/SettingsProfile.java`
- `app/src/test/java/com/limelight/profiles`

## Notes

Deferred because this sweep explicitly preserves the ProfilesManager/SettingsProfile engine unchanged while deleting only editing UI.
