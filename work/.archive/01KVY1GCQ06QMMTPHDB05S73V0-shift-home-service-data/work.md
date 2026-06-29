---
id: 01KVY1GCQ06QMMTPHDB05S73V0
title: Source Shift cinematic home metadata + play-state from the service
status: active
created: 2026-06-24
source: user
---

# Source Shift cinematic home metadata + play-state from the service

The cinematic Shift home reads the game list, title, and art from the catalog
service but shows no genre/last-played/playtime/favorite chips, because the
library repository drops `metadata` and never forwards `userData`. The data and
the wire format already exist (`GameMetadata.genre/developer`, `GameUserData`,
`PlayableLibraryEntry`'s optional `metadata`/`userData`, `CatalogEntrySchema`
spreading those fields over RPC). Thread it through so the home pulls everything
from the service rather than from fixtures.
