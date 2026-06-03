---
id: task-061
title: Expand runtime-settings contract regression coverage
status: Done
priority: high
labels:
  - tests
  - sunshine
  - moonlight
  - runtime-settings
  - regression
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 29121a0
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Expand runtime-settings contract regression coverage

## Why it matters

The manual proof is strong, but release confidence needs automated checks that prevent capability drift, false applied results, reconnect fallbacks, local-control regressions, and packaging omissions across bitrate, FPS, and resolution.

## Acceptance Criteria

- [x] Protocol/source checks assert bitrate, FPS, and resolution are individual positive-value runtime-settings operations with no high-level quality-profile command.
- [x] Local-control client and runtime-watch coverage exercise `runtime.setBitrate`, `runtime.setFps`, and `runtime.setResolution` through the typed path.
- [x] Runtime-watch tests prove `accepted` is non-terminal and caller-visible `applied` requires post-command applied state matching the requested setting.
- [x] Runtime-watch mutation scenarios fail closed when controller authority or advertised command capability is missing.
- [x] Stream-control bench resolution uses the typed Moonlight local-control client instead of a raw JSON-RPC shortcut.
- [x] Nix/source checks assert the Sunshine and Moonlight packages keep the runtime-settings patches, advertise runtime resolution as supported for the validated Korri profile, and do not reintroduce reconnect/restart fallback or quality-profile drift.
- [x] Package README wording matches the runtime-settings contract and no longer treats resolution as proof-gated for the validated Korri profile.

## Disposition of Original Broader Items

- Product/RPC exposure belongs to `task-058` and `task-091`.
- Launch-spec and product launch wiring belong to `task-058`.
- InputPlumber/device-routing coverage is outside this runtime-settings contract slice.
- Compatibility-matrix breadth remains `task-064`.
- Autonomous and physical hardware regression gates remain `task-087` and `task-088`.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `docs/plans/2026-06-02-004-feat-runtime-settings-contract-coverage-plan.md`
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`
- `nix/tests/korri-moonlight-control-protocol-patch-check.nix`
- `tools/cli/moonlight-runtime-watch.test.ts`
- `tools/cli/stream-control-bench.test.ts`
- `korri/shared/stream/moonlight-control-client.test.ts`
- `korri/shared/stream/moonlight-control-protocol.test.ts`

## Notes

Completed as the runtime-settings contract regression slice: automated coverage now treats bitrate, FPS, and resolution as normal individual operations while keeping product integration, compatibility breadth, recovery, and soak validation in their owning follow-ups.
