---
id: 01KX02NNB9B8ZSMV59T0RQC3R6
slug: support-self-relative-plugin-paths-in-card-carried-korri-con
title: Support self-relative plugin paths in card-carried Korri config
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - plugins
  - ryubing
  - removable-media
  - config
created: 2026-07-08
source: user
---

# Support self-relative plugin paths in card-carried Korri config

## Why it matters

SD cards should be able to carry emulator/plugin config that remains portable even when the OS chooses a different mount path. Today Ryubing can be configured, but path values need an absolute mount path or an indirect storage token, which makes card-owned plugin config feel fragile and not self-referential.

## Acceptance Criteria

- [ ] Korri records the source file path for card-loaded `.korri/*.yaml` config files.
- [ ] Plugin path fields such as Ryubing `state.root` can be authored relative to the config file or via an explicit config-root/card-root token.
- [ ] A Switch SD card can declare Ryubing's config root as `.config/Ryujinx` without hard-coding `/run/media/...`.
- [ ] Tests cover a moved/remounted card path and prove the same card config resolves to the new mount location.

## Related

- `product/plugins/ryubing/src/policy.ts`
- `product/plugins/ryubing/src/materializer.ts`
- `/SD/.korri/*.korri.yaml`

## Notes

User explicitly rejected storage-token framing for this UX; desired model is plugin config on the card that can refer to paths on the same card naturally.
