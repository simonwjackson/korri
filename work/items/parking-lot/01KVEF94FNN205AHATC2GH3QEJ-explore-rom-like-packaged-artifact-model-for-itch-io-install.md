---
id: 01KVEF94FNN205AHATC2GH3QEJ
slug: explore-rom-like-packaged-artifact-model-for-itch-io-install
title: Explore ROM-like packaged artifact model for itch.io installs
origin: parked
status: To Do
priority: medium
labels:
  - itchio
  - acquisition
  - exploration
  - artifact-model
created: 2026-06-18
source: user
context:
  cwd: .worktrees/feat/itchio-public-provider
  branch: feat/itchio-public-provider
  commit: 7768feca
  repo: simonwjackson/korri
---

# Explore ROM-like packaged artifact model for itch.io installs

## Why it matters

The current product decision is to unpack Butler-installed itch.io payloads into Korri's library layout, but a standardized packaged-artifact model could make stores behave more like ROM providers and simplify acquisition portability if launch latency and storage semantics are acceptable.

## Acceptance Criteria

- [ ] Compare packaged installed-folder artifacts against unpacked library installs for launch flow, update flow, deduplication, and metadata ownership.
- [ ] Prototype treating a Butler-installed tar.gz as a single playable payload without itch-specific library-manager semantics.
- [ ] Document where tar.gz falls short as a ROM-like unit, especially around executable discovery, saves/config, updates, and partial reads.
- [ ] Recommend whether the model should remain a future option or be dropped.

## Related

- `product/platform/acquisition/plugins/itchio.ts`
- `docs/acceptance/itchio-public-provider.md`
