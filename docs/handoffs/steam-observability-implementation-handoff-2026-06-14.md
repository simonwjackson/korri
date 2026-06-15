---
date: 2026-06-14
topic: steam-observability-implementation
artifact: handoff
backlog: 01KV3KWT98Y6W6CNXP05ZPSHH7
briefing: docs/briefs/2026-06-14-steam-observability-brief.md
research: docs/research/steam-observability/bandai-2026-06-14/
supersedes: docs/handoffs/bandai-steam-observability-spike-2026-06-14.md
---

# Steam Observability Implementation Handoff

## Purpose

Implement first-class Steam launch observability in Korri using real Bandai evidence. The previous spike handoff was useful for fixture capture, but the spike is now effectively done: the research directory contains Bandai log tails and per-AppID slices. This handoff supersedes the spike procedure and describes what to build next.

This item is **Steam-only**. Do not expand scope into Gamescope, MangoHud, screenshots, display geometry, or visual validation. Those can attach later as separate adapters. The goal here is: **know what Steam itself is doing and expose that as a normalized, UI-consumable observation stream without hiding Steam-specific facts.**

## Key Correction From Bandai Evidence

The original hypothesis over-centered `content_log.txt`. Real Bandai fixtures show the split is:

```text
content_log.txt       → AppID state: App Running / stopped
                       Example: AppID 360740 state changed : Fully Installed,App Running,
                       Example: AppID 360740 state changed : Fully Installed,

gameprocess_log.txt   → tracked Steam process add/remove + exit code
                       Example: AppID 360740 adding PID 204611 as a tracked process "... SteamLaunch AppId=360740 ..."
                       Example: AppID 360740 no longer tracking PID 204611, exit code 0

console_log.txt       → Steam launch task progress / preparation state
                       Example: LaunchApp changed task to CheckShaderDepotManifest
                       Example: LaunchApp changed task to ProcessingInstallScript
                       Example: LaunchApp changed task to CreatingProcess
                       Example: LaunchApp changed task to WaitingGameWindow
                       Example: LaunchApp changed task to Completed

shader_log.txt        → shader/cache activity and AppID shader-exit evidence
                       Example: Setting MESA_GLSL_CACHE_DIR=.../shadercache/<appid>
                       Example: AppID <appid> exited.

korri-steam-gamescope-launch-<appid>.log
                     → exact Korri wrapper/planner evidence: appid, argv template,
                       Steam-expanded command, env, final exec argv.
```

Implementation should make `gameprocess_log.txt` first-class, not optional.

## Existing Evidence Location

Bandai fixture directory:

```text
docs/research/steam-observability/bandai-2026-06-14/
```

Important files:

```text
content-log-downwell.txt
content-log-sonic-mania.txt
content-log-caveblazers.txt

gameprocess-log-downwell.txt
gameprocess-log-sonic-mania.txt
gameprocess-log-caveblazers.txt

console-log-downwell.txt
console-log-sonic-mania.txt
console-log-caveblazers.txt

shader_log.txt.tail
logs-before.txt
logs-after.txt
parser-fixtures/*.txt
```

Current research README/notes are not synthesized yet; raw evidence exists. If you need a small prep step before coding, fill the README summary from these artifacts, but do not rerun the whole spike unless you need more fixtures.

## Validated Bandai Patterns

### App running/stopped from `content_log.txt`

Examples:

```text
[2026-06-14 14:41:27] AppID 360740 state changed : Fully Installed,App Running,
[2026-06-14 14:41:57] AppID 360740 state changed : Fully Installed,
```

Same shape seen for:

- Downwell `360740`
- Sonic Mania `584400`
- Caveblazers `452060`

### Tracked PID lifecycle from `gameprocess_log.txt`

Example:

```text
[2026-06-14 14:41:27] AppID 360740 adding PID 204611 as a tracked process "/run/current-system/sw/bin/bash /var/lib/korri/bin/korri-steam-gamescope-launch --appid 360740 -- ... SteamLaunch AppId=360740 ... Downwell.exe"
[2026-06-14 14:41:28] AppID 360740 adding PID 204625 as a tracked process
...
[2026-06-14 14:41:57] AppID 360740 no longer tracking PID 204611, exit code 0
```

Important observations:

- Steam tracks multiple PIDs per launch.
- The first tracked PID includes the full command and is the most useful for AppID/runtime metadata.
- Later PIDs may not include the command.
- PID removals are multiple and can include `exit code -1` for inner/terminated tracked children.
- The root/wrapper PID often exits `0` even when other tracked PIDs exit `-1`; do not treat every `-1` as user-facing failure.
- There may be stale/pre-existing removal lines before a new launch. Use launch-window correlation.

### Steam task progress from `console_log.txt`

Downwell example:

```text
[2026-06-14 14:41:06] ExecCommandLine: "'/var/lib/korri/steam/steamrtarm64/steam' ... '-applaunch' '360740'"
[2026-06-14 14:41:06] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to CheckShaderDepotManifest with ""
[2026-06-14 14:41:07] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to ProcessingInstallScript with ""
[2026-06-14 14:41:07] Running install script evaluator for AppID 360740, 1 step(s) ... SteamLaunch AppId=360740 Install=1 ...
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to CreatingProcess with ""
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to WaitingGameWindow with ""
[2026-06-14 14:41:27] GameAction [AppID 360740, ActionID 4] : LaunchApp changed task to Completed with ""
```

This is the best source for UI progress while Steam has not yet emitted `App Running`.

## Target User-Facing Projection

The UI/status surface should be able to say:

```text
Steam is checking shader metadata...
Steam is processing install script...
Steam is creating the game process...
Steam reports AppID 584400 is running.
Steam is stopping AppID 584400.
Steam stopped AppID 584400.
Steam has not emitted progress for N seconds; last task was ProcessingInstallScript.
```

Do not hide Steam-specific task names. Normalize them into state, but preserve the exact task as a Steam facet.

## Proposed Internal Event Shape

Use a normalized runtime observation event with Steam facets. Exact naming can change, but the model should preserve these dimensions:

```ts
type SteamObservationEvent = {
  readonly runtime: "steam"
  readonly observedAt: string
  readonly sequence: number
  readonly source:
    | "content_log"
    | "gameprocess_log"
    | "console_log"
    | "shader_log"
    | "korri_wrapper_log"
  readonly state:
    | "Preparing"
    | "Launching"
    | "Running"
    | "Stopping"
    | "Stopped"
    | "Failed"
    | "Stuck"
    | "Observed"
  readonly signal:
    | "steam-app-state"
    | "steam-tracked-pid-added"
    | "steam-tracked-pid-removed"
    | "steam-launch-task"
    | "steam-install-script"
    | "steam-shader-activity"
    | "steam-wrapper-plan"
    | "raw-log-line"
  readonly confidence: "confirmed" | "inferred" | "hint"
  readonly appId?: string
  readonly message: string
  readonly steam: {
    readonly appId?: string
    readonly appState?: string
    readonly launchTask?: string
    readonly actionId?: string
    readonly trackedPid?: number
    readonly trackedPidExitCode?: number
    readonly commandExcerpt?: string
    readonly logFile: string
    readonly rawLine: string
  }
}
```

For the snapshot/status projection, maintain:

```ts
type SteamLaunchObservationSnapshot = {
  readonly appId: string
  readonly state: "Preparing" | "Launching" | "Running" | "Stopping" | "Stopped" | "Failed" | "Stuck"
  readonly lastSignalAt: string
  readonly lastSignal: string
  readonly lastTask?: string
  readonly trackedPids: readonly number[]
  readonly removedPids: readonly { pid: number; exitCode: number; at: string }[]
  readonly confidence: "confirmed" | "inferred" | "hint"
  readonly evidence: readonly SteamObservationEvent[]
}
```

## Parser Scope For First Slice

Implement parsers for these exact Bandai-proven patterns first.

### `content_log.txt`

```ts
const appState = /^\[(?<at>[^\]]+)\]\s+AppID\s+(?<appId>\d+)\s+state changed\s*:\s*(?<state>.*)$/
```

Projection:

- `state` contains `App Running` → `Running`, confidence `confirmed`.
- active AppID state no longer contains `App Running` → `Stopped`, confidence `confirmed`.
- preserve full `state` string in `steam.appState`.

Do not hard-code only `Fully Installed,` as stopped; use “does not include `App Running`” for active AppID, while preserving raw state.

### `gameprocess_log.txt`

```ts
const trackedPidAdded = /^\[(?<at>[^\]]+)\]\s+AppID\s+(?<appId>\d+)\s+adding PID\s+(?<pid>\d+)\s+as a tracked process(?:\s+"(?<command>.*)")?$/

const trackedPidRemoved = /^\[(?<at>[^\]]+)\]\s+AppID\s+(?<appId>\d+)\s+no longer tracking PID\s+(?<pid>\d+),\s+exit code\s+(?<exitCode>-?\d+)$/
```

Projection:

- first `trackedPidAdded` in active launch window → `Launching`.
- additional `trackedPidAdded` → remain `Launching` or `Running` depending on current app state; append PID evidence.
- `trackedPidRemoved` while App Running still true → likely `Stopping` or `Running` with child churn; do not mark failure solely from `-1`.
- all tracked PIDs removed plus app state not running → `Stopped`.

### `console_log.txt`

```ts
const launchTask = /^\[(?<at>[^\]]+)\]\s+GameAction\s+\[AppID\s+(?<appId>\d+),\s+ActionID\s+(?<actionId>\d+)\]\s+:\s+LaunchApp changed task to (?<task>\S+) with "(?<detail>.*)"$/

const installScript = /^\[(?<at>[^\]]+)\]\s+Running install script evaluator for AppID\s+(?<appId>\d+),\s+(?<steps>\d+) step\(s\)/
```

Projection:

- task in `CheckShaderDepotManifest`, `ProcessingInstallScript`, `SynchronizingStats`, `ShowInterstitials`, `SynchronizingControllerConfig`, `SiteLicenseSeatCheckout`, `DelayLaunch` → `Preparing`, confidence `hint`.
- task `CreatingProcess` or `WaitingGameWindow` → `Launching`, confidence `hint`.
- task `Completed` before App Running → still `Launching`; do not imply game is running.
- install-script evaluator → `Preparing`, signal `steam-install-script`.

### `shader_log.txt`

First slice can parse AppID mentions only as evidence, not lifecycle authority:

```ts
const shaderAppExited = /^\[(?<at>[^\]]+)\]\s+AppID\s+(?<appId>\d+)\s+exited\./
const shaderCacheDir = /^\[(?<at>[^\]]+)\]\s+Setting MESA_GLSL_CACHE_DIR=.*shadercache\/(?<appId>\d+)\b/
```

Projection:

- shader cache setup → `Preparing` hint if active launch not running yet.
- shader AppID exited → attach evidence; do not override `content_log` app state.

## Tailer Requirements

Implement tail-by-name semantics:

- watch known files under `/var/lib/korri/steam/logs`;
- open existing files at end for live observation;
- detect truncation/recreation and reopen;
- preserve source filename per line;
- tolerate missing files;
- do not block launch if observer fails;
- keep bounded recent evidence in memory.

First watch set on Bandai:

```text
content_log.txt
gameprocess_log.txt
console_log.txt
shader_log.txt
compat_log.txt
appinfo_log.txt
korri-steam-app-guest.log
korri-steam-gamescope-launch-*.log
```

For first implementation, parsing can be limited to the first four; the rest can be raw evidence streams.

## Correlation Rules

Do not just group by AppID globally. Use launch windows.

Minimum viable rules:

1. A launch window starts when Korri requests Steam AppID launch, when `ExecCommandLine ... -applaunch <appid>` appears, or when first `GameAction [AppID] LaunchApp` appears.
2. Ignore PID-removal lines before the launch window unless there is already active state for that AppID.
3. Within a window, correlate all parsed lines by AppID.
4. `content_log` `App Running` is authoritative for Running.
5. `content_log` state without `App Running` is authoritative for Stopped after a known active/running AppID.
6. `gameprocess_log` tracked PIDs explain Launching/Stopping but do not alone prove user-visible Running.
7. `console_log` task lines explain Preparing/Launching progress but do not alone prove Running.
8. A Stuck state is inferred when there is an active launch request/window but no progress for a threshold. Include the last task/evidence.

## Implementation Plan

### Unit 1 — Fixture synthesis / docs cleanup

- Fill `docs/research/steam-observability/bandai-2026-06-14/README.md` summary.
- Fill `notes.md` with observed line formats and caveats.
- Split mixed parser fixtures by source, e.g.:

```text
parser-fixtures/content-log-app-state.txt
parser-fixtures/gameprocess-log-tracked-pids.txt
parser-fixtures/console-log-launch-tasks.txt
parser-fixtures/shader-log-appid-evidence.txt
```

This is small but important: current fixtures mix sources and should not drive a single parser.

### Unit 2 — Steam log parsers

Add pure parser functions and tests from fixtures.

Possible file:

```text
product/services/device/steam/steam-log-signals.ts
product/services/device/steam/steam-log-signals.test.ts
```

Tests should cover:

- content app running/stopped;
- gameprocess PID added with command;
- gameprocess PID added without command;
- gameprocess PID removed with `-1` and `0`;
- console launch task parsing;
- install-script evaluator parsing;
- shader AppID evidence;
- unknown lines return raw/ignored without throwing.

### Unit 3 — Tailer

Add a tail-by-name file watcher abstraction.

Possible file:

```text
product/services/device/steam/steam-log-tailer.ts
product/services/device/steam/steam-log-tailer.test.ts
```

Keep it generic enough for later runtime observers, but do not over-generalize now.

Tests should simulate:

- starts from EOF;
- emits appended lines;
- handles truncate;
- handles file recreation;
- tolerates missing files until created.

### Unit 4 — Steam launch observer / snapshot reducer

Add reducer that consumes parsed signals and produces active/latest snapshots.

Possible file:

```text
product/services/device/steam/steam-launch-observer.ts
product/services/device/steam/steam-launch-observer.test.ts
```

Tests from Bandai sequences:

- Sonic Mania: tracked PID → App Running → tracked removals → stopped.
- Caveblazers: same.
- Downwell: ignores stale stop/removal lines before new launch; handles install-script preparation.

### Unit 5 — Status/RPC surface

Expose read-only Steam observation.

Possible first surface:

```text
app.steam.status
```

or, if that is too much API scope, expose through a server-status diagnostics field behind an optional field. Dedicated `app.steam.status` is easier to test and iterate without bloating `app.server.status` immediately.

Response should include:

- active snapshot if any;
- latest snapshot;
- recent events/evidence bounded to N lines;
- observer health: log dir, watched files, last read error if any.

### Unit 6 — UI projection later

Once status exists, UI can show Steam progress. Do not block parser/tailer work on UI.

## Important Non-Goals

- Do not implement Gamescope/MangoHud observability here.
- Do not require screenshots or display geometry.
- Do not classify game correctness from Steam logs alone.
- Do not make every `exit code -1` a failure.
- Do not parse VDF/localconfig as a lifecycle signal.
- Do not treat wrapper logs as the primary Steam truth; they are Korri evidence, not Steam state.

## Risks / Gotchas

- Steam logs are not a public stable API. Preserve raw lines and confidence.
- Bandai line formats use `AppID <id>` in `gameprocess_log.txt`, not `Game <id>` from some public examples.
- `console_log.txt` task lines can be high-signal but are less authoritative than app state.
- Existing log files include stale historical lines. Start tailing from EOF for live observer; when reading fixtures, use launch-window timestamps.
- Some preparation events, especially shader/cache work, may happen before or after running/stopped; attach as evidence unless correlated to active launch.
- Logs can contain paths/account-adjacent data. Keep status summaries bounded and avoid dumping full command lines in user-facing UI unless explicitly in diagnostics.

## Acceptance For This Implementation Slice

- Pure parsers pass against Bandai fixtures for all three AppIDs.
- Tailer handles append/truncate/recreate in unit tests.
- Observer reducer can produce this sequence from fixture replay:

```text
Preparing → Launching → Running → Stopping → Stopped
```

- Downwell install-script fixture projects `ProcessingInstallScript` as `Preparing` before launch.
- PID tracking is available in Steam facets but does not drive false failure.
- Status/RPC can show active/latest Steam observation without launching a game.

## Related Files

Research and planning:

- `docs/briefs/2026-06-14-steam-observability-brief.md`
- `docs/research/steam-observability/bandai-2026-06-14/`
- `work/items/parking-lot/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti.md`

Current Steam implementation anchors:

- `product/systems/nixos/modules/korri-steam.nix`
- `product/services/device/steam/steam-gamescope-launch-plan.ts`
- `product/services/device/steam/steam-gamescope-launch-planner-cli.ts`
- `product/services/device/nix/steam-gamescope-launcher.nix`
- `product/services/device/sessiond.ts`

Prior Steam lessons:

- `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md`
- `docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md`
- `docs/solutions/architecture-patterns/steam-applaunch-with-silent-steam-and-per-app-launchoptions-gamescope-wrap-aka-x86-2026-05-27.md`
