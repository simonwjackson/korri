---
id: 01KVEF9CCFPBTTJQYCFQ78B98R
slug: explore-mount-native-packaged-format-for-store-acquired-game
title: Explore mount-native packaged format for store-acquired game payloads
origin: parked
status: To Do
priority: medium
labels:
  - itchio
  - acquisition
  - exploration
  - mounts
  - handheld-performance
created: 2026-06-18
source: user
context:
  cwd: .worktrees/feat/itchio-public-provider
  branch: feat/itchio-public-provider
  commit: 7768feca
  repo: simonwjackson/korri
---

# Explore mount-native packaged format for store-acquired game payloads

## Why it matters

A mount-native image such as squashfs or erofs might preserve the ROM-like single-file store payload idea while avoiding tar.gz extraction latency and memory pressure, but handheld targets like RG353M may not have enough RAM/CPU/kernel support for a good experience.

## Acceptance Criteria

- [ ] Prototype at least one mount-native format for a Butler-installed itch.io payload and measure launch/setup latency versus tar.gz extraction and unpacked installs.
- [ ] Validate feasibility on low-resource handheld assumptions, including RG353M-class memory, CPU, kernel module/filesystem support, and read amplification.
- [ ] Define whether saves/config should live outside the mounted payload and how overlays would work.
- [ ] Recommend a default format or explain why mount-native packaged artifacts should not be pursued.

## Related

- `product/platform/acquisition/plugins/itchio.ts`
- `docs/acceptance/itchio-public-provider.md`
- `product/systems/nixos`
