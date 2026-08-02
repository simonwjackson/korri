---
id: 01KYRKQBRR6NPT45B6F6JZTRSC
slug: explore-capability-aware-multi-emulator-suspension-in-korri
title: Explore capability-aware multi-emulator suspension in Korri
origin: parked
status: To Do
priority: medium
labels:
  - exploration
  - android
  - emulation
  - lifecycle
  - multi-session
created: 2026-07-30
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: spike/retroarch-nix-build
  repo: korri
  invoked_by: conversation
---

# Explore capability-aware multi-emulator suspension in Korri

## Why it matters

Korri can make Dolphin, Switch, GBA, and other emulators feel embedded through same-task launches, but not every emulator supports durable savestates. We need an honest lifecycle model that distinguishes frame-exact resume, volatile warm suspension, native-save-only recovery, and single-session behavior without promising that Android will preserve a background process.

## Acceptance Criteria

- [ ] Document emulator lifecycle capability levels: frame-exact, warm suspend, native-save only, and single-session.
- [ ] Evaluate Android same-task launch compatibility and pause/background behavior for representative Dolphin, Switch, and GBA emulators.
- [ ] Determine whether Android cached-process freezing is sufficiently observable or controllable for Korri, including OEM and memory-pressure limitations.
- [ ] Define user-facing switching and recovery behavior when a warm-suspended emulator process is killed.
- [ ] Identify the minimal launcher/status/pause/quit adapter contract and any emulator forks or privileged APIs required.
- [ ] Recommend a phased implementation with resource, security, and device acceptance gates.

## Related

- `plugins/retroarch/android/`
- `services/korrid/src/launcher/`
- `work/items/active/20260729-korri-retroarch-fork/plan.md`
