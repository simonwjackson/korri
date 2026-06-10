---
id: 01KTSQF9Y75MKQ05V0XR3DMNR6
slug: fix-source-list-streamability-for-same-prefix-game-ids-pre-e
title: Fix source.list streamability for same-prefix game ids (pre-existing)
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-06-10
source: se-work
---

# Fix source.list streamability for same-prefix game ids (pre-existing)

## Why it matters

Three app.source.list tests fail on trunk HEAD (independently of the config-graph migration) because the writer's upsertGame collapses same-prefix playable ids (e.g. gba/wario-land-4 and gba/patched-missing-files) into a single library item whose single release points at the last-written game, so canResolveLaunchForGame returns false and the streamable catalog comes back empty. This blocks the federation/source-catalog source.list coverage.

## Related

- `product/apps/portal/api/source/list.rpc-handler.test.ts`
- `product/platform/library/proseql/library-repository.ts`
