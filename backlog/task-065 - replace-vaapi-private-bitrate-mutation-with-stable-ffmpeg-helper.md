---
id: task-065
title: Replace VAAPI private bitrate mutation with stable FFmpeg helper
status: To Do
priority: medium
labels:
  - ffmpeg
  - sunshine
  - vaapi
  - technical-debt
  - runtime-settings
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 29121a0
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Replace VAAPI private bitrate mutation with stable FFmpeg helper

## Why it matters

The current seamless path relies on mirrored FFmpeg VAAPI private structs; it is effective but brittle across FFmpeg layout changes and should eventually be replaced with a narrower maintained helper.

## Acceptance Criteria

- [ ] Decide whether to carry a small downstream FFmpeg helper/API for VAAPI runtime bitrate updates instead of Sunshine-side private struct mirroring.
- [ ] If adopted, implement the helper and update Sunshine to call it from the runtime bitrate path.
- [ ] Preserve the same no-restart/no-reconnect behavior and SM8550 moving-video/bandwidth acceptance evidence after the replacement.
- [ ] Add version/layout checks or compile-time invariants so FFmpeg upgrades fail obviously rather than corrupting private state.
- [ ] Document rollback and maintenance expectations for the helper.

## Related

- `packages/sunshine-korri/patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch`
- `packages/sunshine-korri/package.nix`
- `research.md`
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`

## Notes

This is a hardening follow-up, not required to preserve the current proven product path if guardrails are strong.
