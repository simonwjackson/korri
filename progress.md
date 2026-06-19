# Progress

## Status
Complete

## Tasks
- Researched Steam client local observability surfaces for logs, VDF/ACF state, downloads, shader cache, cloud/workshop sync, and launch lifecycle evidence.
- Inspected existing Korri Steam/korrid/sessiond observability code and mapped insertion points for structured lifecycle events.
- Researched external Proton/runtime observability surfaces for Steam Linux Runtime, pressure-vessel, Wine, DXVK/VKD3D, Gamescope, MangoHud, and FEX.

## Files Changed
- `progress.md`
- `steam-client-observability-research.md`
- `repo-steam-observability-scout.md`
- `proton-runtime-observability-research.md`

## Notes
- Existing Steam observability is plugin-local in korrid: log tailer + parser + reducer + generic plugin diagnostics RPC.
- Existing session lifecycle stream is sessiond-local: `/managed-launch/events` SSE with generic supervisor events.
- Best insertion point for `SteamLifecycleEvent` is `product/plugins/steam/src/observability/log-observer.ts`, with correlation to sessiond launch IDs via Steam launch metadata/session hook.
- Preferred stable runtime event sources: launcher process supervision, Gamescope `--ready-fd`, controlled DXVK/VKD3D log files, MangoHud telemetry logs, and Steam Runtime diagnostics.
