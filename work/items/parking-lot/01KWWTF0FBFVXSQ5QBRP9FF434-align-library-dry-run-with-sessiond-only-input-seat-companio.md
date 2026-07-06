---
id: 01KWWTF0FBFVXSQ5QBRP9FF434
slug: align-library-dry-run-with-sessiond-only-input-seat-companio
title: Align library dry-run with sessiond-only input-seat companions
origin: parked
status: To Do
priority: medium
labels:
  - input-seat
  - sessiond
  - dry-run
created: 2026-07-06
source: user-validation
---

# Align library dry-run with sessiond-only input-seat companions

## Why it matters

AKA validation showed app.library.launch.dry-run still tries to resolve @korri:input-seat as a normal launch companion provider even though real stream launches correctly defer it to sessiond. This creates a false negative preflight surface for source-host input-seat launches.

## Acceptance Criteria

- [ ] Dry-run for an input-seat-enabled RPCS3 launch no longer fails with PluginMissing for @korri:input-seat when sessiond is configured.
- [ ] Dry-run reports that input-seat readiness is delegated to sessiond or otherwise preserves the companion without resolving it through the plugin registry.
- [ ] Regression coverage mirrors the game-stream-runner sessiond-only companion test.

## Related

- `product/apps/portal/api/library/dry-run.rpc-handler.ts`
- `product/services/device/game-stream-runner.ts`
- `product/platform/input-seat/policy.ts`
