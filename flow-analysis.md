# Steam Observability Flow Analysis

**Date:** 2026-06-14  
**Inputs analysed:**
- `docs/handoffs/steam-observability-implementation-handoff-2026-06-14.md`
- `work/items/parking-lot/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti.md`
- `docs/research/steam-observability/bandai-2026-06-14/` (full fixture directory)
- `product/services/device/sessiond-state.ts`, `korrid.ts`, `product/apps/portal/api/server/status.rpc-handler.ts`

---

## User Flows

### Flow 1 — Happy-path game launch observed end-to-end

```
Korri requests -applaunch <appId>
        │
        ▼
console_log: ExecCommandLine … -applaunch <appId>      ← launch window opens
        │
        ├─ console_log: GameAction LaunchApp changed task → CheckShaderDepotManifest
        ├─ console_log: GameAction LaunchApp changed task → ProcessingInstallScript (or RunningInstallScript)
        ├─ console_log: Running install script evaluator for AppID …
        └─ [20+ seconds of Preparing]
                │
                ▼
        console_log: GameAction LaunchApp changed task → SynchronizingCloud
        console_log: GameAction LaunchApp changed task → SynchronizingStats
        console_log: GameAction LaunchApp changed task → ShowInterstitials
        console_log: LaunchApp waiting for user response to ShowInterstitials
        console_log: LaunchApp continues with user response "ShowInterstitials"
        console_log: GameAction LaunchApp changed task → SynchronizingControllerConfig
        console_log: GameAction LaunchApp changed task → SiteLicenseSeatCheckout
        console_log: GameAction LaunchApp changed task → DelayLaunch
        console_log: GameAction LaunchApp changed task → CreatingProcess
        console_log: LaunchApp waiting for user response to CreatingProcess
        console_log: LaunchApp continues with user response "CreatingProcess"
        console_log: [NUL-delimited exec line — /bin/sh\0-c\0…]
        console_log: Game process added : AppID <id> "…", ProcID <p1>, IP 0.0.0.0:0
        console_log: GameAction LaunchApp changed task → WaitingGameWindow
        console_log: GameAction LaunchApp changed task → Completed
                │
                ▼ (same second as Completed on Sonic/Caveblazers; ~0s after on Downwell)
        gameprocess_log: AppID <id> adding PID <p1> as a tracked process "…"
        gameprocess_log: AppID <id> adding PID <p2..pN> as a tracked process   ← no command
        gameprocess_log: SSGL: InternalUpdateClientGame …
        gameprocess_log: SSGL: change [<id>] LCT <old>->0
        content_log:    AppID <id> state changed : Fully Installed,App Running,  ← Running confirmed
        shader_log:     Setting MESA_GLSL_CACHE_DIR=…/shadercache/<id>            ← same second as Running
                │
                ▼  [game runs; may see additional PID adds (wine process, etc.)]
        gameprocess_log: AppID <id> adding PID <pN+1> as a tracked process
        console_log:    Game process updated : AppID <id> "…", ProcID <pN+1>
        console_log:    Game process updated : AppID <id> "…", ProcID <pN+2>     ← may repeat
                │
                ▼  [user or Korri stops game — all events in the same second]
        gameprocess_log: AppID <id> no longer tracking PID <pN+2>, exit code -1  ← burst
        gameprocess_log: AppID <id> no longer tracking PID <pN+1>, exit code -1
        [... all inner PIDs exit -1 ...]
        gameprocess_log: AppID <id> no longer tracking PID <p1>, exit code 0     ← wrapper exits 0
        gameprocess_log: Remove <id> from running list                            ← unmentioned in handoff
        console_log:    Game process removed: AppID <id> "…", ProcID <last>       ← only last PID
        console_log:    ThreadGetProcessExitCode: no such process <pN+2>          ← burst
        content_log:    AppID <id> state changed : Fully Installed,               ← Stopped confirmed
        shader_log:     AppID <id> exited.                                        ← same second as Stopped
        shader_log:     Finding Mesa SF caches … [shader flush lines follow]
                │
                ▼
        State: Stopped (launch window closes)
```

### Flow 2 — Same AppID relaunched after previous session's stale lines

Entry: tailer was running before game launch, so it captures preexisting lines already in the log file.

```
[tailer starts at EOF — pre-existing history is not replayed]
        │
        ▼  [observer has no active window for AppID 360740]
gameprocess_log: AppID 360740 no longer tracking PID 114897, exit code -1  ← stale
gameprocess_log: AppID 360740 no longer tracking PID … (×8)
gameprocess_log: Remove 360740 from running list
content_log:    AppID 360740 state changed : Fully Installed,               ← stale stop
console_log:    Game process removed: AppID 360740 "…", ProcID 114897
        │
        ▼  [3+ minutes of silence for AppID 360740]
        ▼  [new launch arrives — see Flow 1]
```

**Critical:** without a preceding `App Running` in the active window, stale PID-removal and stale "stopped" lines must be ignored or classified as `Observed/hint` only. If the tailer starts cold (after a Korri restart) while the game is already running, the observer will see the PID adds and App Running in the live tail — those are the anchors.

### Flow 3 — Korri/korrid restarts while game is already running

Entry: korrid process was restarted; tailer starts at EOF of all log files.

```
        │
        ▼  [tailer sees live activity only from this point]
        [no ExecCommandLine, no GameAction tasks, no PID adds seen]
        [no App Running transition — it already happened]
                │
                ▼  [game stops normally]
        gameprocess_log: AppID <id> no longer tracking PID …
        gameprocess_log: Remove <id> from running list
        content_log:    AppID <id> state changed : Fully Installed,
```

**Gap:** The observer never sees the launch start. `Stopped` arrives without a prior `Running`. The plan's acceptance criteria don't address this; the observer's snapshot will be empty or stale. Without supplemental proc-corroboration (`/proc/*/cmdline` scan for active `SteamLaunch AppId=`) the observer would report no known state even while the game is live.

### Flow 4 — Observer sees only `Stopped` without prior `Running` (launch failed mid-stream)

Example: `CheckShaderDepotManifest` times out, Steam drops the launch, and content_log never emits `App Running`.

```
console_log: GameAction LaunchApp changed task → CheckShaderDepotManifest
        [silence — no further progress for N seconds]
                │
        Stuck state inferred
                │
        ▼  [Steam eventually cancels]
content_log: AppID <id> state changed : Fully Installed,   ← appears WITHOUT prior App Running
gameprocess_log: (possibly no PID lines at all)
```

**Gap:** The `Stopped` signal from `content_log` without a prior `App Running` in the current window is ambiguous between a launch failure and a stale/preexisting stop line. The handoff says "use active AppID state" but does not specify how the reducer distinguishes "stopped before it started" from "stale preexisting stop."

---

## Gaps

### Critical

#### C1 — `console_log.txt` contains a third undocumented signal set: `Game process added/updated/removed`

The handoff assigns `gameprocess_log.txt` as the source for PID tracking. But `console_log.txt` **also** emits PID-related lines with a different format and different semantics:

```
# gameprocess_log.txt (tracks ALL child PIDs)
AppID 584400 adding PID 196491 as a tracked process "…"
AppID 584400 adding PID 196550 as a tracked process
AppID 584400 no longer tracking PID 197135, exit code -1

# console_log.txt (tracks only the "representative" game process)
Game process added : AppID 584400 "…", ProcID 196491, IP 0.0.0.0:0
Game process updated : AppID 584400 "…", ProcID 197021, IP 0.0.0.0:0
Game process updated : AppID 584400 "…", ProcID 197135, IP 0.0.0.0:0   ← same PID emitted twice
Game process removed: AppID 584400 "…", ProcID 197135                   ← only last PID, no exit code
```

Differences:
- `console_log.txt`'s `Game process removed` only fires **once per stop** (the last updated ProcID), with no exit code. It is not the full set.
- `console_log.txt`'s `Game process updated` fires for mid-session PID transitions (wine wrapper → game exe) and can repeat the same PID.
- `gameprocess_log.txt`'s `no longer tracking` fires for every individual PID with an exit code, including all inner -1 exits.

The handoff's parser and reducer treat these as the same signal. They are not. The parser unit tests and parser-fixtures must cover each format separately, and the reducer must not double-count the same PID removal from both sources.

**Why it matters:** If the reducer uses both `console_log`'s `Game process removed` and `gameprocess_log`'s `no longer tracking PID <wrapper>, exit code 0` as independent "Stopped" triggers, the state machine will race between them. Worse, `Game process removed` only carries the last ProcID, not the wrapper PID, so the exit-code information is missing from the console_log signal.

#### C2 — `LaunchApp waiting for user response` and `LaunchApp continues with user response` lines are not handled by the `launchTask` regex

Every game in the Bandai fixtures emits these interleaved with task changes:

```
GameAction [AppID 360740, ActionID 4] : LaunchApp waiting for user response to ShowInterstitials ""
GameAction [AppID 360740, ActionID 4] : LaunchApp continues with user response "ShowInterstitials"
GameAction [AppID 360740, ActionID 4] : LaunchApp waiting for user response to CreatingProcess ""
GameAction [AppID 360740, ActionID 4] : LaunchApp continues with user response "CreatingProcess"
```

The handoff's `launchTask` regex matches only `LaunchApp changed task to <task>`. These `waiting`/`continues` lines will fall through as unrecognized. If the parser throws on unrecognized lines instead of returning `raw-log-line`, these lines will crash the parser.

More importantly, `LaunchApp waiting for user response to CreatingProcess` and no subsequent `continues` is a plausible stuck vector — Steam may be blocked waiting for OS process creation. The handoff's Stuck detection doesn't flag this case.

**Default assumption if unaddressed:** Parser treats them as raw lines and skips. But the Stuck detection threshold misses a meaningful signal.

#### C3 — `gameprocess_log.txt` contains non-PID lines the parser regexes will not match

The full `gameprocess_log.txt.tail` shows interleaved lines that neither parser regex covers:

```
AppID 360740 no longer tracking PID 114424, exit code 0
Remove 360740 from running list        ← authoritative terminal signal; not in handoff
SSGL: InternalUpdateClientGame indicates change to games list
SSGL: persona state flags
SSGL: change [584400] LCT 744828976->0
```

The `Remove <appId> from running list` line is a **definitive terminal signal** that appears after all PIDs untrack. It is more authoritative than waiting for all individual PID removals to accumulate. The handoff doesn't define it as a signal at all, so the reducer has no way to use it. If the parser emits `raw-log-line` and the reducer ignores it, the observer misses the cleanest stop confirmation in `gameprocess_log.txt`.

**Why it matters:** If the wrapper PID (exit code 0) fails to produce its `no longer tracking` line due to a parsing edge case, the observer may wait indefinitely for a clean "all PIDs removed" confirmation. `Remove <id> from running list` would catch it regardless.

#### C4 — `RunningInstallScript` task is a real preparation state but is absent from the handoff's task classification table

Caveblazers (452060) in `console_log.txt`:

```
GameAction [AppID 452060, ActionID 3] : LaunchApp changed task to RunningInstallScript with ""
```

The handoff lists `ProcessingInstallScript` (used by Downwell and Sonic Mania) as a `Preparing` hint, but does NOT list `RunningInstallScript`. A parser following the handoff exactly would emit this as `raw-log-line` / unrecognized, losing a preparation signal. These are not the same task name; both appear in the Bandai fixtures.

#### C5 — `parser-fixtures/*.txt` files mix log sources and cannot be used as source-specific test inputs

`parser-fixtures/downwell-360740.txt` concatenates lines from three different log files:
- `content_log.txt` state-change lines
- `gameprocess_log.txt` PID add/remove lines  
- `console_log.txt` task lines, `Game process added/removed` lines

The handoff proposes per-source parsers (`steam-log-signals.ts`) that each receive lines from a single file. Tests of those parsers using the mixed fixture will either silently skip most lines (if the parser is source-gated) or produce spurious matches (if the parser tries to match all formats on every line).

The handoff notes these should be split but Unit 1 is listed as "optional prep." If Unit 2 begins without splitting the fixtures, the test inputs will be wrong and tests will pass for the wrong reasons.

---

### Important

#### I1 — "Stopping" state is sub-second and likely unobservable at second-resolution timestamps

In all three Bandai games, all PID removal events and the `content_log` "no longer App Running" transition happen within the **same logged second**:

```
[14:41:57] AppID 360740 no longer tracking PID 205203, exit code -1   ← burst starts
[14:41:57] AppID 360740 no longer tracking PID 204611, exit code 0    ← burst ends
[14:41:57] Remove 360740 from running list
[14:41:57] AppID 360740 state changed : Fully Installed,              ← same second
```

With second-level log timestamps, there is no observable window where "PIDs are exiting AND App Running is still true." The plan's `Stopping` state exists in the model but has no observably distinct evidence in the fixture data. 

**Why it matters:** The reducer will transition `Running → Stopped` atomically when it processes that second's burst. If the reducer waits for "all PIDs removed then check app state," it will work. But if it uses a "PID started removing → Stopping" trigger, it fires and clears within the same log-flush window with no UI-visible duration.

**Recommendation:** Document that `Stopping` is an implementer-convenience intermediate used only to confirm the stop is in progress during the burst-processing loop, not a user-visible state with meaningful dwell time. Or eliminate it and go directly `Running → Stopped`.

#### I2 — `App Running` and first PID add coincide in the same logged second for Sonic Mania and Caveblazers

```
[14:39:02] AppID 584400 state changed : Fully Installed,App Running,  (content_log)
[14:39:02] AppID 584400 adding PID 196491 as a tracked process "…"    (gameprocess_log)
```

When the reducer processes these events (arriving in file-tail order, interleaved across two log files), it may process them in either order depending on which file's inotify event fires first. The plan's correlation rules say `content_log` `App Running` is authoritative for `Running`, but does not specify the ordering rule for same-second events across files.

**Why it matters:** If `gameprocess_log` fires first, the reducer transitions `Launching → Launching` (or `Launching → Running` via PID-add heuristic). Then `content_log` confirms `Running`. The snapshot is correct. But if the reducer checks "PID first → infer Running" before `content_log` confirms, it emits `Running` with `confidence: inferred` and then re-emits with `confidence: confirmed`. Consumers may see two rapid state changes.

**Default assumption:** Process all events within a time window before advancing state. The handoff doesn't address flush/batch semantics for same-second interleaving.

#### I3 — Shader log signals fire at the same second as `App Running`, not before it

The handoff says: *"shader cache setup → Preparing hint if active launch not running yet"*

But in the Bandai fixtures:
```
# shader_log
[14:39:02] Setting MESA_GLSL_CACHE_DIR=…/shadercache/584400   ← Sonic Mania
# content_log
[14:39:02] AppID 584400 state changed : Fully Installed,App Running,
```

Both fire at 14:39:02. The shader cache setup is **concurrent with** `App Running`, not a pre-cursor to it. Using the shader `MESA_GLSL_CACHE_DIR` line as a `Preparing` hint will produce a momentary flicker from `Launching → Preparing → Running` rather than the clean `Launching → Running`.

Additionally, `shader_log` emits `AppID 360740 exited.` at 14:38:14 — which is the **previous** Downwell session terminating, 3 minutes before the new launch. If the reducer uses `AppID <id> exited.` as a "Stopped" signal for the active window, it would erroneously mark a non-existent session as Stopped.

#### I4 — `ExecCommandLine` is the best launch window anchor, but it fires ~21 seconds before `App Running` for Downwell

```
[14:41:06] ExecCommandLine: "… -applaunch 360740"    ← launch window opens
[14:41:27] AppID 360740 state changed : Fully Installed,App Running,
```

21 seconds of preparation. The Stuck threshold must be set well above 21 seconds or Downwell will falsely enter Stuck state on every normal launch. The handoff says "no progress for a threshold" but doesn't specify the value or whether it's configurable.

**Stakes:** Set too low → false Stuck on install-script-heavy launches. Set too high → real hangs are invisible for too long.

**Default assumption:** 60 seconds is a reasonable starting point based on the fixtures (21s is the longest observed preparation). Must be configurable.

#### I5 — `ExecCommandLine` anchor is unreliable when the tailer starts mid-launch or after a korrid restart

The tailer starts at EOF. If a game was already launching when korrid starts (or restarts), `ExecCommandLine` has already been written. The observer will miss the launch window anchor.

The handoff lists three possible launch window anchors:
1. Korri requests launch
2. `ExecCommandLine … -applaunch <appid>` in console_log
3. First `GameAction [AppID] LaunchApp` in console_log

If the tailer starts after all three, `App Running` alone is the first signal seen. The observer would see `App Running` without any prior `Launching` phase, which is valid data but means the `Preparing → Launching → Running` progression is lost.

**Gap:** No recovery path is specified. Should a cold-start observer check running processes via `/proc/*/cmdline` (mentioned in brief but not in handoff) to bootstrap state?

#### I6 — ActionID is a monotonically increasing per-Steam-client counter, not stable across Korri restarts

Bandai fixtures: Sonic Mania = ActionID 2, Caveblazers = ActionID 3, Downwell second launch = ActionID 4. After a Steam restart, ActionID resets. After a Korri restart with Steam already running, the next ActionID continues wherever Steam left off.

The reducer snapshot uses `appId` as the correlation key. But if Steam launches AppID 360740 twice in a row (rapid re-launch), the second launch gets a new ActionID. The reducer's `evidence[]` would accumulate events from both ActionIDs under the same `appId` key unless a launch window boundary (or ActionID change) is detected.

**Gap:** The plan does not specify what triggers a launch window close beyond "all PIDs removed + app state not running." If the game crashes and is immediately relaunched by Steam, does the observer correctly reset the window?

#### I7 — `console_log.txt` is significantly noisier than the handoff implies; raw noise lines must not contaminate bounded evidence

The real `console_log.txt` during a single launch (Sonic Mania) contains:
- ~30 `Binding "CHANGE_PRESET" referenced invalid set #2/#3` warnings
- `Controller slots reset`, `Created virtual controller`, `Destroyed virtual controller`
- `Warning: failed to set thread priority`
- `Loaded Config for Local Selection Path for App ID 584400, Controller…`
- `ThreadGetProcessExitCode: no such process <pid>` (×8 on stop)
- A NUL-delimited raw exec line: `[timestamp] /bin/sh\0-c\0/run/current-system/sw/bin/bash…`

The handoff's `evidence: readonly SteamObservationEvent[]` in the snapshot does not specify a maximum cardinality. If `evidence` accumulates all `raw-log-line` noise from `console_log`, a 30-second game session generates hundreds of noise entries. The "bounded recent evidence" mentioned in the tailer requirements has no specified limit.

**Stakes:** Memory growth; UI payload bloat if evidence is serialized in `app.steam.status` responses.

#### I8 — `SynchronizingCloud` task is present in two games but absent from the handoff's Preparing task list

Sonic Mania console_log:
```
GameAction [AppID 584400, ActionID 2] : LaunchApp changed task to SynchronizingCloud with ""
```

Caveblazers console_log:
```
GameAction [AppID 452060, ActionID 3] : LaunchApp changed task to SynchronizingCloud with ""
```

The handoff's preparation task list (`CheckShaderDepotManifest`, `ProcessingInstallScript`, `SynchronizingStats`, `ShowInterstitials`, `SynchronizingControllerConfig`, `SiteLicenseSeatCheckout`, `DelayLaunch`) omits `SynchronizingCloud` and `RunningInstallScript`. Both are present in the Bandai fixtures. A parser written to the handoff's list will emit these as `raw-log-line` rather than `Preparing` state signals.

#### I9 — `app.steam.status` integration with existing `app.server.status` is unspecified

The codebase already has a fully defined `app.server.status` RPC tag handled by `status.rpc-handler.ts` and consumed by `platform-bridge.ts`, `korri-control-rpc.ts`, and `remote-stream-client.ts`. Multiple consumers poll it for foreground session state.

The handoff proposes a new `app.steam.status` tag but does not specify:
- Which RPC group it belongs to (the server group already in `rpc-server.ts`?)
- Whether it's a new first-class tag or a sub-field added to the existing `app.server.status` response
- How it's registered, typed via Effect Schema, and version-gated for clients that don't know about it

**Stakes:** If `app.steam.status` is a new separate tag, consumers must be updated. If it's a field added to `app.server.status`, the schema change may break existing consumers that validate the response shape. The handoff leaves this as "status/RPC surface" without anchoring it to the existing pattern.

#### I10 — The NUL-delimited exec line in `console_log.txt` embeds `\0` characters as literal text

Every game launch emits this in `console_log.txt`:
```
[timestamp] /bin/sh\0-c\0/run/current-system/sw/bin/bash /var/lib/korri/bin/korri-steam-gamescope-launch --appid 584400 …
```

The `\0` sequences are encoded as the two-character string `\0` in the log file (the log escapes the actual NUL). This line is multi-sentence — it contains the entire launch command. If the parser tries to extract an AppID or a task name from it, it needs to know this line exists and has a different structure. If the parser matches it by line format, it will not match any current regex and should fall through as raw.

**Gap:** This line is not mentioned in the handoff at all. If the parser throws on unrecognized lines instead of gracefully returning `raw-log-line`, this line will crash the parser for every launch.

---

### Minor

#### M1 — `Game process updated` in `console_log.txt` fires for the same ProcID twice for Sonic Mania

```
[14:39:22] Game process updated : AppID 584400 "…", ProcID 197135, IP 0.0.0.0:0
[14:39:22] Game process updated : AppID 584400 "…", ProcID 197135, IP 0.0.0.0:0  ← duplicate
```

A de-duplication check is needed if `Game process updated` drives any state transition or populates `trackedPids`.

#### M2 — Tailer outer timestamp vs. Steam inner log timestamp differ by up to 1 second

The `*.tail` fixture files show that the tailer adds a wall-clock prefix:
```
2026-06-14T14:38:42-04:00 [console_log.txt] [2026-06-14 14:38:41] GameAction …
```

Outer: `14:38:42`, inner: `14:38:41`. When correlating events across `content_log`, `gameprocess_log`, and `console_log` using timestamps, the 1-second skew between tailer-read-time and Steam-log-time means events that Steam considers same-second may appear as different seconds in the tailer output. 

The `observedAt` field in `SteamObservationEvent` should be defined to use the **inner Steam timestamp** for correlation, with the tailer's wall-clock time available only as metadata.

#### M3 — `shader_log.txt` post-session flush is lengthy and may persist for seconds after `Stopped`

After each game stops, `shader_log.txt` emits many lines about shader cache processing, FOZ cache crawling, and upload (varying from ~5 to ~25 lines depending on game). These arrive in the same second as `Stopped`. If `evidence` accumulates these, the "last signal at" timestamp stays current while the game is already stopped, which could make the Stuck detector fire incorrectly for a brief window after stop.

#### M4 — The `sequence` field in `SteamObservationEvent` is not specified

The proposed event shape includes `sequence: number` but there is no specification for how it is assigned. Options include:
- Global monotonically increasing counter (reset on korrid restart)
- Per-file line counter
- Wall-clock ordered sequence across all files

Without a defined sequencing rule, the reducer cannot deterministically order same-timestamp events across files for playback or diagnostics.

#### M5 — `notes.md` in the fixture directory is empty

`docs/research/steam-observability/bandai-2026-06-14/notes.md` contains only blank table cells. The handoff says "fill the README summary" as Unit 1, but the `notes.md` has the same empty-table problem. If a future implementer reads the spike directory without the handoff, they will find no synthesized findings.

#### M6 — Proton log and Steam Linux Runtime log fixtures do not exist

The backlog acceptance criterion includes: *"Optionally detect Steam Linux Runtime / pressure-vessel logs … and attach discovered `slr-app<appid>-*.log` paths."* The Bandai fixture directory has no `slr-app*` or `steam-<appid>.log` samples. The parser and tailer for these sources have no evidence base for first-slice implementation.

**Recommendation:** Explicitly defer these to a future slice; do not include them in Unit 2–4 acceptance criteria without first capturing fixtures.

---

## Questions

**Q1 (Critical — blocks parser implementation):**  
Should the `console_log.txt` parser handle `Game process added / Game process updated / Game process removed` as explicit signals (separate from `gameprocess_log.txt` equivalents), or should `console_log.txt` parsing be limited to `GameAction / ExecCommandLine / Running install script` lines and leave all PID lifecycle to `gameprocess_log.txt`?

*Stakes:* If both sources are parsed for PID lifecycle, the reducer double-counts PID events and the "Stopped" trigger races. If `console_log.txt` PID lines are skipped, the `Game process updated` transition (which tracks which PID represents the live game) is lost entirely.

*Default assumption:* Parse `console_log.txt` PID lines only for `Game process added` (to get the initial ProcID with command) and `Game process removed` (to cross-confirm stop, without exit code). Let `gameprocess_log.txt` own the full PID lifecycle. Emit both as distinct signals with different `signal` values so the reducer can weight them correctly.

---

**Q2 (Critical — blocks reducer design):**  
What is the Stuck detection threshold in seconds, and is it configurable via the service interface?

*Stakes:* Downwell's install-script preparation takes 21 seconds between `ExecCommandLine` and `App Running`. A threshold ≤20s would falsely mark every Downwell launch as Stuck. A threshold too high (e.g. 300s) makes real freezes invisible for 5 minutes.

*Default assumption:* 60 seconds, configurable. Reset the clock on every recognized signal (task change, PID add, app state change). Stuck fires only if no signal arrives within the threshold after the launch window opened.

---

**Q3 (Critical — blocks Unit 4 reducer):**  
When the tailer starts (or restarts) while a game is already running, and the first signal seen is PID removals + `Stopped` without a prior `App Running`, what should the observer report?

*Stakes:* If the observer reports `Stopped` from a cold start, it transitions `undefined → Stopped` with no prior `Running`. Is that a valid terminal state? Does it trigger any sessiond or UI behavior that expects a preceding `Running` transition?

*Default assumption:* Emit `Stopped` with `confidence: inferred` (no prior `Running` in this session) and include the raw stop evidence. Do not infer that a game had been running.

---

**Q4 (Critical — blocks Unit 5 RPC surface):**  
Should `app.steam.status` be a new independent RPC tag registered alongside the existing server group, or a new field (`steam?: SteamObservationSnapshot`) added to the existing `app.server.status` response?

*Stakes:* A separate tag requires all clients to learn a new RPC endpoint, adds schema registration, and separates polling. A new optional field on `app.server.status` reaches existing pollers without changes, but adds payload to a high-frequency status response and may break clients with strict schema validation.

*Default assumption:* Add as an optional `steam?` field in `app.server.status` for the first slice. Promotes to its own tag only if polling frequency or payload size becomes a problem.

---

**Q5 (Important — blocks parser tests):**  
Should the parser-fixtures be split by log source before Unit 2 begins, or should the parser tests load from the existing mixed-source `parser-fixtures/downwell-360740.txt` files?

*Stakes:* Mixed-source fixtures test a format that doesn't exist in production (a single stream of all log types). Per-source fixtures correctly test each parser against only the lines it will actually receive.

*Default assumption:* Split by source as part of Unit 1 before writing any Unit 2 parsers.

---

**Q6 (Important — blocks reducer correctness):**  
What is the authoritative ordering rule when `content_log` `App Running` and `gameprocess_log` first PID add arrive in the same logged second across different files?

*Stakes:* Without ordering, the reducer is non-deterministic when replaying fixtures, and the `sequence` field in events has no defined meaning across files.

*Default assumption:* Use the Steam-embedded log timestamp (`[YYYY-MM-DD HH:MM:SS]`) as the primary sort key. For same-timestamp events across files, process in fixed source priority order: `content_log` → `gameprocess_log` → `console_log` → `shader_log`. Document this as the reducer's tie-breaking rule.

---

**Q7 (Important — blocks Stuck implementation):**  
Should `LaunchApp waiting for user response to CreatingProcess` with no subsequent `continues` be treated as a distinct Stuck signal, or should it fall through to the general silence-based Stuck detection?

*Stakes:* `CreatingProcess` is the last task before the game process spawns. A hang here (OS-level fork failure, resource exhaustion) is meaningfully different from a shader cache hang. If the parser emits it as a recognized `steam-launch-task` signal, the Stuck detector sees activity until the hang starts. If it's emitted as `raw-log-line`, the detector sees silence from the last task change.

*Default assumption:* Parse `LaunchApp waiting for user response` as a recognized signal (`steam-launch-task` or a new `steam-launch-task-waiting` signal type). This keeps the Stuck clock alive during the wait phase and produces a more specific Stuck message ("waiting for CreatingProcess" vs "no progress since CheckShaderDepotManifest").

---

**Q8 (Important — affects memory and API payload):**  
What is the maximum cardinality of `evidence[]` in the snapshot, and which event types are eligible for inclusion?

*Stakes:* `console_log.txt` emits 30+ noise lines per launch (controller warnings, thread priority failures). Keeping all of them in `evidence[]` inflates the snapshot with zero-diagnostic-value data.

*Default assumption:* Keep at most 50 events per snapshot, biased toward lifecycle signals. Exclude `raw-log-line` events with known noise patterns (e.g., `Binding "CHANGE_PRESET"`, `ThreadGetProcessExitCode`) from `evidence[]`. They can increment a `noiseLinesSkipped` counter instead.

---

**Q9 (Minor — affects test design):**  
Should `Remove <appId> from running list` in `gameprocess_log.txt` be promoted to a first-class signal (`steam-running-list-removed`), or treated as raw evidence?

*Stakes:* This is the cleanest terminal signal from `gameprocess_log`. If treated as raw, the reducer must infer stop from "all PIDs removed." If it's first-class, the reducer has an explicit stop confirmation even if some PID removal lines are missed.

*Default assumption:* Promote to `steam-tracked-pid-list-removed` signal, confidence `confirmed`. It should be in the parser fixture split.

---

**Q10 (Minor — affects future generalization):**  
Should the tailer watch the parent log directory (`/var/lib/korri/steam/logs`) and discover new files matching `korri-steam-gamescope-launch-*.log` automatically, or only watch a fixed named-file list?

*Stakes:* AppID-specific wrapper logs appear only after a launch. The log directory already has 50+ files of varying relevance. A fixed list misses new AppID logs; a directory watch must filter by pattern.

*Default assumption:* Use the fixed named-file list for the first slice. Add directory-pattern watching for `korri-steam-gamescope-launch-*.log` as a subsequent enhancement.

---

## Recommended Next Steps

These are ordered by the dependencies they unblock. Do not begin Unit 2 parsers without completing items 1 and 2.

**Before coding:**

1. **Answer Q4 (RPC surface)** before writing any type signatures. If `app.steam.status` is a separate tag, the Effect Schema must be registered in `rpc-server.ts` from the start. If it's a field on `app.server.status`, the schema and handler change must coordinate with existing consumers.

2. **Split the mixed parser-fixtures into per-source files** (Unit 1). The current `parser-fixtures/downwell-360740.txt` mixes three log sources. Run splits now:
   - `parser-fixtures/content-log-downwell.txt` (state changed lines)
   - `parser-fixtures/gameprocess-log-downwell.txt` (adding PID / no longer tracking / Remove from running list)
   - `parser-fixtures/console-log-downwell.txt` (GameAction, ExecCommandLine, Game process added/updated/removed)
   Similarly for Sonic Mania and Caveblazers.

3. **Answer Q1 (console_log PID signal scope)** before writing the `console_log` parser. This determines whether the parser must handle `Game process added/updated/removed` or skip them.

4. **Answer Q2 (Stuck threshold)** before Unit 4. The reducer cannot be complete without a defined timeout.

**During Unit 2 (parsers):**

5. Add these patterns to the `console_log` parser in addition to the handoff's `launchTask` and `installScript` regexes:
   - `LaunchApp waiting for user response to <context>` — new signal `steam-launch-task-waiting`
   - `LaunchApp continues with user response "<context>"` — new signal `steam-launch-task-continued`
   - `Game process added : AppID <id> "…", ProcID <p>, IP <ip>` — if Q1 answer includes it
   - `Game process updated : AppID <id> "…", ProcID <p>, IP <ip>` — if Q1 answer includes it
   - `Game process removed: AppID <id> "…", ProcID <p>` — if Q1 answer includes it
   - NUL-delimited exec line (`/bin/sh\0-c\0…`) — fall through as raw without throw

6. Add these to the `gameprocess_log` parser:
   - `Remove <appId> from running list` → `steam-tracked-pid-list-removed` (addresses Q9)
   - `SSGL: …` lines → fall through as raw without throw
   - `SSGL: change [<id>] LCT <old>-><new>` → fall through as raw without throw

7. Extend the task classification list to include `RunningInstallScript` and `SynchronizingCloud` as `Preparing` signals (addresses C4, I8).

**During Unit 4 (reducer):**

8. Define the cross-source ordering rule for same-second events (addresses Q6). Codify it as a named constant or policy in the reducer module.

9. Define what `Stopping` means given sub-second observability (addresses I1). If it maps to "PID burst started but `App Running` not yet cleared," it should be emitted only if the reducer processes `gameprocess_log` PID removals before processing `content_log` state change in the same second. Document this explicitly.

10. Define the `evidence[]` cardinality cap and filtering policy before writing the snapshot reducer (addresses Q8/I7).

**During Unit 5 (RPC surface):**

11. If `app.steam.status` is its own tag, add a test that verifies the handler returns a well-formed response when no game is running (empty/idle state) and when a game is running (active snapshot). Mirror the pattern in `status.rpc-handler.test.ts` for consistency with existing test coverage.

12. Explicitly document that `shader_log` `MESA_GLSL_CACHE_DIR` fires simultaneously with `App Running`, not before it (corrects the handoff's "Preparing hint" framing). Update the reducer projection rules comment.

---

## Summary Table

| # | Severity | Description | Blocks |
|---|---|---|---|
| C1 | Critical | `console_log` has `Game process added/updated/removed` — different format from `gameprocess_log`; plan treats them as same | Unit 2 parser + Unit 4 reducer |
| C2 | Critical | `LaunchApp waiting/continues` lines unhandled; plausible Stuck vector at `CreatingProcess` | Unit 2 parser + Stuck detection |
| C3 | Critical | `Remove <appId> from running list` in `gameprocess_log` is the cleanest stop signal but absent from handoff | Unit 4 reducer |
| C4 | Critical | `RunningInstallScript` task present in Caveblazers fixtures but not in handoff's task list | Unit 2 parser correctness |
| C5 | Critical | Mixed-source `parser-fixtures/*.txt` cannot correctly drive per-source parser unit tests | Unit 2 tests |
| I1 | Important | `Stopping` state is sub-second; no observably distinct window in fixtures | Reducer state machine |
| I2 | Important | `App Running` and first PID add are same-second across files; ordering undefined | Reducer cross-source ordering |
| I3 | Important | `MESA_GLSL_CACHE_DIR` fires at same time as `App Running`, not before; handoff projection is wrong | Reducer projection rules |
| I4 | Important | Stuck threshold unspecified; Downwell needs >21s | Unit 4 acceptance criteria |
| I5 | Important | `ExecCommandLine` anchor missed if tailer starts mid-launch (Korri restart scenario) | Cold-start recovery |
| I6 | Important | Same-AppID rapid relaunch reuses appId key without ActionID-boundary reset | Reducer window management |
| I7 | Important | `console_log` noise volume not bounded in `evidence[]` | API payload size |
| I8 | Important | `SynchronizingCloud` task missing from Preparing classification | Unit 2 parser |
| I9 | Important | `app.steam.status` RPC surface not anchored to existing `rpc-server.ts` patterns | Unit 5 design |
| I10 | Important | NUL-delimited exec line in `console_log` unmentioned; must not throw | Unit 2 parser robustness |
| M1 | Minor | `Game process updated` emits duplicate ProcID for same PID in Sonic Mania | Dedup in reducer |
| M2 | Minor | Tailer outer timestamp vs. Steam inner timestamp differ by 1s; `observedAt` source undefined | Correlation accuracy |
| M3 | Minor | Shader flush lines after stop extend "last signal at" past actual stop | Stuck false-positive after stop |
| M4 | Minor | `sequence` field assignment strategy not defined | Event ordering across files |
| M5 | Minor | `notes.md` is empty; spike findings not synthesized | Future reference |
| M6 | Minor | No Proton/SLR log fixtures captured; acceptance criteria include them | Should be deferred |
