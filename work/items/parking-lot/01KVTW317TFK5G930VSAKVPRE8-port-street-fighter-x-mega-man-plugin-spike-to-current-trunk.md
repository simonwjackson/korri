---
id: 01KVTW317TFK5G930VSAKVPRE8
slug: port-street-fighter-x-mega-man-plugin-spike-to-current-trunk
title: Port Street Fighter X Mega Man plugin spike to current trunk
origin: parked
status: To Do
priority: medium
labels:
  - parking-lot
  - worktree-cleanup
  - plugin
  - sfxmm
created: 2026-06-23
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 15808baddd6b543959f8a6f4820eb198a60a6da0
  repo: korri
---

# Port Street Fighter X Mega Man plugin spike to current trunk

## Why it matters

The SFXMM worktree contains substantial unmerged plugin/package/runtime work, including FEX/Proton-GE launch handling, Gamescope composition, DXVK/ddraw shim wiring, and researched Wine/Pulse audio fixes. Leaving it only as an old dirty worktree risks losing useful device-runtime knowledge.

## Acceptance Criteria

- [ ] Current trunk has a clean @korri:street-fighter-x-mega-man plugin or the spike is explicitly rejected with rationale.
- [ ] Relevant package wrapper, Nix check, and registry/library-source tests are ported to current plugin/config schemas.
- [ ] SFXMM audio/runtime research notes are either committed as docs or summarized in the active work item.
- [ ] The old worktree .worktrees/feat/street-fighter-x-mega-man-trunk can be removed without losing information.

## Related

- `.worktrees/feat/street-fighter-x-mega-man-trunk`
- `product/plugins/street-fighter-x-mega-man`
- `sfxmm-audio-repo-scout.md`
- `sfxmm-audio-web-research.md`
- `docs/solutions/runtime-errors/street-fighter-x-mega-man-wine-registry-key-escaping-2026-06-18.md`

## Notes

Worktree branch HEAD is contained in trunk, but dirty staged/unstaged files contain the actual SFXMM spike. Do not delete until patch/docs are preserved or intentionally discarded.
