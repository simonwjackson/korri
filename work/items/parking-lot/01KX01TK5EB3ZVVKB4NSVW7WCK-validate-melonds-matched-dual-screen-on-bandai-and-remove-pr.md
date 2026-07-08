---
id: 01KX01TK5EB3ZVVKB4NSVW7WCK
slug: validate-melonds-matched-dual-screen-on-bandai-and-remove-pr
title: Validate melonDS matched dual-screen on Bandai and remove prototype wrapper
origin: parked
status: To Do
priority: medium
labels:
  - melonds
  - bandai
  - device-smoke
created: 2026-07-08
source: se-work
---

# Validate melonDS matched dual-screen on Bandai and remove prototype wrapper

## Why it matters

The productized launcher is locally implemented and verified, but the real dual-panel behavior still needs a deployed Bandai image/config smoke before deleting the working local prototype files. This avoids losing the known-good manual fallback before the first-party path is proven on device.

## Acceptance Criteria

- [ ] Bandai runs a build that includes @korri:melonds and the matched dual-screen launcher
- [ ] Tetris DS dry-run resolves through @korri:melonds/matched-dual-screen, not the local @korri:process wrapper
- [ ] Device smoke verifies two melonDS Wayland windows, no Gamescope wrapper, expected top/bottom rectangles, hidden menubar, controls, and secondary-output restore
- [ ] Temporary Bandai files are removed after smoke: melonds-local.korri.yaml and /var/lib/korri/bin/melonds-dual-screen

## Related

- `work/items/active/20260708-melonds-matched-dual-screen-presentation/plan.md`
- `product/plugins/melonds/README.md`
