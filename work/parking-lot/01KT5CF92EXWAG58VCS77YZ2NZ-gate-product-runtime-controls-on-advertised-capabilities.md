---
id: 01KT5CF92EXWAG58VCS77YZ2NZ
slug: gate-product-runtime-controls-on-advertised-capabilities
title: Gate product runtime controls on advertised capabilities
origin: parked
legacy: task-119
status: To Do
priority: high
labels:
  - runtime-settings
  - product
  - rpc
  - ui
  - capability
created: 2026-06-03
source: user
---

# Gate product runtime controls on advertised capabilities

## Why it matters

Evier currently exposes controls based mainly on socket presence. The runtime-settings contract says unknown or unsupported support must fail closed, and product UI/RPC must not treat a local-control socket alone as support for bitrate, FPS, or resolution.

## Acceptance Criteria

- [ ] Stream-control state/config exposes per-command availability for runtime.setBitrate, runtime.setFps, and runtime.setResolution from protocol.hello/state facts.
- [ ] Product RPC mutations reject locally when authority is not controller or the command is not advertised.
- [ ] Evier disables or marks controls unsupported/pending when capability is missing or unknown.
- [ ] Tests cover controller-supported, observer-only, missing-command, and socket-present-but-capability-unknown cases.

## Related

- `./01KSXN940WHC4SJ684MBEH0JNW-integrate-live-bitrate-controls-into-product-launches.md`
- `./01KSXN940Y4B1TE24SNM4QM0RW-harden-live-bitrate-capability-and-safety-guardrails.md`
- `./01KT2T2J1M960ZTBER1XQF3D3N-expose-runtime-stream-state-and-command-results-in-product-u.md`
- `korri/products/app/api/stream-control/service.ts`
- `korri/shared/themes/evier/pages/EvierStreamControlPage.tsx`
- `docs/acceptance/runtime-settings-protocol-contract.md`

## Notes

Keep bitrate/FPS/resolution as individual controls; do not introduce a quality-profile command.
