---
id: 01KT2T2J214QA0ZYYP6TG5YKHK
slug: complete-gamescope-protocol-bridge-and-cli-test-coverage
title: Complete Gamescope protocol bridge and CLI test coverage
origin: parked
legacy: task-106
status: To Do
priority: high
labels:
  - gamescope
  - runtime-control
  - tests
  - cli
  - coverage
created: 2026-06-02
source: user
---

# Complete Gamescope protocol bridge and CLI test coverage

## Why it matters

The core v1 tests are in place, but complete non-device coverage needs exhaustive protocol, bridge lifecycle, and operator CLI cases so regressions are caught before hardware validation.

## Acceptance Criteria

- [ ] Add exhaustive protocol tests for unknown methods, malformed requests, invalid params, bounds, and stable error objects.
- [ ] Cover bridge lifecycle cases including stale socket cleanup, multiple sequential clients, concurrent clients if supported, partial/malformed NDJSON, and client disconnect mid-request.
- [ ] Cover CLI argument validation, readable error messages, JSON output behavior if supported, and exit codes for missing socket/backend errors.

## Related

- `korri/shared/gamescope-control/gamescope-control-protocol.ts`
- `korri/shared/gamescope-control/gamescope-control-bridge.ts`
- `korri/shared/gamescope-control/gamescope-control-bridge.test.ts`
- `tools/cli/gamescope-control.ts`
- `tools/cli/gamescope-control.test.ts`
- `tools/cli/gamescope-control-bridge.ts`
- `./01KT2T2J20HQC66JQ1NA2BWYWF-define-gamescope-api-coverage-contract.md`

## Notes

PR phase 2. This should close all coverage-contract rows that do not require real X11/Gamescope hardware.
