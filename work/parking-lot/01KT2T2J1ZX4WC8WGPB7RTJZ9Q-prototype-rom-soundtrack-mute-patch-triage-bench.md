---
id: 01KT2T2J1ZX4WC8WGPB7RTJZ9Q
slug: prototype-rom-soundtrack-mute-patch-triage-bench
title: Prototype ROM soundtrack-mute patch triage bench
origin: parked
legacy: task-104
status: To Do
priority: medium
labels:
  - follow-up
  - emulation
  - audio
  - soundtrack-control
  - research
created: 2026-06-02
source: user
---

# Prototype ROM soundtrack-mute patch triage bench

## Why it matters

A curated patch/cheat pipeline could make true “mute music, keep SFX” support viable for emulated games, but Korri needs a repeatable way to discover, validate, and record per-game capabilities instead of treating it as a universal audio-stream feature.

## Acceptance Criteria

- [ ] Define a capability record shape for per-game soundtrack control, including runtime cheat, patched-ROM launch profile, unsupported, side effects, and confidence.
- [ ] Prototype a small triage workflow for one emulator/debugger family that can inspect memory/disassembly, apply candidate cheats or patches, and verify music-muted/SFX-still-present behavior.
- [ ] Seed the registry with a handful of known examples such as Super Mario Bros. Game Genie no-music codes, GoldenEye 007 GameShark no-music/SFX-only code, and known no-music ROM patches.
- [ ] Expose the result as a Korri-facing capability query so product code can distinguish true music mute from whole-game ducking or unsupported games.

## Related

- `./01KSRGFP090VJBVE7MNCGWYF9R-steam-like-savestate-sync.md`
- `./01KSXN941A4GEBMH6ZX32EC6ZH-decide-on-plugin-architecture-for-non-gaming-content-sources.md`

## Notes

Captured from exploration of Action Replay/GameShark/Game Genie-style soundtrack toggles and LLM-assisted emulator debugger triage. This should stay capability-based and curated; avoid promising universal support across arbitrary games.
