---
id: 01KVNHPPYGV1GK015GGDKFK1AY
slug: extend-level-share-square-acquisition-for-yfs-artifacts-and-
title: Extend Level Share Square acquisition for YFS artifacts and releases
origin: parked
status: To Do
priority: medium
labels:
  - yfs
  - levelsharesquare
  - acquisition
  - catalog
created: 2026-06-21
source: user
---

# Extend Level Share Square acquisition for YFS artifacts and releases

## Why it matters

Level Share Square already exposes YFS as game=1 and returns raw YFS level JSON. We proved that raw payload launches in YFS, but the existing plugin is SMBR-specific and the catalog/release mapping is unresolved. This needs a dedicated modeling pass after the launcher path exists.

## Acceptance Criteria

- [ ] Extend or split Level Share Square acquisition so YFS game=1 search/details/acquire returns raw YFS level JSON artifacts with provenance
- [ ] Represent acquired YFS levels as releases or another agreed catalog shape without treating the level as a launcher setting
- [ ] Define the release/target/artifact shape consumed by `yfs-launch <level-file>`
- [ ] Add fixture tests for the observed YFS `/api/levels/<id>/code?noDescription=1&play=1` response shape where `levelData` is a raw JSON string
- [ ] End-to-end test proves an acquired YFS artifact resolves to a launchable YFS release/content input

## Related

- `product/plugins/levelsharesquare/src/plugin.ts`
- `product/plugins/yoshis-fabrication-station/index.ts`
- `docs/plans/2026-06-04-002-feat-native-artifact-import-plan.md`

## Notes

Supersedes the narrower item about modeling acquired LSS YFS levels as releases; keep the release decision explicit but backlog it after launcher productization.
