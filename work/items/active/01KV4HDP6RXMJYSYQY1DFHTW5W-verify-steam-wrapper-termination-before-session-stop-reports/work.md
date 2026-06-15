---
id: 01KV4HDP6RXMJYSYQY1DFHTW5W
slug: verify-steam-wrapper-termination-before-session-stop-reports
title: Verify Steam wrapper termination before session stop reports Stopped
status: active
priority: high
labels:
  - steam
  - sessiond
  - lifecycle
created: 2026-06-15
promoted: 2026-06-15
source: steam-observability-smoke
item: work/items/active/01KV4HDP6RXMJYSYQY1DFHTW5W-verify-steam-wrapper-termination-before-session-stop-reports/item.md
---

# Verify Steam wrapper termination before session stop reports Stopped

Promoted from the parking lot for implementation planning after Bandai Steam observability smoke showed `app.session.stop` can return `Stopped` while the Sonic Mania Gamescope/SteamLaunch tree remains alive.

## 2026-06-15 implementation

- Implemented U1/U2 in `77f75e4 refactor(steam): share foreground process matching`:
  - extracted shared Steam foreground process matching to `product/services/device/steam-foreground-processes.ts`;
  - reused the matcher from `inputd-actions.ts`;
  - added Bandai `gamescope` process-name coverage to the Gamescope reaper.
- Implemented U3/U4 in `90cdd3d fix(sessiond): wait for Steam cleanup before stopped`:
  - sessiond wakes the launch waiter on terminate, waits a bounded grace window, and escalates with `terminateNow()` when needed;
  - Steam managed stops scan `/proc` for AppID-scoped foreground residuals and signal them before restoring home;
  - live control/RPC/CLI now surface `StopPending` when termination is accepted but sessiond still reports the same active launch.
- Focused verification passed:
  - `bun test product/services/device/steam-foreground-processes.test.ts product/services/device/sessiond-gamescope-reaper.test.ts product/services/device/sessiond.test.ts product/services/device/inputd-actions.test.ts product/platform/control/korri-control-live.test.ts product/platform/control/korri-control.test.ts product/apps/cli/control-renderers.test.ts product/apps/portal/api/session/stop.rpc-handler.test.ts product/apps/portal/api/server/rpc-server.test.ts product/apps/portal/api/session/session.rpc-handler.test.ts`
- Broader `just typecheck` was run and remains red only on known unrelated/pre-existing issues (missing generated route tree, route typings, `SessiondSocketHarness.socketPath`, event observer fixture typing).
- Bandai validation:
  - built and switched `/nix/store/yg4648yzp01l6mhvgm3a1mdl8ngfv2d9-nixos-system-bandai-25.11pre-git`;
  - restarted `korri-sessiond.service` and `korrid.service` after confirming stale service behavior;
  - stopped active Sonic Mania AppID `584400` session via `app.session.stop`;
  - observed stop response `_tag: "Stopped"` with launch `0598d800-ca4e-4f1c-92a7-6eff45e5a137`, followed immediately by `app.session.status` returning `mode: "home"`;
  - `app.steam.status` reported `status: "Stopped"`, `steam.running: false`, `trackedPids: []`, and removed PIDs for AppID `584400`;
  - `pgrep` showed no `SteamLaunch AppId=584400`, `SonicMania`, or `korri-steam-gamescope-launch --appid 584400` foreground processes;
  - warm Steam/webhelper processes remained alive.
