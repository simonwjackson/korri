---
id: 01KZAKZ09A6PKZ3JSYVNBJ6MAM
slug: extract-focused-collaborators-from-korrishellactivity-bridge
title: Extract focused collaborators from KorriShellActivity bridge
origin: parked
status: To Do
priority: medium
labels:
  - android
  - architecture
  - bridge
created: 2026-08-06
source: se-work
context:
  cwd: korri
  branch: feat/user-selected-game-discovery
  repo: korri
  invoked_by: final simplify review
---

# Extract focused collaborators from KorriShellActivity bridge

## Why it matters

The trusted portal, folder picker, local launch, asset route, permissions, and stream bridge now work, but `KorriShellActivity` remains over 1,000 lines. Extracting already-defined treaty slices will make future native capability changes easier to review without broad activity regressions.

## Acceptance Criteria

- [ ] KorriShellActivity remains the composition root.
- [ ] Folder picker, local launch/provisioning, and stream/native settings bridge behavior live in focused package-private collaborators.
- [ ] The `KorriNative` treaty and JSON behavior are unchanged.
- [ ] Trusted-origin and JVM bridge tests cover the extracted composition.

## Related

- `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java`
- `contracts/bridge/korri-native-bridge.ts`
- `clients/android/app/src/test/java/com/limelight/KorriNativeBridgeLifecycleTest.java`
