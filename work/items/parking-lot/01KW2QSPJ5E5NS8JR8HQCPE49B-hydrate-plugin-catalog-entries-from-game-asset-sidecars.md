---
id: 01KW2QSPJ5E5NS8JR8HQCPE49B
slug: hydrate-plugin-catalog-entries-from-game-asset-sidecars
title: Hydrate plugin catalog entries from game-asset sidecars
origin: parked
status: To Do
priority: medium
labels:
  - media
  - catalog
  - plugin
created: 2026-06-26
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  repo: korri
---

# Hydrate plugin catalog entries from game-asset sidecars

## Why it matters

Plugin-contributed games such as Neverball and first-party fangames are visible in the catalog but are appended after ProseQL media hydration, so runtime sidecar assignments cannot give them UI art without a product code change.

## Acceptance Criteria

- [ ] `@korri:*/*` plugin catalog entries can receive `tile`, `banner`, `poster`, `hero`, and `logo` from `.korri-game-assets.json` / `.korri-game-asset-assignments.json`.
- [ ] Catalog snapshot tests cover a plugin playable with sidecar media.
- [ ] Bandai media import reports plugin entries as hydrated when matching assets exist.

## Related

- `product/platform/plugin/catalog-library-source.ts`
- `product/platform/library/proseql/library-repository.ts`
- `/tmp/korri-bandai-media/catalog-after.json`

## Notes

Discovered while installing SteamGridDB sidecars on Bandai. Normal ProseQL entries hydrate after moving sidecars to /var/lib/korri/config; plugin entries remain unhydrated because withPluginLibrarySource appends them after base listPlayableEntries().
