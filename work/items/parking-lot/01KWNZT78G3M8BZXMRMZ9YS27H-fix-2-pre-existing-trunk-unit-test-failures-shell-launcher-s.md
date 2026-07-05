---
id: 01KWNZT78G3M8BZXMRMZ9YS27H
slug: fix-2-pre-existing-trunk-unit-test-failures-shell-launcher-s
title: Fix 2 pre-existing trunk unit-test failures (shell-launcher spawn env, Steam AppID resolution)
origin: parked
status: To Do
priority: medium
labels:
  - test-health
  - pre-existing
  - trunk-red
created: 2026-07-04
source: se-work
---

# Fix 2 pre-existing trunk unit-test failures (shell-launcher spawn env, Steam AppID resolution)

## Why it matters

Two tests fail on clean trunk and have failed throughout the Moonlight-plugin work (verified pre-existing by running them at base): (1) createShellLauncher 'managed spawn preserves argv, env, cwd, and terminal stderr diagnostics' (product/platform/library/shell-launcher.test.ts, real Bun.spawn — possibly environment-sensitive), and (2) createLibraryRepository 'resolves provider-qualified Steam AppID launches through the registered integration' (product/platform/library/proseql/library-repository.test.ts, expect(received).toBe(true) at ~line 777). They are permanent red noise: every wide test run needs manual triage to distinguish them from real regressions, which already cost time repeatedly this session.

## Acceptance Criteria

- [ ] bun test product/platform/library/ is fully green on trunk
- [ ] root cause identified for each (env-sensitivity vs genuine defect) and fixed or deterministically skipped with a documented reason

## Related

- `product/platform/library/shell-launcher.test.ts`
- `product/platform/library/proseql/library-repository.test.ts`
