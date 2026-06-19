# Steam Deck / SteamOS Game Launch Lifecycle — Prior Art Digest

**Research value: high** — Substantial, directly applicable prior art found: a complete reverse-engineered IPC type surface, exact task-state machine strings, and multiple live plugin implementations in TypeScript/React that consume them. Everything Korri/korrid needs to drive a lifecycle UI exists in the open.

---

## Prior Art

### 1. `decky-frontend-lib` — Full SteamClient IPC type surface

**Repo:** `SteamDeckHomebrew/decky-frontend-lib` (TypeScript, active as of 2026-04)

The decky-loader project has reverse-engineered the complete `SteamClient` global injected into Steam's CEF (Chromium Embedded Framework) process. All hooks live in `src/globals/steam-client/`. The most relevant files for launch lifecycle:

#### `App.ts` — The canonical launch state machine

**`LaunchAppTask_t`** is the exhaustive string union of every task state during a `LaunchApp` game action:

```ts
type LaunchAppTask_t =
  | "None" | "Starting" | "ConnectingToSteam" | "RequestingLicense"
  | "UpdatingAppInfo" | "UpdatingAppTicket"
  | "WaitingPrevProcess"
  | "DownloadingDepots" | "DownloadingWorkshop"
  | "ProcessingInstallScript" | "RunningInstallScript"
  | "SynchronizingCloud"           // ← cloud save sync
  | "SynchronizingControllerConfig"
  | "ProcessingShaderCache"         // ← shader pre-compilation
  | "VerifyingFiles"
  | "CreatingProcess"
  | "WaitingGameWindow"
  | "Completed" | "Cancelled" | "Failed"
  // … + EULA, VR, DRM, trial, and other gate tasks
```

**`GameAction`** carries live progress during any active task:

```ts
interface GameAction {
  nGameActionID: number;
  gameid: string;
  strActionName: "LaunchApp" | "VerifyApp";
  strTaskName: LaunchAppTask_t;
  strTaskDetails: string;
  nSecondsRemaing: number;  // Valve typo, not ours
  strNumDone: string;
  strNumTotal: string;
  bWaitingForUI: boolean;
}
```

`strNumDone`/`strNumTotal` give raw progress counts for `DownloadingDepots` and `ProcessingShaderCache`. `strTaskDetails` carries human-readable sub-status text.

**`EDisplayStatus`** enum drives the visible badge in Steam's library grid:

```ts
enum EDisplayStatus {
  Invalid, Launching, Uninstalling, Installing, Running,
  Validating, Updating, Downloading, Synchronizing,
  ReadyToInstall, ReadyToPreload, ReadyToLaunch,
  // … presale, region, preload
  UpdatePaused, UpdateQueued, UpdateRequired, UpdateDisabled,
  DownloadPaused, DownloadQueued, DownloadRequired, DownloadDisabled,
  CloudError, CloudOutOfDate, Terminating, DownloadFailed, UpdateFailed,
}
```

**`EAppUpdateError`** is a ~50-member enum covering every failure mode — disk write, DRM failure, corrupt files, `CompatibilityToolFailure`, `CreateProcessFailure`, etc.

#### `GameSessions.ts` — Process lifetime

```ts
interface AppLifetimeNotification {
  unAppID: number;   // 0 for non-Steam shortcuts
  nInstanceID: number;  // PID of the reaper/first child
  bRunning: boolean;
}
```

Note: `unAppID` is not reliably set for non-Steam game shortcuts — it defaults to `0`. For non-Steam apps, focus tracking via `RegisterForFocusChangeEvents` + the running-app roster is required to infer identity.

### 2. `SDH-PauseGames` — Working plugin consuming the IPC hooks

**Repo:** `popsUlfr/SDH-PauseGames` (TypeScript + Python, 119 ⭐)

A Decky Loader plugin that actually ships with this lifecycle plumbing. The `backend.ts` shows the full hook subscription pattern:

```ts
SteamClient.GameSessions.RegisterForAppLifetimeNotifications(cb)
SteamClient.Apps.RegisterForGameActionStart(cb)
SteamClient.Apps.RegisterForGameActionTaskChange(cb)
SteamClient.System.RegisterForOnSuspendRequest(cb)
SteamClient.System.RegisterForOnResumeFromSuspend(cb)
SteamClient.System.UI.RegisterForFocusChangeEvents(cb)
```

`Router.RunningApps` is a live snapshot of `AppOverview[]`; `registerForRunningAppsChange` subscribes to additions/removals. All unregistration returns a `{ unregister() }` handle.

The `FocusChangeEvent` includes `{ appid, pid, strExeName, windowid }` — the exe name is the direct signal that a game process has window focus (vs. `steamwebhelper`).

### 3. `Decky Loader` core — Plugin injection architecture

**Repo:** `SteamDeckHomebrew/decky-loader` (TypeScript + Python)

The framework injects into Steam's CEF process and exposes the `SteamClient` global to plugins. Key pattern: frontend React TypeScript talks to a Python backend over JSON-RPC/WebSocket on localhost port 8080/1337. Toast notifications, routing, and overlay panels are all available from the same hook surface.

The crash-recovery pattern (monitoring the Steam webhelper process via `crashDetected` → restart) is a model for korrid's own resilience: if the launcher UI process dies, the supervisor restarts it and can restore state.

---

## Adjacent Solutions

### Heroic Games Launcher (Electron + React)

**Repo:** `Heroic-Games-Launcher/HeroicGamesLauncher` (11.6k ⭐, active)

Heroic is an open-source Electron+React launcher for Epic, GOG, and Amazon games on Linux/macOS/Windows. Its lifecycle pattern is structurally similar to what Korri needs but without a shared IPC bus — it **parses stdout of CLIs** (`legendary`, `gogdl`, `nile`) for progress and surfaces download queues, cloud save sync, and install progress in its UI.

**What transfers to Korri:** the "download queue with per-item state + cloud sync phase before launch" UX pattern. Heroic shows per-game download progress bars, a cloud sync phase ("Syncing saves…") before launch, and error dialogs with actionable steps. The state model is ad-hoc booleans (`isInstalling`, `isLaunching`, `isSyncing`) rather than a tagged union — a pattern Korri should explicitly avoid given the lattice conventions.

### Xbox Quick Resume / Console Suspension Model

Xbox and PlayStation both treat suspend/resume as a first-class lifecycle phase: the game process is stopped (SIGSTOP-equivalent), frozen to disk, and resumed — with a dedicated UI splash during each. Steam Deck's `SDH-PauseGames` implements the SIGSTOP/SIGCONT half of this. The insight for Korri: **suspension/resumption is a lifecycle phase**, not an invisible implementation detail; surface it explicitly.

---

## Market and Competitor Signals

| Platform | How they signal launch phases | Source |
|---|---|---|
| **Steam Deck (SteamOS)** | `EDisplayStatus` drives the library badge; `LaunchAppTask_t` drives a progress modal shown by `bWaitingForUI`; `GameAction.strNumDone/strNumTotal` shows DownloadingDepots/ShaderCache progress numerically | decky-frontend-lib App.ts |
| **Decky plugins** | Subscribe to `RegisterForGameActionTaskChange` to detect shader compile or cloud sync phases; throttled via lodash for perf | SDH-PauseGames backend.ts |
| **Heroic** | UI states are ad-hoc boolean flags per-game in a global map; no typed state union; download progress from CLI stdout streaming | HeroicGamesLauncher |
| **ChimeraOS** | Uses stock Steam UI + gamescope-session; inherits SteamOS lifecycle signals transparently; no custom lifecycle layer | ChimeraOS GitHub issues |
| **Bazzite** | Extends SteamOS; adds Decky plugins for its own features but relies on the same `SteamClient` hooks | community reports |

**Key competitive gap:** none of these platforms surface **non-Steam game lifecycle phases** (e.g., RetroArch launch, Portmaster, emulator boot) with the same granularity as native Steam games. The `AppLifetimeNotification` only gives start/stop and a possibly-zero AppID for shortcuts. Custom launchers like Korri must construct their own phase signal — which is exactly what `korrid` is positioned to do via its own session protocol.

---

## Cross-Domain Analogies

### Browser tab loading states

Modern browsers (Chrome, Firefox, Safari) expose tab loading state as a deterministic sequence: `idle → loading → interactive → complete`, with sub-events for DNS, TCP, TLS, first byte, largest contentful paint. The architecture is: one "loading" phase owns the progress bar, sub-states update it without resetting it, and a separate "interactive" signal unlocks navigation before completion. 

This maps onto Korri's launch pipeline: one owning lifecycle phase (the `GameAction`), sub-tasks advance a single progress indicator, and the "process started" signal (`CreatingProcess` → `WaitingGameWindow`) unlocks UI ahead of the full ready state.

### iOS App Store install → open state machine

iOS models app state as: `waiting → downloading → installing → ready`; after tap, state progresses to `launching`. Cloud document sync is a separate phase shown in-app, not in the launcher. The launcher's responsibility ends at handing off to the process; in-app states are the app's problem.

The Korri parallel: `korrid` should own `Queued → Preparing → CloudSync → ShaderCompile → Launching → Running → Exited | Failed`. Once the game process is running, the session protocol (sessiond) takes over — the portal's lifecycle widget switches from "launch" to "session" state.

---

## Directly Applicable Patterns for Korrid / Korri Portal

### A. Subscribe to `RegisterForGameActionTaskChange` for rich phase tracking

For Steam game launches, the full sequence of `LaunchAppTask_t` values arrives via this hook. Map them to a Korri `LaunchPhase` tagged union:

```
SteamClient hook value       → Korri LaunchPhase tag
──────────────────────────── → ──────────────────────
"Starting"                   → { _tag: "Preparing" }
"SynchronizingCloud"         → { _tag: "CloudSync" }
"DownloadingDepots"          → { _tag: "Downloading", done, total }
"ProcessingShaderCache"      → { _tag: "ShaderCompile", done, total }
"CreatingProcess"            → { _tag: "Launching" }
"WaitingGameWindow"          → { _tag: "WaitingWindow" }
"Completed"                  → { _tag: "Running" }  (confirmed by AppLifetimeNotification)
"Failed"                     → { _tag: "Failed", error }
"Cancelled"                  → { _tag: "Cancelled" }
```

`GameAction.strNumDone`/`strNumTotal` feed the `done`/`total` progress fields directly.

### B. Use `AppLifetimeNotification.bRunning` as the canonical "game is alive/dead" signal

This is the most reliable signal for stop detection. Gate it against `nInstanceID` (PID) rather than appid for non-Steam shortcuts where `unAppID` is 0.

### C. `RegisterForGameActionShowError` for typed error reporting

The `error` parameter is a Steam localization token string (`#ERRORS_SomeCode`). Map it through the `EAppUpdateError` enum to a Korri error ADT case for actionable UI.

### D. Non-Steam / Portmaster / RetroArch: use `RegisterForFocusChangeEvents` + PID tracking

For non-Steam game shortcuts, track `FocusChangeEvent.focusedApp.strExeName` + `pid` to infer that the process has reached window focus. This is the equivalent of "WaitingGameWindow" resolved. Korri can emit its own `SessionReady` signal via sessiond when the PID appears in focus.

### E. `EDisplayStatus` as the portal badge source

The `AppDetails.eDisplayStatus` field is exactly what drives the Steam library badge. Expose it via the Korri library protocol so the portal can render a consistent status badge without re-deriving it from raw IPC hooks.

---

## Sources

| Source | URL | Description |
|---|---|---|
| decky-frontend-lib `App.ts` | `github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/App.ts` | Complete typed surface for SteamClient.Apps; `LaunchAppTask_t`, `EDisplayStatus`, `GameAction`, `EAppUpdateError` |
| decky-frontend-lib `GameSessions.ts` | `github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/GameSessions.ts` | `AppLifetimeNotification` with `bRunning` + PID |
| SDH-PauseGames `backend.ts` | `github.com/popsUlfr/SDH-PauseGames/blob/main/src/backend.ts` | Live plugin consuming `RegisterForGameActionStart`, `RegisterForGameActionTaskChange`, `RegisterForFocusChangeEvents`, `Router.RunningApps` |
| SDH-PauseGames `index.tsx` | `github.com/popsUlfr/SDH-PauseGames/blob/main/src/index.tsx` | React UI over the lifecycle state; `AppOverviewExt` type |
| decky-loader overview | `deepwiki.com/SteamDeckHomebrew/decky-loader` | Architecture: CEF injection, Python/TS JSON-RPC, WebSocket router, crash recovery |
| Heroic Games Launcher | `github.com/Heroic-Games-Launcher/HeroicGamesLauncher` | Electron+React launcher; cloud save sync + download queue UX prior art; counter-pattern for ad-hoc boolean state |
