---
id: task-004
title: Persist Bandai local GBA catalog aspect defaults
status: To Do
priority: medium
labels:
  - bandai
  - retroarch
  - library
created: 2026-06-10
source: user
---

# Persist Bandai local GBA catalog aspect defaults

## Why it matters

Bandai's current two-game GBA catalog is hand-seeded live state under /var/lib/korri/library/library.yaml. The live fix changes RetroArch from full-stretch to core-provided aspect, but a future rebuild/catalog regeneration path needs a repo-owned source so GBA games do not regress to squished output.

## Acceptance Criteria

- [ ] Repo-owned Bandai/local-ROM catalog source or scanner default emits GBA RetroArch launches with `video.aspectRatio: core-provided` and `forceAspect: true` or equivalent.
- [ ] A focused check proves generated RetroArch config for a GBA/mGBA launch contains `aspect_ratio_index = 22` and `video_force_aspect = "true"`.
- [ ] Bandai rebuild/reboot preserves the corrected Yoshi aspect ratio without manual edits to `/var/lib/korri/library/library.yaml`.

## Related

- `/var/lib/korri/library/library.yaml`
- `product/platform/stream/retroarch-launch-spec.ts`
- `product/platform/library/proseql/library-db.ts`

## Notes

Discovered after user launched Yoshi: live catalog had `video.aspectRatio: full`, producing `aspect_ratio_index = 24` and squished GBA output. Live state was patched to `core-provided` plus `forceAspect` on 2026-06-09.
