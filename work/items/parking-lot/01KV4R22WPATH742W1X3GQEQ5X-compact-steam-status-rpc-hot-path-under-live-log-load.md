---
id: 01KV4R22WPATH742W1X3GQEQ5X
slug: compact-steam-status-rpc-hot-path-under-live-log-load
title: Compact Steam status RPC hot path under live log load
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - observability
  - performance
  - bandai
created: 2026-06-15
source: se-debug
---

# Compact Steam status RPC hot path under live log load

## Why it matters

Bandai validation of the korrid wedge fix showed app.steam.status now completes without wedging, but samples under Sonic still took 8–24 seconds. That latency can still make the UI/control plane feel unhealthy and may regress into watchdog timeouts under heavier Steam log bursts.

## Acceptance Criteria

- [ ] Repeated app.steam.status calls during a live Sonic Mania AppID session complete within a small bounded latency target (for example <2s p95 on Bandai).
- [ ] The RPC response remains evidence-preserving but avoids expensive serialization/reduction on every call.
- [ ] Regression coverage exercises a high-volume Steam evidence stream without blocking daemon health requests.

## Related

- `product/apps/portal/api/steam/status.rpc-handler.ts`
- `product/services/device/steam-log-observer.ts`
- `product/services/device/steam-launch-state.ts`
- `product/services/device/steam-log-tailer.ts`

## Notes

Observed after deploying /nix/store/8cfxk3j256anc76f7pl9z5jmnywax4d4-nixos-system-bandai-25.11pre-git: app.steam.status samples for Sonic 584400 returned in 79ms, 16.3s, 24.6s, and 8.9s; health remained responsive afterward.
