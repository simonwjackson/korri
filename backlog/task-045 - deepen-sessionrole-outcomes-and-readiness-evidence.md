---
id: task-045
title: Deepen SessionRole outcomes and readiness evidence
status: Done
priority: medium
labels:
  - architecture
  - refactor
  - sessiond
  - session-role
  - operator-evidence
created: 2026-05-30
source: se-architecture-improvement
context:
  cwd: .
  branch: trunk
  commit: bb37a5b
  repo: simonwjackson/korri
  invoked_by: se-architecture-improvement
---

# Deepen SessionRole outcomes and readiness evidence

## Why it matters

`SessionRole` is already a real seam with kiosk and source-machine adapters, but callers still infer too much from thrown errors and formatted evidence strings. Typed role outcomes would make idle restore, foreground promotion, and operator evidence easier to test and evolve without fragile string coupling.

## Acceptance Criteria

- [ ] Role hook outcomes distinguish typed success, failure stage, and evidence instead of relying only on thrown errors and string formatting.
- [ ] Kiosk and source-machine roles continue to emit the existing `home-ready` / `idle-ready` evidence strings on the managed-launch protocol for operator compatibility.
- [ ] Structured role evidence is tested directly before being formatted for SSE/protocol output.
- [ ] Sessiond dispatcher maps role failures to restore/recover or host-unavailable outcomes explicitly, preserving current public behavior.
- [ ] The sessiond operator model's evidence-format section is updated if typed evidence becomes the canonical source.

## Related

- `tools/device/sessiond-role.ts`
- `tools/device/sessiond-source-machine.ts`
- `tools/device/sessiond.ts`
- `tools/device/sessiond-role.test.ts`
- `tools/device/sessiond-source-machine.test.ts`
- `korri/shared/library/sessiond-managed-launch-protocol.ts`
- `docs/solutions/architecture-patterns/sessiond-operator-model-2026-05-29.md`
- `backlog/task-017 - tighten-foreground-session-transition-and-failure-semantics.md`

## Notes

Captured from the sessiond architecture-improvement scan. Related to task-017's failure-semantics work but focused specifically on the role adapter seam and evidence model.

## Completion Notes

2026-05-30: Added typed `SessionRoleReadyOutcome` / `SessionRoleReadyEvidence` and made kiosk/source-machine readiness evidence structured before formatting to existing operator-compatible strings. Sessiond emits terminal readiness evidence via the typed outcome formatting seam.
