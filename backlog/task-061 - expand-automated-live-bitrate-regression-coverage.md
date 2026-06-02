---
id: task-061
title: Expand automated live bitrate regression coverage
status: To Do
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

# Expand automated live bitrate regression coverage

## Why it matters

The manual proof is strong, but release confidence needs automated checks that prevent capability drift, reconnect fallbacks, local-control regressions, and packaging omissions.

## Acceptance Criteria

- [ ] Patch/source checks assert no bitrate encoder restart or reconnect fallback, VAAPI-only bitrate advertisement, `seamless_vaapi=1` logging, bounds handling, and unsupported encoder rejection.
- [ ] Product/RPC tests prove live bitrate exposure follows local-control and Sunshine capabilities.
- [ ] Launch-spec tests prove product launches enable/disable local-control as intended and never synthesize a reconnect path for unsupported bitrate.
- [ ] Tests cover local-control socket lifecycle cleanup, FPS behavior after bitrate changes, resolution remaining proof-gated, and InputPlumber device routing.
- [ ] Fixtures cover Sunshine capability acks with bitrate+FPS support and negative no-bitrate-support cases.
- [ ] Packaging checks prove `0005` is included in `sunshine-korri` and evidence docs are linked.

## Related

- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`
- `korri/products/app/api/library/launch.rpc-handler.test.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.test.ts`
- `tools/cli/moonlight-runtime-watch.test.ts`
- `korri/shared/stream/moonlight-control-client.test.ts`
- `korri/shared/stream/moonlight-control-protocol.test.ts`

## Notes

Complements the existing source invariant/build check that passed for commit 29121a0.
