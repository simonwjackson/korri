---
id: 01KT2T2J23XXGE5VQ27BQ8HY52
slug: wire-gamescope-control-bridge-into-korri-sessions
title: Wire Gamescope control bridge into Korri sessions
origin: parked
legacy: task-108
status: To Do
priority: high
labels:
  - gamescope
  - runtime-control
  - korri-runtime
  - session
  - product-integration
created: 2026-06-02
source: user
---

# Wire Gamescope control bridge into Korri sessions

## Why it matters

The API is currently validated as tooling; product value comes when Korri session launch owns the bridge lifecycle and can coordinate Gamescope mode/filter/sharpness with runtime stream policy.

## Acceptance Criteria

- [ ] Launch the gamescope-control bridge as part of the relevant Korri session/runtime flow with a deterministic socket path.
- [ ] Ensure session cleanup stops the bridge without killing unrelated Korri core services.
- [ ] Wire a product-side client path that can request FSR on/off, sharpness changes, internal mode changes, and restore behavior.
- [ ] Surface command results, failures, and applied state in session logs or telemetry visible to the product runtime.

## Related

- `korri/shared/gamescope-control/gamescope-control-client.ts`
- `korri/shared/gamescope-control/gamescope-control-bridge.ts`
- `korri/products/app/api/stream/compose-moonlight-launch-spec.ts`
- `korri/products/app/stream/moonlight-launcher.ts`
- `tools/cli/gamescope-control-bridge.ts`
- `./01KT2T2J1K1EBDFD6CN4S0YDC3-design-gamescope-scaling-policy-for-runtime-stream-changes.md`
- `./01KT2T2J1YK1SN1ZK0B8W0KBXJ-build-full-gamescope-rpc-control-api.md`

## Notes

PR phase 4. Keep this separate because product/session lifecycle wiring can grow independently from protocol/backend coverage.
