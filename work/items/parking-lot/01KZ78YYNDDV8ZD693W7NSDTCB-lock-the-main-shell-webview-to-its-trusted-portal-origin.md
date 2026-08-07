---
id: 01KZ78YYNDDV8ZD693W7NSDTCB
slug: lock-the-main-shell-webview-to-its-trusted-portal-origin
title: Lock the main shell WebView to its trusted portal origin
origin: parked
status: To Do
priority: high
labels:
  - android
  - security
  - webview
created: 2026-08-04
source: se-work
context:
  cwd: korri
  branch: feat/unified-android-game-overlay
  commit: 828b2210
  repo: korri
  invoked_by: U3 security review
---

# Lock the main shell WebView to its trusted portal origin

## Why it matters

The existing KorriShellActivity injects the broad KorriNative bridge into a WebView without a complete origin/subframe policy. Although the unified gameplay overlay will use a separate narrow bridge, an untrusted document reaching the main shell could receive localhost RPC authority and native settings/stream methods.

## Acceptance Criteria

- [ ] Main shell loads through a fixed trusted asset/HTTPS origin with external main-frame, subframe, and script loads blocked.
- [ ] Bridge capability and native methods are unavailable outside the trusted origin.
- [ ] Contract tests prove arbitrary URL transport and non-treaty methods are absent or explicitly justified.

## Related

- `clients/android/app/src/main/java/com/limelight/KorriShellActivity.java`
- `contracts/bridge/korri-native-bridge.ts`
