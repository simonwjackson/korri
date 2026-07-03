---
id: 01KWJGP6JA917PWN6TQAGRMJP6
slug: fix-pre-existing-korri-compositor-module-check-failure-games
title: Fix pre-existing korri-compositor-module check failure (gamescope on session PATH)
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-07-02
source: se-work
---

# Fix pre-existing korri-compositor-module check failure (gamescope on session PATH)

## Why it matters

The `.#checks.x86_64-linux.korri-compositor-module` check fails on clean trunk with "compositor+kiosk: gamescope is on the session PATH", independent of the runtime-session contract work. It's a red CI gate that masks regressions in the compositor module and should be fixed or triaged.

## Related

- `tools/testing/nix/korri-compositor-module-check.nix`
- `product/systems/nixos/modules/korri-compositor.nix`

## Notes

Reproduced on branch refactor/korri-runtime-session-contract at trunk base 3d29823d by building the check with both korri-compositor.nix/korri-runtime.nix at HEAD (no local edits). Failing assertion message: "compositor+kiosk: gamescope is on the session PATH".
