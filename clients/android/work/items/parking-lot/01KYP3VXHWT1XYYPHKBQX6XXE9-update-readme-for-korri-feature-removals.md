---
id: 01KYP3VXHWT1XYYPHKBQX6XXE9
slug: update-readme-for-korri-feature-removals
title: Update README for Korri feature removals
origin: parked
status: To Do
priority: medium
labels:
  - documentation
  - korri
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 3b81cf1514b1
  repo: artemis
  invoked_by: Tier-2 shipping review
---

# Update README for Korri feature removals

## Why it matters

README still advertises Apollo virtual display, server-command, clipboard-sync, external-display, native game-menu, and debug-page behavior removed by the Korri demolition. Leaving it stale misleads users and future engineering work.

## Acceptance Criteria

- [ ] README no longer advertises removed Apollo client features, external-display support, native GameMenu, or DebugInfoActivity.
- [ ] Retained shortcut, .art, Korri shell, primary-display streaming, and Guide/Xbox overlay behavior are accurately described.
- [ ] Documentation changes are reviewed against the current code and USAGE.md shortcut contract.

## Related

- `README.md`
- `USAGE.md`
- `work/items/active/20260728-korri-dead-code-demolition/plan.md`
