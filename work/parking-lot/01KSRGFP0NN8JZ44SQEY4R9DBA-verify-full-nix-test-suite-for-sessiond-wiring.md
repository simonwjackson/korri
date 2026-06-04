---
id: 01KSRGFP0NN8JZ44SQEY4R9DBA
slug: verify-full-nix-test-suite-for-sessiond-wiring
title: Verify full Nix test suite after sessiond system wiring changes
origin: parked
legacy: task-033
status: To Do
priority: medium
labels:
  - nix
  - sessiond
  - verification
created: 2026-05-29
source: agent
---

# Verify full Nix test suite after sessiond system wiring changes

## Context

`../.archive/01KSRGFP2RZ5M21E46FTTXVHJ0-refactor-sessiond-system-wiring/plan.md` (U7) called for running `just test-nix` after the per-unit module/image checks landed. The first attempt on the local machine triggered a SIGKILL (signal 9, likely OOM while building the `korri-standard-native` aggregate's transitive image closures) and locked up the host. The per-unit checks all passed individually:

- `korri-sessiond-module`
- `korri-game-stream-module`
- `korri-source-machine-image`
- `korri-rocknix-sm8550-config`

so the wiring changes themselves are believed-clean. What is unverified is whether the full aggregate (especially live-USB and Thor/Sobo image graphs that share sessiond/game-stream module surface area) still builds end-to-end.

## Why it matters

`just test-nix` is the canonical pre-PR gate. CI will run the same aggregate. Skipping it locally leaves a small chance that a downstream image picks up the new `users.users.korri-server.extraGroups` extension, the `korri-sessiond-clients` group, or the new game-stream both-or-neither assertion in a way the per-unit checks did not exercise. Most likely candidates for late failures:

- Any host that imports `nix/images/headless.nix` plus an additional definition of `users.users.korri-server` could collide on the new `extraGroups` extension.
- Any host that wires `services.korri.gameStream.sessiond.url` without `tokenFile` (or vice versa) will now eval-fail; the per-unit checks proved the assertion fires, but only the aggregate proves every existing image is clean.

## Acceptance Criteria

- [ ] Run `just test-nix` on a machine with enough RAM/swap headroom (or run the constituent `nix build .#checks.x86_64-linux.korri-standard-native --no-link` with `--max-jobs 1` / `-j 1`) and confirm it exits zero.
- [ ] If a downstream image fails, fix it under this task (likely a single-line wiring fix) and re-run.
- [ ] Run the live-USB smoke (`just live-usb-smoke`) once the aggregate is green, since live-USB shares the sessiond module surface.

## Related

- `../.archive/01KSRGFP2RZ5M21E46FTTXVHJ0-refactor-sessiond-system-wiring/plan.md` (origin plan, U7)
- `nix/modules/korri-sessiond.nix`
- `nix/modules/korri-game-stream.nix`
- `nix/images/source-machine.nix`
- `nix/images/headless.nix`
- `nix/tests/korri-standard-native-check.nix`

## Notes

Trivial in expectation but cannot be skipped before merge. Promote to `se-work` and run on a host with adequate resources, or move the verification step into CI as a blocking check.
