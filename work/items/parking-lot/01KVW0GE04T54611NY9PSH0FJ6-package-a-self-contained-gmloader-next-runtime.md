---
id: 01KVW0GE04T54611NY9PSH0FJ6
slug: package-a-self-contained-gmloader-next-runtime
title: Package a self-contained GMLoader Next runtime
origin: parked
status: In Progress
priority: high
labels:
  - gmloader
  - nix
  - runtime
  - rg353m
created: 2026-06-24
source: se-work
context:
  cwd: .
  branch: trunk
  commit: bd98b25a
  repo: simonwjackson/korri
  invoked_by: se-work
---

# Package a self-contained GMLoader Next runtime

## Why it matters

The new @korri:gmloader plugin is wired to a Nix executable resource, but the current package is a fail-closed wrapper that requires KORRI_GMLOADER_NEXT_BIN. A real packaged runner is needed before fresh devices can launch payloads without local runtime configuration.

## Acceptance Criteria

- [ ] .#gmloader-next contains or builds the real GMLoader Next runner for aarch64-linux
- [ ] gmloader-next-check validates the backing runner exists beyond --version
- [ ] @korri:gmloader installed entries are launchable on devices with the plugin enabled and no extra KORRI_GMLOADER_NEXT_BIN override

## Related

- `product/plugins/gmloader/packages/gmloader-next/default.nix`
- `product/plugins/gmloader/src/library-source.ts`
- `work/items/active/01KVVAD3QZ3H7YCKPBA2ANY4Y8-build-a-nixified-generic-gamemaker-apk-compatibility-layer/plan.md`
