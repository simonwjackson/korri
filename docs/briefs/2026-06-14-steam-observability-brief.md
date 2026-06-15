---
date: 2026-06-14
topic: steam-launch-observability
artifact: brief
backlog: 01KV3KWT98Y6W6CNXP05ZPSHH7
---

# First-Class Steam Launch Observability

## Chosen Thing

A Korri Steam observer that treats Steam as an external runtime with its own high-value signals. The observer should watch Steam's own logs and AppID/process state, map the signals into a normalized launch event stream, and preserve Steam-specific evidence without hiding it behind generic lifecycle states.

The immediate scope is **Steam only**. Gamescope, MangoHud, screenshots, compositor geometry, and broader visual validation can attach later as separate adapters. This item is about knowing what Steam is doing: accepted launch, preparing content/runtime, running AppID, tracking PIDs, Proton/runtime activity, stopped, failed, or stuck.

## User Requirement

> I only care about first class Steam observability here. All the other, GameScope and Mango, that can be another day. What I actually want here is to know exactly what Steam is doing so that we can respond accordingly, or at the very least be able to watch and show the UI that something's happening.

Also:

> Normalizing does not mean hiding info. Steam will have its own signals that are unique to Steam. Model it so we are as linear as possible and still capture/observe everything so we are not launching into the void and praying.

## Research Summary

Multi-agent web research found no stable official Linux Steam IPC/API for game lifecycle state. The strongest practical route is a **passive Steam log observer** plus optional per-launch debug logs.

Primary sources and patterns:

- `content_log.txt` is the best passive lifecycle source. It commonly emits lines like:
  - `Game <appid> adding PID <pid> as a tracked process ... SteamLaunch AppId=<appid> ...`
  - `AppID <appid> state changed : Fully Installed,App Running,`
  - `Game <appid> no longer tracking PID <pid>, exit code <n>`
  - `AppID <appid> state changed : Fully Installed,`
- Steam logs live under the Steam user root, commonly:
  - `/var/lib/korri/steam/logs` on Bandai/Korri-managed Steam
  - `~/.local/share/Steam/logs`
  - `~/.steam/steam/logs`
  - `~/.steam/root/logs`
- Steam rotates/recreates logs using `.previous.txt` siblings, so use `tail -F` semantics or inotify reopen-by-name, not a permanently held inode.
- Useful log files beyond lifecycle:
  - `console_log.txt` — broad Steam client diagnostic stream
  - `content_log.txt` — install/update/AppID running/tracked-PID activity
  - `compat_log.txt` — compatibility-tool/Steam Play activity when present
  - `appinfo_log.txt` — app metadata/config activity
  - `shader_log.txt` — shader pre-cache activity that can delay launch
  - `steam_api_log.txt` — Steam API debug activity when enabled
  - `steamwebhelper.log` / `cef_log.txt` — UI/webhelper issues
- Per-AppID Proton logging:
  - `PROTON_LOG=1`
  - `PROTON_LOG_DIR=<known launch artifact dir>`
  - writes `steam-<appid>.log`
- Steam Linux Runtime / pressure-vessel diagnostics can be enabled with:
  - `STEAM_LINUX_RUNTIME_LOG=1`
  - `PRESSURE_VESSEL_VERBOSE=1`
  - writes runtime logs such as `slr-app<appid>-*.log` under the runtime's `var/` directory.
- Process corroboration is useful but secondary:
  - Steam Linux launches commonly involve `reaper SteamLaunch AppId=<appid> -- ...`
  - `/proc/*/cmdline` can confirm tracked PIDs and AppID in non-Flatpak/non-portal setups.

## Design Posture

Steam logs are **evidence streams**, not a stable API. Therefore:

- Treat parsed log lines as observed facts with confidence levels.
- Preserve raw log provenance: file path, byte offset or line timestamp when available, raw excerpt.
- Combine multiple signals rather than relying on one magic line.
- Keep the parser versioned and covered by fixture tests.
- If Steam changes a line format, the observer should degrade to raw-tail evidence rather than going blind.

## Target Architecture

```text
Steam runtime
  ├─ logs/content_log.txt
  ├─ logs/console_log.txt
  ├─ logs/compat_log.txt
  ├─ logs/appinfo_log.txt
  ├─ logs/shader_log.txt
  ├─ optional PROTON_LOG_DIR/steam-<appid>.log
  └─ optional Steam Runtime slr-app<appid>-*.log
        │
        ▼
SteamLogTailer
  - follows files by name
  - handles create/rotate/truncate
  - emits raw SteamLogLine records
        │
        ▼
SteamSignalParser
  - extracts AppID state transitions
  - extracts tracked PID lifecycle
  - extracts content/update/shader/runtime activity hints
        │
        ▼
SteamLaunchObserver
  - correlates lines by appId + launch window + session id
  - emits normalized launch events with Steam facets
  - maintains active/latest Steam launch snapshot
        │
        ▼
Korri status/UI/sessiond integration
  - shows "Steam is preparing/running/stopping/stuck"
  - exposes raw evidence and artifact paths for operators
```

## Normalized Event Shape

Normalization should make the lifecycle readable without flattening away Steam-specific evidence.

Conceptual shape:

```ts
type RuntimeObservationEvent = {
  id: string
  at: string
  sequence: number
  sessionId?: string
  runtime: "steam"
  appId?: string
  state:
    | "Observed"
    | "Preparing"
    | "Launching"
    | "Running"
    | "Stopping"
    | "Stopped"
    | "Failed"
    | "Stuck"
  signal:
    | "steam-log-line"
    | "steam-app-state"
    | "steam-tracked-pid-added"
    | "steam-tracked-pid-removed"
    | "steam-content-activity"
    | "steam-shader-activity"
    | "steam-compat-activity"
    | "steam-proton-log-created"
    | "steam-runtime-log-created"
    | "proc-corroboration"
  confidence: "confirmed" | "inferred" | "hint"
  message: string
  steam: {
    appId?: string
    appState?: string
    trackedPid?: number
    trackedPidExitCode?: number
    logFile?: string
    logOffset?: number
    rawLine?: string
    protonLogPath?: string
    runtimeLogPath?: string
  }
}
```

Universal consumers can project `state`. Steam-specific tools can inspect `steam.*` and raw evidence.

## Steam State Projection

Initial projection rules:

```text
No active AppID evidence
  → Idle / no Steam launch observed

content_log: content/update/shader/install activity for AppID
  → Preparing

content_log: Game <appid> adding PID ... SteamLaunch AppId=<appid>
  → Launching

content_log: AppID <appid> state changed ... App Running
  → Running, confidence=confirmed-from-Steam-log

content_log: Game <appid> no longer tracking PID <pid>, exit code <n>
  → Stopping or Running-with-child-exited, depending on remaining tracked PIDs/App Running state

content_log: AppID <appid> state changed : Fully Installed,
  → Stopped

No progress for threshold while launch requested and Steam logs still active
  → Stuck, confidence=inferred, include last Steam evidence

Proton/runtime log created or appended
  → Keep current lifecycle state; attach evidence and show detail like "Proton log active"
```

The UI should be able to say things like:

- "Steam accepted launch for AppID 584400."
- "Steam is preparing content/shaders."
- "Steam is running AppID 584400."
- "Steam is tracking PID 12345."
- "Steam stopped AppID 584400 with tracked PID exit code 0."
- "Steam has not emitted progress for 45s; last signal was shader pre-cache."

## Bandai Evidence and Implementation Handoff

The original focused fixture-capture spike is documented in:

- `docs/handoffs/bandai-steam-observability-spike-2026-06-14.md`

Captured Bandai evidence now lives in:

- `docs/research/steam-observability/bandai-2026-06-14/`

Use the revised implementation handoff before coding:

- `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md`

Important correction from the captured evidence: `content_log.txt` carries AppID running/stopped state, `gameprocess_log.txt` carries tracked PID add/remove events, and `console_log.txt` carries Steam `LaunchApp` task progress.

## First Implementation Slice

1. Resolve Steam log roots for Korri-managed Steam:
   - primary: `/var/lib/korri/steam/logs`
   - support standard user roots as future/general fallback.
2. Add a `SteamLogTailer` with tail-by-name semantics:
   - handle existing file
   - handle file creation
   - handle truncation/rotation
   - preserve raw line provenance.
3. Parse `content_log.txt` first:
   - tracked PID added
   - tracked PID removed
   - App Running state entered
   - App Running state left.
4. Add passive evidence tails for:
   - `console_log.txt`
   - `compat_log.txt`
   - `appinfo_log.txt`
   - `shader_log.txt`.
5. Add optional per-launch Proton log setup when safe:
   - set `PROTON_LOG=1`
   - set `PROTON_LOG_DIR=<launch artifact dir>`
   - tail `steam-<appid>.log` if it appears.
6. Expose active/latest Steam observation snapshot through Korri status/RPC.
7. Drive a simple UI/status projection from the event stream.
8. Fixture-test the parser using captured `content_log.txt` examples and synthetic rotate/truncate cases.

## Non-Goals For This Item

- Gamescope observability.
- MangoHud observability.
- Screenshot/visual validation.
- Full generic runtime observer implementation for RetroArch/other emulators.
- Replacing sessiond's foreground lifecycle model.

## Future Generalization

The mechanism should become runtime-general later:

```text
RuntimeLogTailer + RuntimeSignalParser + RuntimeObservationEvents
```

Steam gets a `steam` facet. RetroArch can later get a `retroarch` facet from `--log-file` and process exit. Other runtimes can add their own facets. The UI reads the normalized state projection, while details panels preserve runtime-specific signals.

## Sources From Research

- Steamworks debugging docs: `https://partner.steamgames.com/doc/sdk/api/debugging`
- Steamworks upload/content docs: `https://partner.steamgames.com/doc/sdk/uploading`
- Steamworks InstallScripts docs: `https://partner.steamgames.com/doc/sdk/installscripts`
- Valve Proton README: `https://github.com/ValveSoftware/Proton`
- Proton FAQ: `https://github.com/ValveSoftware/Proton/wiki/Proton-FAQ`
- Steam Runtime bug-reporting docs: `https://github.com/ValveSoftware/steam-runtime/blob/master/doc/reporting-steamlinuxruntime-bugs.md`
- GNU `tail -F` semantics: `https://www.gnu.org/software/coreutils/manual/html_node/tail-invocation.html`
- Linux `inotify(7)`: `https://man7.org/linux/man-pages/man7/inotify.7.html`
- Example Steam `content_log.txt` lifecycle lines: `https://forums.factorio.com/viewtopic.php?t=105072`
- Gamescope issue documenting Steam reaper/AppID process-tree assumptions: `https://github.com/Plagman/gamescope/issues/484`
- Steam for Linux examples of game process added/removed logs: `https://github.com/ValveSoftware/steam-for-linux/issues/13031`
