---
id: 01KV4YVV1ZMYTNB419WJ6E8CYW
slug: preserve-existing-steam-launchoptions-when-wrapping-command
title: Preserve existing Steam LaunchOptions when wrapping %command%
origin: parked
status: To Do
priority: high
labels:
  - steam
  - launch-options
  - gamescope
  - bandai
created: 2026-06-15
source: user
---

# Preserve existing Steam LaunchOptions when wrapping %command%

## Why it matters

Korri's Steam materializer replaced app-specific LaunchOptions with its Gamescope wrapper, dropping Stray's existing `/r` argument. That made the wrapper non-transparent and created a false controller/debug signal even though `%command%` itself was being preserved by the planner.

## Acceptance Criteria

- [ ] Materializer composes the Korri wrapper around existing app LaunchOptions instead of overwriting them blindly.
- [ ] Tests cover an app whose prior LaunchOptions are `%command% /r` or equivalent and verify the generated wrapper includes the trailing argument.
- [ ] Generated LaunchOptions remain per-app and do not hard-code Stray's `/r` globally.
- [ ] Steam is closed before any VDF rewrite in device workflows.

## Related

- `product/platform/library/config/steam-state-materializer.ts`
- `product/platform/library/config/steam-state-materializer.test.ts`
- `product/services/device/steam/steam-gamescope-launch-plan.ts`
- `product/services/device/steam/steam-gamescope-launch-planner-cli.ts`
- `product/services/device/nix/steam-gamescope-launcher.nix`

## Notes

Live Bandai A/B: normal Stray launch preserved `/r` and controls worked; Korri wrapper initially produced `Stray.exe` without `/r`; live test patched LaunchOptions to `... -- %command% /r`, after which process/logs showed `Stray.exe /r`. Remaining control issue appears Steam UI focus/capture, separate from parser/materializer transparency.
