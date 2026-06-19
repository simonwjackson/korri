# Code Context

## Files Retrieved
1. `product/plugins/steam/src/observability/log-signals.ts` (lines 1-260) - Steam log signal parser and current event vocabulary from Steam logs.
2. `product/plugins/steam/src/observability/log-observer.ts` (lines 1-270) - daemon-side log observer, installed global status reader, tailer wiring.
3. `product/plugins/steam/src/observability/launch-state.ts` (lines 1-220) - reducer from parsed Steam log signals into active/latest launch snapshots.
4. `product/plugins/steam/src/observability/diagnostics.ts` (lines 1-189) - Schema-backed diagnostics response exposed through plugin diagnostics.
5. `product/plugins/steam/src/observability/log-tailer.ts` (lines 1-220) - file tailer and watched Steam log file list.
6. `product/plugins/steam/src/session/foreground-processes.ts` (lines 1-190) - process-list heuristics for Steam foreground cleanup and AppID detection from `SteamLaunch AppId=`.
7. `product/plugins/steam/src/session/lifecycle-hook.ts` (lines 1-90) - Steam session lifecycle hook that records AppID metadata and cleans residual foreground processes.
8. `product/plugins/steam/src/plugin.ts` (lines 1-120) - Steam plugin contribution, diagnostics handler, Steam app default metadata.
9. `product/plugins/index.ts` (lines 1-120) - first-party plugin daemon and session-lifecycle hook composition; Steam observer daemon is enabled here.
10. `product/services/device/korrid.ts` (lines 1-220) - korrid starts plugin daemons alongside the API server.
11. `product/apps/portal/api/plugin-diagnostics/collect.rpc.ts` (lines 1-25) - generic `app.plugin.diagnostics.collect` RPC contract.
12. `product/apps/portal/api/plugin-diagnostics/collect.rpc-handler.ts` (lines 1-88) - generic plugin diagnostics RPC handler dispatch.
13. `product/apps/portal/api/server/status.rpc.ts` (lines 1-91) - `app.server.status` response shape with sessiond lifecycle summary.
14. `product/apps/portal/api/server/status.rpc-handler.ts` (lines 1-260) - server-side sessiond status proxy and redaction boundary.
15. `product/apps/portal/api/session/status.rpc.ts` (lines 1-52) - `app.session.status` RPC shape.
16. `product/apps/portal/api/session/status.rpc-handler.ts` (lines 1-13) - session status delegates to `KorriControl`.
17. `product/platform/library/sessiond-managed-launch-client.ts` (lines 1-220) - HTTP client for sessiond `/managed-launch` status/start/terminate.
18. `product/platform/library/sessiond-managed-launch-protocol.ts` (lines 1-340) - Schema source of truth for sessiond managed launch status and SSE events.
19. `product/services/device/sessiond.ts` (lines 1-330, 390-610, 880-1010) - sessiond managed-launch lifecycle event stream and state transitions.
20. `work/items/parking-lot/01KVEQ0Z9G09F36SSMXA1H4T1P-expose-full-steam-launch-lifecycle-observability.md` (lines 17-34 from grep) - direct backlog item for full Steam lifecycle observability.
21. `work/items/parking-lot/01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv.md` (lines 23-59 from grep) - backlog item for normalizing Steam/emulator/remote foreground lifecycle.
22. `work/items/parking-lot/01KV4R22WPATH742W1X3GQEQ5X-compact-steam-status-rpc-hot-path-under-live-log-load.md` (lines 17-38 from grep) - backlog item about Steam status hot-path latency under live logs.

## Key Code

Current Steam log parser (`product/plugins/steam/src/observability/log-signals.ts`) already recognizes these structured signals:

```ts
export type SteamLogSignal =
  | { readonly _tag: "SteamAppStateChanged"; readonly appId: string; readonly appState: string; readonly running: boolean; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "TrackedPidAdded"; readonly appId: string; readonly pid: number; readonly commandExcerpt?: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "TrackedPidRemoved"; readonly appId: string; readonly pid: number; readonly exitCode: number; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "RunningListRemoved"; readonly appId: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "ExecCommandLine"; readonly appId?: string; readonly commandExcerpt: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "LaunchTaskChanged"; readonly appId: string; readonly actionId: string; readonly task: string; readonly detail: string; readonly projection: SteamLaunchProjectionHint; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "InstallScriptProgress"; readonly appId: string; readonly stepCount: number; readonly commandExcerpt?: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "LaunchUserPrompt"; readonly appId: string; readonly actionId: string; readonly prompt: "waiting" | "continues"; readonly task: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "ConsoleProcessEvidence"; readonly action: "added" | "updated" | "removed"; readonly appId: string; readonly procId: number; readonly commandExcerpt?: string; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "ShaderEvidence"; readonly appId: string; readonly evidenceKind: "cache-dir" | "app-exited"; readonly evidence: SteamSignalEvidence }
  | { readonly _tag: "RawEvidence"; readonly evidence: SteamSignalEvidence }
```

Important parser regexes include `ExecCommandLine`, `GameAction ... LaunchApp changed task`, install script evaluator, user prompt wait/continue, game process added/updated/removed, shader cache dir, and app exited. AppID extraction already catches `-applaunch`, `AppId=`, and `--appid`.

Current observed Steam launch state is a reduced snapshot (`product/plugins/steam/src/observability/launch-state.ts`):

```ts
export type SteamLaunchStatus =
  | { readonly _tag: "Preparing" }
  | { readonly _tag: "Launching" }
  | { readonly _tag: "Running" }
  | { readonly _tag: "Stopping" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Stuck" }

export interface SteamLaunchSnapshot {
  readonly appId: string
  readonly status: SteamLaunchStatus
  readonly confidence: SteamSignalConfidence
  readonly ownership: SteamObservationOwnership
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly lastProgressAt: string
  readonly steam: SteamLaunchFacet
  readonly evidence: readonly SteamSignalEvidence[]
}
```

The observer daemon is in-process in korrid. It tails logs, parses each line, reduces into `active/latest`, and installs a global reader:

```ts
export function createSteamLogObserverDaemon(options = {}) {
  const observer = createSteamLogObserver(options)
  const owner = Symbol("steam-log-observer-daemon")
  return { start: async () => { install = installSteamLogObserverStatus(owner, observer.status); await observer.start() }, ... }
}
```

Watched files (`product/plugins/steam/src/observability/log-tailer.ts`) are:

```ts
export const DEFAULT_STEAM_LOG_FILES = [
  "content_log.txt",
  "gameprocess_log.txt",
  "console_log.txt",
  "shader_log.txt",
  "compat_log.txt",
  "appinfo_log.txt",
  "korri-steam-app-guest.log",
]
```

The tailer also dynamically starts watching `korri-steam-launch-wrapper-*.log` as `wrapper_log`, although that wrapper path is currently parked/experimental elsewhere.

Existing RPC/tooling surface:

- `app.plugin.diagnostics.collect` (`product/apps/portal/api/plugin-diagnostics/collect.rpc.ts`) dispatches to plugin handlers by provider id.
- Steam registers `steam.diagnostics.collect` in `product/plugins/steam/src/plugin.ts`, returning `collectSteamDiagnostics()`.
- Diagnostics response includes observer health, active/latest snapshot, and bounded recent evidence (`product/plugins/steam/src/observability/diagnostics.ts`).
- `app.server.status` exposes coarse sessiond lifecycle status via sessiond `/managed-launch/status` (`product/apps/portal/api/server/status.rpc-handler.ts`).
- `app.session.status` delegates to `KorriControl.sessionStatus()` and is a control-plane session lifecycle query (`product/apps/portal/api/session/status.rpc-handler.ts`).
- Direct sessiond HTTP/SSE endpoints are `/managed-launch/status`, `/managed-launch`, `/managed-launch/terminate`, and `/managed-launch/events?launchId=...` (`product/services/device/sessiond.ts`).

Sessiond lifecycle events are already a stream, but generic and launch-supervisor oriented:

```ts
export const SessiondManagedLaunchEventType = Schema.Literals([
  "launch-accepted", "renderer-stopped", "child-running", "child-exited",
  "restoring", "home-ready", "idle-ready", "failed", "recovering", "terminated",
  "launcher-exited", "wait-monitor-running", "wait-monitor-exited", "session-anchored",
])
```

`pushLifecycleEvent()` stores the last 64 events and fans out SSE to subscribers for the same `launchId` (`product/services/device/sessiond.ts` lines 263-289). The SSE endpoint replays prior events and emits heartbeat comments (`product/services/device/sessiond.ts` lines 880-936).

Where Steam launch lines are currently observed:

1. Steam log files under `resolveSteamLogDir()` default `/var/lib/korri/steam/logs`, or `KORRI_STEAM_LOG_DIR`, or `$KORRI_STEAM_HOME/logs`.
2. `content_log.txt`, `gameprocess_log.txt`, `console_log.txt`, `shader_log.txt`, etc. are tailed by the Steam plugin daemon in korrid.
3. Process list cleanup scans `/proc/*/cmdline`; it identifies foreground Steam roots by `SteamLaunch AppId=<id>` and descendants (`product/plugins/steam/src/session/foreground-processes.ts` lines 64-147).
4. Launch materialization annotates Steam launch metadata with appId/foregroundCleanup, consumed later by the Steam session lifecycle hook (see `product/plugins/steam/src/materializer.ts` lines referenced by grep around 79-106; not deeply read here).
5. Sessiond only sees generic lifecycle events and plugin cleanup hooks; it does not ingest the Steam log observer stream today.

## Architecture

Steam observability is currently plugin-local and pull/query oriented:

- `korrid` starts first-party plugin daemons (`product/services/device/korrid.ts` lines 80-100).
- `firstPartyPluginDaemonsForRegistry()` creates `createSteamLogObserverDaemon()` only when `@korri:steam` is enabled (`product/plugins/index.ts` lines 76-92).
- The daemon tails Steam logs and reduces them into a single in-memory `SteamObserverStatus`.
- Portal/tooling can query the current snapshot through generic plugin diagnostics RPC: `app.plugin.diagnostics.collect` with provider `@korri:steam`.

Session lifecycle is currently sessiond-owned and event-stream oriented:

- Launch clients POST `/managed-launch`, optionally with `launchMetadata` and `lifecycle: "session"`.
- Sessiond emits generic `SessiondManagedLaunchEvent` SSE events for `launchId`.
- `app.server.status` and `app.session.status` expose status snapshots, not detailed Steam events.
- The existing protocol has a strict Schema evolution rule: add optional fields to client schema before daemon emits them; capabilities should gate major changes.

Best insertion points for a full `SteamLifecycleEvent` stream:

1. **Define event contract in the Steam plugin, close to parsers/reducer.** Add `SteamLifecycleEvent` and Schema-backed response/event types under `product/plugins/steam/src/observability/`. Reuse `SteamLogSignal`/`SteamSignalEvidence` as inputs, but do not expose raw parser internals as the public lifecycle contract. Include `appId`, timestamp, sequence, phase/type, evidence, confidence, optional `launchId` when correlated.

2. **Extend `createSteamLogObserver` with subscription/fanout.** The observer already has the canonical stream of tailed lines before reduction (`ingestLine`). Emit lifecycle events immediately after parsing/reduction, while still maintaining `status()`. This avoids reparsing logs in RPC handlers and keeps hot-path work bounded.

3. **Correlate Steam AppID to sessiond launchId via launch metadata/session hook.** The Steam session lifecycle hook currently captures `launchId -> appId` in `afterChildRunning` and uses it for cleanup. That is the natural bridge for annotating Steam observer events with `launchId`. Today it is isolated inside `createSteamSessionLifecycleHook`; a shared correlation registry or observer API would let the Steam log observer mark events as `korri-correlated` instead of `steam-only`.

4. **Expose through korrid first, not direct sessiond, if keeping plugin ownership.** Since the Steam observer daemon lives in korrid and Steam plugin diagnostics are already an RPC surface, the lowest-risk API is a new plugin-owned RPC/handler such as `app.plugin.lifecycle.stream` or a Steam-specific diagnostics/status RPC if project conventions allow. Avoid making sessiond parse Steam logs; sessiond should remain the foreground lifecycle owner and consume/correlate plugin facts only if needed.

5. **If merged into sessiond lifecycle SSE, extend protocol carefully.** `SessiondManagedLaunchEvent` strict decoding means new required fields or unknown event types can break clients. Prefer optional `pluginEvents`/`diagnostics`/`runtime` fields or a parallel stream rather than adding many Steam-specific event types to the generic event union. Add capability flag first if sessiond will emit runtime/plugin lifecycle details.

6. **Hot-path risk:** backlog notes previous live Steam status calls taking 8-24s under load. A stream should avoid per-request log scans and should bound evidence arrays, replay windows, and sanitization. Existing tailer/reducer is a good base because it is incremental and evidence is clamped.

## Backlog items visible in context

- `01KVEQ0Z9G09F36SSMXA1H4T1P-expose-full-steam-launch-lifecycle-observability`: directly asks for structured lifecycle events across app update/download, shader/pre-cache, install scripts, cloud sync, prompts/interstitials, CreatingProcess, process added/updated/removed, Proton/FEX runtime setup, game window/running, crash/exit, and cleanup; asks korrid/sessiond to expose a read-only stream/query API consumable by Portal/tooling.
- `01KV3A5RNCMMGR8FY5Y8MKPWGD-normalize-all-foreground-launches-under-one-lifecycle-superv`: wants Steam, emulator, native/process, and remote-stream launches under one durable foreground session identity and lifecycle projection, with runtime-specific details as diagnostics/artifacts.
- `01KV4R22WPATH742W1X3GQEQ5X-compact-steam-status-rpc-hot-path-under-live-log-load`: notes prior `app.steam.status` latency under live Sonic Mania log load and requires bounded latency and regression coverage for high-volume Steam evidence streams.
- `01KVEN8873H1E47BHXV0SBD7DC-fix-bandai-sessiond-display-environment-in-nix` and `01KVEN4CZ632KTA3XWPJYZJW8M-teach-sessiond-to-follow-the-active-xwayland-display`: sessiond/display environment reliability items that affect Steam launch success but are not observability-specific.
- `01KV53R13F6YQPM170P1AVD0V0-preserve-steam-per-app-eula-state-during-materialization`: asks warm-launch diagnostics to flag pending Steam modal/EULA blockers, relevant to lifecycle event taxonomy.

## Start Here

Start with `product/plugins/steam/src/observability/log-observer.ts`. It is the live in-process point where raw tailed Steam lines become parsed signals and reduced snapshots, and it is already installed as a daemon by korrid. From there, open `log-signals.ts` for parser coverage and `product/services/device/sessiond.ts` only when deciding how or whether Steam events correlate with the existing managed-launch SSE stream.
