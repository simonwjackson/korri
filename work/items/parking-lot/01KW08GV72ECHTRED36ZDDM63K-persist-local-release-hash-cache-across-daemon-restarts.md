---
id: 01KW08GV72ECHTRED36ZDDM63K
slug: persist-local-release-hash-cache-across-daemon-restarts
title: Persist local release hash cache across daemon restarts
origin: parked
status: In Progress
priority: high
labels:
  - korri
  - performance
  - folding
created: 2026-06-25
source: se-work
context:
  cwd: korri/.worktrees/feat/federated-release-folding
  branch: feat/federated-release-folding
  repo: korri
  issue_ref: 01KVVMYE5SFC4H8X5H0EBY7WG3
---

# Persist local release hash cache across daemon restarts

## Why it matters

The current release hash resolver cache is process-memory only, so a daemon restart can enqueue rehashing for every local single-file release again. Persisting path+size+mtime+sha256 under the local cache directory avoids repeated full-library reads on handheld storage.

## Acceptance Criteria

- [ ] Release hash resolver loads a local-only stat-keyed cache from an XDG/Korri cache path on startup.
- [ ] Successful hashes update the persistent cache atomically.
- [ ] Changing file path, size, or mtime invalidates the cached hash and queues a recompute.
- [ ] The stat cache is never published or used as a match key.

## Related

- `product/platform/library/content-identity/release-content-identity.ts`
- `work/items/active/01KVVMYE5SFC4H8X5H0EBY7WG3-federated-single-file-folding/plan.md`
