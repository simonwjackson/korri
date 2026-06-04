---
id: 01KSV2WD0SSC4C5M1N8N55AS1X
slug: decide-sessiond-real-host-boundary-coverage-treatment
title: Decide coverage treatment for sessiond real host boundary wiring
origin: parked
legacy: task-041
status: To Do
priority: low
labels:
  - testing
  - sessiond
  - coverage
  - task-009
created: 2026-05-30
source: se-work
context:
---

# Decide coverage treatment for sessiond real host boundary wiring

## Context

During task-039 pass 1, `tools/device/sessiond.ts` moved from **77.36% funcs / 71.97% lines** to **84.48% funcs / 84.44% lines** through public HTTP/SSE tests. Remaining uncovered lines are no longer daemon HTTP/SSE behavior; they are mostly real host-boundary helpers in the same file:

- `discoverSwaySocketEnv` / real sway runner: lines 954-965, 972-982.
- `realSourceMachineSwayController`: lines 995-1023.
- `realServiceManager` / `runSystemctl`: lines 1028-1047.
- `main()` process/env wiring and signal handlers: lines 1060-1106.
- Defensive impossible branch in `launchUnderSession`: lines 623-628.

Bun coverage has no file include/exclude support in the current setup, so these host-boundary lines keep `tools/device/sessiond.ts` below task-039's original ≥95% line target even after the HTTP/SSE surface itself is much better covered.

## Why it matters

The code is real production wiring, but testing it through normal unit tests would either:

- Spawn host commands (`swaymsg`, `systemctl`) on a development machine/CI runner.
- Force private-helper exports solely to satisfy coverage accounting.
- Mix daemon HTTP/SSE contract coverage with host OS integration coverage, making the file-level metric misleading.

We need an explicit treatment before continuing to chase "100%" for this file.

## Acceptance Criteria

- [ ] Decide one of:
  - **Extract host-boundary helpers** into separately testable modules (`sessiond-real-sway.ts`, `sessiond-real-systemd.ts`, `sessiond-main.ts`) with public tests for env/path parsing and command construction.
  - **Keep in file and mark narrow exclusions** once the coverage tool supports ignore comments / file filters.
  - **Add an integration smoke** that runs only in a host-capable environment and is skipped in normal unit tests.
- [ ] Document the chosen policy in `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md` or a sibling tooling decision.
- [ ] Update task-009 and task-039 notes so the coverage target separates daemon HTTP/SSE behavior from host OS boundary wiring.

## Related

- `tools/device/sessiond.ts`
- ./01KSRGFP08VSZ99ZD7MZC8QBCW-sessiond-100-percent-test-coverage.md
- ./01KSRGFP0QWX9JYGWKT400YGPC-cover-sessiond-ts-managed-launch-http-sse-surface.md
- `docs/solutions/tooling-decisions/bun-coverage-via-separate-config-2026-05-29.md`

## Notes

Captured during task-039 pass 1. Do not force private-helper exports just to move a percentage; choose a durable testing boundary first.
