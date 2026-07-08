---
id: 01KX10WW01YJMJV82HN1XKHXSB
slug: guard-bandai-deploys-against-remote-trunk-sources
title: Guard Bandai deploys against remote-trunk sources
origin: parked
status: To Do
priority: high
labels:
  - deployment
  - bandai
  - guardrail
created: 2026-07-08
source: user
---

# Guard Bandai deploys against remote-trunk sources

## Why it matters

Deploying `origin/trunk` to Bandai reintroduced the old KEY_F24 keyboard behavior because local trunk and remote trunk had diverged. Future device switches should build only from the current local checkout or an explicitly named local commit/worktree, never remote refs by default.

## Acceptance Criteria

- [ ] Bandai deployment helper refuses refs matching `origin/*`, `FETCH_HEAD`, or other remote-tracking refs unless an explicit override is passed.
- [ ] Deployment output prints the exact local commit and dirty-tree state before switching.
- [ ] Documentation/conventions state that Bandai deploys must not use remote trunk as the source of truth.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `/tmp/korri-origin-trunk-bandai`
