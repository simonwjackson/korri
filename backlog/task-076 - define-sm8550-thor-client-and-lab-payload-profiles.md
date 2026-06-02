---
id: task-076
title: Define SM8550 Thor client and lab payload profiles
status: To Do
priority: medium
labels:
  - build-performance
  - payload-composition
  - sm8550
  - product-scope
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 7a5ed3b
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Define SM8550 Thor client and lab payload profiles

## Why it matters

This groups product-composition decisions into one slice. The current Thor payload appears to include lab/optional stacks such as Steam and Cemu unconditionally; if BANDAI's normal role is Korri/Moonlight client, those components should be gated behind an explicit lab/full profile instead of inflating every switch.

## Acceptance Criteria

- [ ] Define explicit Thor/SM8550 product profiles, such as client/minimal versus full-lab, with clear intended use for each.
- [ ] Steam, Cemu, and other lab-only substrate packages are gated behind the full-lab profile rather than unconditional for the normal BANDAI client payload.
- [ ] Classify optional/lab dependencies discovered in the closure audit enough to decide which profile owns them.
- [ ] Product-payload naming or metadata makes the selected profile visible enough to avoid flashing the wrong artifact.
- [ ] Build checks cover at least one minimal/client profile and one full-lab profile, or document why only one profile ships today.

## Related

- `task-072`
- `task-073`
- `nix/images/platforms/rocknix-sm8550.nix`
- `flake.nix`
- `nix/korri-rocknix-product-payload.nix`
- `docs/deployment/korri-images.md`

## Notes

Supersedes task-072 and the optional/lab dependency-classification part of task-073. This is the recommended second agent run after JS build-waste cleanup.
