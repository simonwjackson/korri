---
id: 01KVVERQWZ1W8AWWGE06MCRTQT
slug: shim-android-asset-manager-mode-for-newer-gmloader-gamemaker
title: Shim Android asset-manager mode for newer GMLoader GameMaker APKs
origin: parked
status: To Do
priority: high
labels:
  - gmloader
  - gamemaker
  - itch
  - android-shim
  - rg353m
created: 2026-06-23
source: user
---

# Shim Android asset-manager mode for newer GMLoader GameMaker APKs

## Why it matters

Random arm64 itch testing found multiple GameMaker APKs with valid `assets/game.droid` and `lib/arm64-v8a/libyoyo.so` that fail because newer/different runners ask the fake Android/JNI layer for an asset manager. GMLoader-next already has native AAssetManager thunks and a `useAssetManager` startup parameter, so this likely unlocks another compatibility class if we complete the shim.

## Acceptance Criteria

- [ ] Identify the exact failing JNI calls for Digivice Emulator D-Power, Nothingness, and Spelunky Classic HD itch APK
- [ ] Add or configure a fake Android context/asset-manager path so `AAssetManager_fromJava` is reachable by affected runners
- [ ] At least one previously failing asset-manager APK reaches a visible title/menu/game screen on RG353M
- [ ] Document compatibility metadata that distinguishes direct zip-read runners from asset-manager runners

## Related

- `docs/research/gmloader-apk-compatibility-matrix.md`
- `product/plugins/portmaster/packages/gmloader-port/default.nix`
- `/tmp/gmloader-next/gmloader/main.cpp`
- `/tmp/gmloader-next/thunks/zlib/zlib.cpp`
