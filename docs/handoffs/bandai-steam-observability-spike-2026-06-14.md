---
date: 2026-06-14
topic: bandai-steam-observability-spike
artifact: handoff
backlog: 01KV3KWT98Y6W6CNXP05ZPSHH7
briefing: docs/briefs/2026-06-14-steam-observability-brief.md
---

# Bandai Steam Observability Spike Handoff

## Purpose

Validate Steam-native launch observability on Bandai before implementing the first-class Steam observer. The goal is to capture real Bandai Steam log fixtures and prove which Steam log lines can drive UI/status state such as "Steam accepted launch," "Steam is preparing," "Steam reports AppID running," "Steam is stopping," and "Steam stopped."

This is **not** a Gamescope/MangoHud/screenshot spike. Focus on Steam itself.

## Background

The web research and planning brief are in:

- `docs/briefs/2026-06-14-steam-observability-brief.md`
- backlog item: `work/items/parking-lot/01KV3KWT98Y6W6CNXP05ZPSHH7-capture-steam-launch-diagnostics-as-first-class-session-arti.md`

Research suggests the strongest passive Steam lifecycle source is `content_log.txt`, with expected lines like:

```text
Game <appid> adding PID <pid> as a tracked process ... SteamLaunch AppId=<appid> ...
AppID <appid> state changed : ...,App Running,
Game <appid> no longer tracking PID <pid>, exit code <n>
AppID <appid> state changed : Fully Installed,
```

Bandai may differ from public examples, so capture real fixtures before hardening parser behavior.

## Constraints / Safety

- Prefer read-only observation except for launching/stopping known games.
- Do not run raw Steam directly.
- Do not run Steam/AppID helpers as root or with hand-crafted root/HOME environment.
- Use Korri-managed Steam launch surfaces:
  - preferred: `app.library.launch` / Korri app entries;
  - acceptable for isolated Steam-log spike: `/run/current-system/sw/bin/korri-steam-app <appid>` as the Korri service/user environment.
- If any VDF writes are needed, close Steam first. This spike should not need new VDF writes beyond existing `korri-steam-app` repair behavior.
- Keep warm Steam alive if possible; stop foreground games between trials.
- Do not use Stray. Use small known Bandai AppIDs.
- Save raw logs locally; redact before sharing externally. Steam logs can contain usernames, paths, command lines, and account-adjacent state.

## Known Bandai Context

Current/productized branch at time of handoff:

- worktree: `.worktrees/feat/steam-ts-planner-handoff`
- current Bandai build previously switched to productized Steam wrapper.
- Steam home/root: `/var/lib/korri/steam`
- expected log dir: `/var/lib/korri/steam/logs`
- known usable Steam account localconfig: `/var/lib/korri/steam/userdata/80924811/config/localconfig.vdf`

Known small test AppIDs:

- Downwell: `360740`
- Sonic Mania: `584400`
- Caveblazers: `452060`
- 30XX: `1029210` — optional repeat only if needed; not required for this spike.

## Spike Questions

Answer these with evidence:

1. Does Bandai's `content_log.txt` emit AppID/PID/running/stopped lines for Korri AppID launches?
2. Which exact files update during launch/stop?
3. Are line formats stable across two or three AppIDs?
4. How quickly does `content_log.txt` update relative to launch request and game stop?
5. Does Steam emit useful preparation signals for shader/content/install/runtime work before `App Running`?
6. Does log rotation/truncation happen while Steam is warm, or only across Steam restarts?
7. Can we infer `Preparing`, `Launching`, `Running`, `Stopping`, `Stopped`, and `Stuck` from Steam-only signals with reasonable confidence?
8. What raw fixtures should become parser tests?

## Desired Output Artifacts

Create a local research directory, e.g.:

```text
docs/research/steam-observability/bandai-2026-06-14/
```

Include:

```text
README.md                         # summary and answers to spike questions
logs-before.txt                   # ls/stat snapshot of Steam log dir before trials
logs-after.txt                    # ls/stat snapshot after trials
content-log-downwell.txt          # sliced raw lines around launch/stop
content-log-sonic-mania.txt       # sliced raw lines around launch/stop
content-log-caveblazers.txt       # sliced raw lines around launch/stop
console-log-*.txt                 # optional relevant slices
compat-log-*.txt                  # optional relevant slices
shader-log-*.txt                  # optional relevant slices
parser-fixtures/*.txt             # minimal fixture snippets for tests
notes.md                          # caveats, surprises, exact commands used
```

If you do not want to commit bulky raw logs, keep full logs under `/tmp` and commit only minimal parser fixtures plus the summary.

## Suggested Procedure

### 0. Preflight

From the repo/worktree, verify access to Bandai and the current system package paths if needed.

Useful read-only checks on Bandai:

```sh
id
whoami
ls -la /var/lib/korri/steam/logs
stat /var/lib/korri/steam/logs/content_log.txt || true
pgrep -af 'steam|korri-steam|reaper|SteamLaunch' || true
```

If SSHing as root, switch to the Korri runtime user for Steam file/process observations rather than launching Steam as root.

### 1. Snapshot log directory

Capture file names, sizes, inodes, and mtimes:

```sh
logdir=/var/lib/korri/steam/logs
find "$logdir" -maxdepth 1 -type f -printf '%f\t%s\t%T@\t%i\n' | sort
```

Candidate files to watch:

```text
content_log.txt
console_log.txt
compat_log.txt
appinfo_log.txt
shader_log.txt
steam_api_log.txt
steamwebhelper.log
korri-steam-app-guest.log
korri-steam-gamescope-launch-<appid>.log
```

### 2. Start a passive log watcher

Use either `tail -F` or a small script. For the spike, simple `tail -F` is fine as long as you record file name prefixes.

Example:

```sh
logdir=/var/lib/korri/steam/logs
mkdir -p /tmp/korri-steam-observe
for f in content_log.txt console_log.txt compat_log.txt appinfo_log.txt shader_log.txt steam_api_log.txt; do
  [ -e "$logdir/$f" ] || continue
  (stdbuf -oL tail -n 0 -F "$logdir/$f" | sed -u "s|^|$(date -Is) [$f] |") \
    > "/tmp/korri-steam-observe/$f.tail" 2>&1 &
done
jobs -p > /tmp/korri-steam-observe/tail-pids
```

Caveat: the `date -Is` in that example is evaluated once by the shell, not per line. If per-line timestamps matter, use `awk '{ print strftime("%Y-%m-%dT%H:%M:%S%z"), $0; fflush(); }'` instead.

### 3. Launch one AppID through Korri

Preferred path is through Korri's library/session launch so the launch resembles product behavior. If the goal is only to isolate Steam log lines, direct `korri-steam-app <appid>` as the Korri user is acceptable.

Do **not** use raw `steam.sh`, raw `steamrtarm64/steam`, or root.

Example isolated launch command shape on Bandai:

```sh
/run/current-system/sw/bin/korri-steam-app 360740
```

Expected trials:

1. Downwell `360740`
2. Sonic Mania `584400`
3. Caveblazers `452060`

For each trial:

- record command and timestamp;
- wait for Steam/game to reach running or timeout;
- stop the foreground game cleanly before next trial;
- snapshot relevant processes;
- slice log lines around the trial window.

### 4. Stop foreground game between trials

Use the existing Korri/session stop path if sessiond owns the launch. If the isolated direct helper path was used and sessiond did not own it, stop the game/foreground tree using the established Korri Steam cleanup path, not arbitrary root-kill first.

Record exactly which stop mechanism was used, because stop-path choice affects observed Steam log lines.

### 5. Extract minimal fixtures

For each AppID, extract a small contiguous window from `content_log.txt` containing:

- launch request / SteamLaunch line if present;
- tracked PID added lines;
- `App Running` state;
- tracked PID removed lines;
- stopped / App Running removed line.

Also capture any content/shader/install-script activity before `App Running`.

## Parser Pattern Candidates

Start with permissive regexes and preserve raw lines:

```ts
const trackedPidAdded = /Game\s+(\d+)\s+adding PID\s+(\d+)\s+as a tracked process/
const appRunning = /AppID\s+(\d+)\s+state changed\s*:\s*(.*\bApp Running\b.*)/
const trackedPidRemoved = /Game\s+(\d+)\s+no longer tracking PID\s+(\d+),\s+exit code\s+(-?\d+)/
const appStopped = /AppID\s+(\d+)\s+state changed\s*:\s*(?!.*\bApp Running\b)(.*)/
```

Do not assume `Fully Installed,` is the only stopped state until Bandai fixtures confirm it.

## Proposed Observation Mapping To Validate

```text
tracked PID added
  → state=Launching, signal=steam-tracked-pid-added, confidence=confirmed-from-steam-log

App Running present
  → state=Running, signal=steam-app-state, confidence=confirmed-from-steam-log

tracked PID removed
  → state=Stopping or Running-with-child-exited, signal=steam-tracked-pid-removed

App Running no longer present for active AppID
  → state=Stopped, signal=steam-app-state

shader/content/compat activity but no App Running yet
  → state=Preparing, signal=steam-content/shader/compat-activity, confidence=hint

no new Steam signal for threshold after launch request
  → state=Stuck, confidence=inferred, include last raw Steam evidence
```

## Success Criteria

The spike is successful when it produces:

- at least two Bandai AppID launch/stop `content_log.txt` fixture slices;
- a short summary of exact observed line formats;
- a recommendation for first implementation parser scope;
- a list of Steam logs worth tailing by default on Bandai;
- clear caveats where Steam did not emit enough signal;
- no persistent device config changes beyond normal game launch side effects.

## If Things Go Sideways

- If `content_log.txt` does not update, inspect `console_log.txt`, `compat_log.txt`, and `korri-steam-app-guest.log` for AppID lines.
- If Steam is not running/warm, start it via the existing Korri service/helper path, not raw Steam.
- If a game launches but no AppID state appears, inspect `/proc/*/cmdline` for `SteamLaunch AppId=<appid>` and record this as a fallback signal candidate.
- If logs are missing or unreadable as Korri, record ownership/mode and stop; do not chmod/chown as part of the spike unless separately approved.

## Follow-Up Implementation Work

After the spike, implement from the fixtures:

1. `SteamLogTailer` with tail-by-name semantics.
2. `SteamContentLogParser` with fixture tests from Bandai.
3. `SteamLaunchObserver` maintaining per-AppID active/latest state.
4. Read-only status/RPC surface for active/latest Steam observation.
5. UI projection: "Steam is preparing / launching / running / stopping / stuck".
