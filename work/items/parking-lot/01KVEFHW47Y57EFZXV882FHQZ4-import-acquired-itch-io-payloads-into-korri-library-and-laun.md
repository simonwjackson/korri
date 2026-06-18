---
id: 01KVEFHW47Y57EFZXV882FHQZ4
slug: import-acquired-itch-io-payloads-into-korri-library-and-laun
title: Import acquired itch.io payloads into Korri library and launch profiles
origin: parked
status: To Do
priority: high
labels:
  - itchio
  - acquisition
  - library-import
  - launch-profiles
created: 2026-06-18
source: user
context:
  cwd: .worktrees/feat/itchio-public-provider
  branch: feat/itchio-public-provider
  commit: 7768feca
  repo: simonwjackson/korri
---

# Import acquired itch.io payloads into Korri library and launch profiles

## Why it matters

Owned itch.io acquisition now works through public/direct API/Butlerd paths, but the product direction is not to manage an itch.io-specific library or treat tarballs as ROM-like payloads. Korri should normalize itch.io like other stores by unpacking acquired payloads into the Korri library/install layout and creating launchable records. This must work for both purchased and free itch.io downloads.

## Acceptance Criteria

- [ ] Acquire a paid owned itch.io upload through Butlerd and unpack it into the Korri library/install layout without preserving API keys, download keys, signed URLs, or .itch receipt secrets.
- [ ] Acquire a free public itch.io upload and run the same unpack/import path, proving free games do not remain tarball-only or follow a separate special-case flow.
- [ ] Create or update launch/import metadata using Korri-normalized fields rather than itch-specific library-manager semantics.
- [ ] Handle ambiguous executable/app choices safely, returning a user/agent-selectable choice instead of guessing when multiple launch candidates exist.
- [ ] Add targeted tests for paid Butlerd imports, free public imports, secret exclusion, and repeat/idempotent import behavior.

## Related

- `product/platform/acquisition/plugins/itchio.ts`
- `product/platform/acquisition/artifact-acquisition.ts`
- `docs/acceptance/itchio-public-provider.md`
