# Bandai Steam Observability Spike Notes

## Log directory

Bandai Steam logs were observed under:

```text
/var/lib/korri/steam/logs
```

The observer should resolve this as the default Korri-managed Steam log root while leaving a seam for alternate Steam homes.

## Timeline summary

| Time | AppID | Source | Observation |
|---|---:|---|---|
| 14:38:14 | 360740 | content/gameprocess/console | Stale Downwell stop/removal evidence from a previous run appeared before the fresh launch window. |
| 14:38:41 | 584400 | console | Sonic Mania launch request and shader/install-script preparation began. |
| 14:39:02 | 584400 | content/gameprocess | `App Running` and first tracked PID arrived. |
| 14:39:35 | 584400 | content/gameprocess/shader | `App Running` left, tracked PIDs were removed, and shader exit evidence arrived. |
| 14:40:05 | 452060 | console | Caveblazers launch preparation began. |
| 14:40:07 | 452060 | content/gameprocess | `App Running` and first tracked PID arrived. |
| 14:40:35 | 452060 | content/gameprocess/shader | Caveblazers stopped with normal tracked PID teardown. |
| 14:41:06 | 360740 | console | Fresh Downwell launch preparation began. |
| 14:41:27 | 360740 | content/gameprocess | Fresh Downwell `App Running` and tracked PID evidence arrived. |
| 14:41:57 | 360740 | content/gameprocess/shader | Fresh Downwell stopped. |

## Observed line formats

### AppID state

```text
[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,
[2026-06-14 14:39:35] AppID 584400 state changed : Fully Installed,
```

### Tracked PID lifecycle

```text
[2026-06-14 14:39:02] AppID 584400 adding PID 196491 as a tracked process "..."
[2026-06-14 14:39:03] AppID 584400 adding PID 196550 as a tracked process
[2026-06-14 14:39:35] AppID 584400 no longer tracking PID 196491, exit code 0
```

### Launch task progress

```text
[2026-06-14 14:38:41] GameAction [AppID 584400, ActionID 2] : LaunchApp changed task to ProcessingInstallScript with ""
[2026-06-14 14:39:02] GameAction [AppID 584400, ActionID 2] : LaunchApp waiting for user response to CreatingProcess ""
[2026-06-14 14:39:02] GameAction [AppID 584400, ActionID 2] : LaunchApp continues with user response "CreatingProcess"
```

### Console process evidence

```text
[2026-06-14 14:39:02] Game process added : AppID 584400 "...", ProcID 196491, IP 0.0.0.0:0
[2026-06-14 14:39:35] Game process removed: AppID 584400 "...", ProcID 197135
```

### Shader evidence

```text
[2026-06-14 14:39:02] Setting MESA_GLSL_CACHE_DIR=/var/lib/korri/steam/steamapps/shadercache/584400 MESA_DISK_CACHE_READ_ONLY_FOZ_DBS=steam_cache,steam_precompiled
[2026-06-14 14:39:35] AppID 584400 exited.
```

## Caveats

- Stale Downwell removals prove reducers cannot treat every stop/removal line as an observed lifecycle completion.
- Steam-tracked child processes often exit with `-1` during normal teardown; the root wrapper exiting `0` is more useful diagnostic context than a failure verdict.
- Same-second events from different files need deterministic ordering. Use Steam timestamp, source priority, then sequence.
- Shader/cache evidence must not move a confirmed `Running` snapshot back to `Preparing`.
