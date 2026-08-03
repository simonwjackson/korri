---
id: 01KZ0KB07VCD1SBNQ3KMWXRMN3
slug: separate-retroarch-gameplay-from-the-korri-portal-task
title: Separate RetroArch gameplay from the Korri portal task
origin: parked
status: To Do
priority: high
labels:
  - android
  - retroarch
  - task-lifecycle
created: 2026-08-02
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: main
  commit: 28ab4133
  repo: korri
---

# Separate RetroArch gameplay from the Korri portal task

## Why it matters

On the Android 13 TV device, Wario launches correctly, but RetroActivityFuture becomes the sole root of a task attributed to Korri. Starting Korri while Wario is running returns to Wario instead of reopening the portal, so the normal Home → Korri navigation path cannot coexist with a warm RetroArch session.

## Acceptance Criteria

- [ ] Launching Wario through Korri leaves the portal and RetroArch in independently addressable tasks, or provides an equally reliable explicit return-to-portal mechanism.
- [ ] Home → open Korri shows the portal while Wario remains warm.
- [ ] Selecting Wario again resumes the same RetroArch process and game state.
- [ ] Behavior is proven on the Android 13 TV device without weakening the signature-protected RetroArch activity.

## Related

- `services/korrid/src/launcher/retroarch.rs`
- `clients/android/app/src/main/java/com/limelight/KorriLocalLaunchSpec.java`
- `docs/research/returning-to-a-running-game.md`
