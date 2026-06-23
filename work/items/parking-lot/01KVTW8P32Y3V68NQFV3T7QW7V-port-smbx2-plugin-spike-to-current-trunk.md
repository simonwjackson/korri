---
id: 01KVTW8P32Y3V68NQFV3T7QW7V
slug: port-smbx2-plugin-spike-to-current-trunk
title: Port SMBX2 plugin spike to current trunk
origin: parked
status: To Do
priority: medium
labels:
  - parking-lot
  - worktree-cleanup
  - plugin
  - smbx2
created: 2026-06-23
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  commit: 15808baddd6b543959f8a6f4820eb198a60a6da0
  repo: korri
---

# Port SMBX2 plugin spike to current trunk

## Why it matters

The SMBX2 worktree contains a fully staged but unmerged plugin/package spike for Codehaus SMBX2, including VB6 runtime extraction, FEX/Proton-GE launch wrappers, and package-shape checks. Parking it preserves the implementation intent while allowing worktree cleanup later.

## Acceptance Criteria

- [ ] Current trunk has a clean @korri:smbx2 plugin or the spike is explicitly rejected with rationale.
- [ ] SMBX2 Nix package, wrapper scripts, and package checks are ported to current plugin/config schemas if accepted.
- [ ] Any runtime assumptions about VB6 components, Proton-GE, and FEX are validated or documented.
- [ ] The old worktree `.worktrees/feat/codehaus-smbx2` can be removed without losing information.

## Related

- `.worktrees/feat/codehaus-smbx2`
- `product/plugins/smbx2`
- `product/plugins/smbx2/packages/smbx2/default.nix`
- `product/plugins/smbx2/packages/smbx2/smbx2-fex`

## Notes

Branch HEAD is contained in trunk, but the staged changes contain the SMBX2 plugin spike. Do not delete until patch/docs are preserved or intentionally discarded.
