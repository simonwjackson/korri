---
id: 01KZANSP7GJV6KXWJ094TPNKT1
slug: isolate-android-connected-tests-from-physical-devices
title: Isolate Android connected tests from physical devices
origin: parked
status: To Do
priority: high
labels:
  - android
  - testing
  - device-safety
created: 2026-08-06
source: se-debug
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: feat/unified-android-game-overlay
  repo: korri
---

# Isolate Android connected tests from physical devices

## Why it matters

`korrid-check`/Gradle connected tests installed a stale Korri APK and test APK onto the attached RG405M, repeatedly removing the accessibility service during installed-device acceptance. Connected checks must target only their locked emulator serial and fail before touching any other device.

## Acceptance Criteria

- [ ] Every connected Gradle/ADB test receives an explicit emulator serial
- [ ] A contract test proves attached physical devices are ignored
- [ ] korrid-check cannot install app or test APKs on arbitrary connected devices

## Related

- `clients/android`
- `services/korrid/check.sh`
- `nix/tasks.nix`
