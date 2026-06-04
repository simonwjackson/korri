---
id: 01KSXN941A4GEBMH6ZX32EC6ZH
slug: decide-on-plugin-architecture-for-non-gaming-content-sources
title: "Decide on plugin architecture for non-gaming content sources (Jellyfin, Bixis, user plugins)"
origin: parked
legacy: task-080
status: To Do
priority: low
labels:
  - research
  - architecture
  - plugins
created: 2026-05-31
source: user
---

# Decide on plugin architecture for non-gaming content sources (Jellyfin, Bixis, user plugins)

## Why it matters

Gaming stays the first-class product, but a future plugin surface needs to exist for media (Jellyfin), music (Bixis), and arbitrary user plugins ranging from "just for me" hacks to first-class in-tree contributors. Effect Layers already provide the DI seam — the unresolved decisions are (1) the supertype of a content item across game/media/track domains, (2) the trust/distribution gradient, (3) where plugin code physically lives in the alias model, and (4) which surfaces plugins may contribute to without diluting gaming-first UX. Research is complete; this backlog item tracks the decision and first PR.

## Acceptance Criteria

- [ ] Decision recorded in docs/solutions/architecture-patterns/ for the five open questions in synthesis-2026-05-31.md Layer 7 (multi-source home relationship, Intent extensibility, user-plugin Nix posture, RPC namespace policy, input-contract enforcement).
- [ ] First PR lands generalizing korri/shared/library/library-services.ts from LibrarySource toward ContentSource with zero behavior change, per synthesis Layer 6 step 1.
- [ ] Plugin taxonomy chosen (ContentSource / MetadataProvider / GenericPlugin per Playnite, or alternative justified in writing).
- [ ] @plugins/* alias and korri/plugins/<id>/* layer decided on (yes/no/different shape) and recorded.

## Related

- `docs/research/plugin-architecture/synthesis-2026-05-31.md`
- `docs/research/plugin-architecture/codebase-scan.md`
- `docs/research/plugin-architecture/industry-prior-art.md`
- `docs/research/plugin-architecture/effect-idioms.md`
- `docs/research/plugin-architecture/gaming-first-hazards.md`
- `korri/shared/library/library-services.ts`

## Notes

Research synthesis lives at docs/research/plugin-architecture/synthesis-2026-05-31.md with four source briefs alongside. Smallest first PR identified: generalize library-services.ts. Sequenced PR plan in synthesis Layer 6. Do NOT start implementation until the five open questions in Layer 7 have explicit answers — this is a "decide first, then a sequence of small PRs" item, not a single feature.
