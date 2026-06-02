---
id: task-077
title: Audit and reduce heavy SM8550 closure duplication
status: To Do
priority: medium
labels:
  - build-performance
  - closure-size
  - nix
  - sm8550
  - package-sets
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 7a5ed3b
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Audit and reduce heavy SM8550 closure duplication

## Why it matters

This groups closure-size and package-set duplication analysis into one investigation/fix slice. The BANDAI payload is about 9.2 GiB and includes large transitive desktop/accessibility stacks plus multiple versions of foundations such as GTK, WebKit, PipeWire, FFmpeg, Systemd, Python, and ICU. Some are intentional compatibility boundaries; others may be removable build or runtime waste.

## Acceptance Criteria

- [ ] Generate a ranked closure-size report for `korri-rocknix-product-payload-thor` and trace top suspicious dependencies with `nix why-depends`.
- [ ] Produce a duplicate-major-package report covering GTK/WebKit/PipeWire/FFmpeg/Systemd/Python/ICU and their introducers.
- [ ] Classify high-cost dependencies as required runtime, optional feature, dev/build leakage, upstream packaging artifact, or intentional compatibility boundary.
- [ ] Remove or gate at least one confirmed accidental heavy dependency, or document why the top offenders are required for the current product profile.
- [ ] Record remaining intentional duplicates in code comments or an existing solution doc reference so future cleanup does not break validated device runtime behavior.
- [ ] Add a lightweight regression check or review checklist for new large closure additions.

## Related

- `task-073`
- `task-074`
- `flake.nix`
- `nix/images/platforms/rocknix-sm8550.nix`
- `nix/korri-desktop/wrap.nix`
- `nix/korri-desktop/unwrapped.nix`
- `nix/modules/korri-client.nix`
- `docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`
- `out/tmp/build-logs/bandai-thor-fuji-20260531T172421Z.log`

## Notes

Supersedes the closure audit remainder of task-073 and all of task-074. This is the recommended third agent run.
