---
id: 01KTW8JKKWPANCN9D1Z4NXXNHN
slug: degrade-gracefully-on-unreadable-entries-inside-removable-co
title: Degrade gracefully on unreadable entries inside removable config roots
origin: parked
status: To Do
priority: high
labels:
  - removable-media
  - proseql
  - resilience
created: 2026-06-11
source: se-debug
context:
  branch: trunk
  commit: edcd002
  repo: korri
---

# Degrade gracefully on unreadable entries inside removable config roots

## Why it matters

Android-formatted cards ship with drwx------ dirs owned by foreign uids (Download, DCIM, Android, lost+found). ProseQL discovery scandir rejects the whole source.list() on the first EACCES, so the library shows "loading" forever even though every readable fragment is fine. Watcher-level EACCES is already contained (warn, daemon survives — verified on bandai 2026-06-11); the discovery walk is the remaining hard failure. Any user inserting an Android-used card hits this. Fix direction: skip unreadable dirs during discovery with a diagnostic (likely upstream ProseQL ask alongside onFragmentError, or pre-filter the walk in config-graph-db), and/or normalize card ownership at mount time in korri-removable-media.

## Acceptance Criteria

- [ ] A config root containing an unreadable subdirectory still lists all readable fragments (unit test)
- [ ] Unreadable entries surface as ConfigGraphEvent.diagnostics, not list rejection
- [ ] Verified on bandai with an unmodified Android-formatted card (or perms reverted on a test dir)

## Related

- `product/platform/library/proseql/config-graph-db.ts`
- `product/platform/library/library-source-layer-live.ts`
- `backlog: upstream ProseQL asks 01KTTHJRTT3N93BMBZ1SF8VXJ1`
