---
id: 01KVEFKWTHWE2PG4KQKV4XVXRJ
slug: spike-itch-io-launch-target-detection-and-selection-ux
title: Spike itch.io launch target detection and selection UX
origin: parked
status: To Do
priority: high
labels:
  - itchio
  - launch-profiles
  - spike
  - ux
created: 2026-06-18
source: user
context:
  cwd: .worktrees/feat/itchio-public-provider
  branch: feat/itchio-public-provider
  commit: 7768feca
  repo: simonwjackson/korri
---

# Spike itch.io launch target detection and selection UX

## Why it matters

After unpacking itch.io payloads into Korri's library layout, Korri must decide how launch profiles are created. The user wants a dedicated spike to evaluate explicit choice, heuristics, and agent/user selection rather than committing to a detection policy in this close-out thread.

## Acceptance Criteria

- [ ] Inventory common itch.io payload shapes: native Linux executables, Windows builds, HTML bundles, Java/LÖVE/Godot wrappers, installer-like archives, and multi-executable folders.
- [ ] Compare explicit selection, heuristic selection, and hybrid confidence-based selection for user and agent workflows.
- [ ] Define the launch target choice contract so ambiguous cases can be resolved without browser handoff or itch-specific library-manager semantics.
- [ ] Document recommended policy and test fixtures for the follow-up implementation.

## Related

- `product/platform/acquisition/plugins/itchio.ts`
- `docs/acceptance/itchio-public-provider.md`
