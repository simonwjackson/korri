---
date: 2026-06-14
topic: bandai-steam-observability-fixtures
artifact: research
backlog: 01KV3KWT98Y6W6CNXP05ZPSHH7
handoff: docs/handoffs/bandai-steam-observability-implementation-handoff-2026-06-14.md
---

# Bandai Steam Observability Fixtures

Real Steam log evidence captured from Bandai for Korri-managed Steam AppID launches. These fixtures ground the first-class Steam observer in target-device behavior rather than process-table guesses.

## Source split

| Source | Authority in this slice |
|---|---|
| `content_log.txt` | AppID state. `App Running` confirms `Running`; the same AppID state without `App Running` confirms `Stopped` only inside a correlated launch window. |
| `gameprocess_log.txt` | Steam-tracked PID lifecycle: PID added, PID removed with exit code, and running-list removal evidence. |
| `console_log.txt` | Launch task progress: `ExecCommandLine`, `LaunchApp changed task`, install-script evaluator, waiting/continues prompts, and console process evidence. |
| `shader_log.txt` | Shader/cache evidence only. It may coincide with `App Running` and must not downgrade lifecycle state. |
| `compat_log.txt`, `appinfo_log.txt`, wrapper logs | Auxiliary evidence streams for diagnostics; not lifecycle authority in this slice. |

## Captured AppIDs

| Game | AppID | Result |
|---|---:|---|
| Downwell | `360740` | Includes stale pre-launch removal lines, then a fresh launch to `Running` and `Stopped`. |
| Sonic Mania | `584400` | Shows install-script/cloud preparation, process creation, `Running`, and clean stop evidence. |
| Caveblazers | `452060` | Shows `RunningInstallScript` and `SynchronizingCloud` preparation before `Running`. |

## Key findings

- Steam emits useful progress before `App Running`; the most useful UI projection comes from `console_log.txt` task lines until `content_log.txt` confirms `App Running`.
- `content_log.txt` is the strongest AppID lifecycle source. It is safer than process scanning for deciding whether Steam considers an AppID running.
- `gameprocess_log.txt` explains the tracked process tree. Child `exit code -1` is normal during Steam/Proton teardown and must not be promoted to user-facing failure without additional failure evidence.
- Downwell produced stale removal lines from an earlier run before the fresh launch. Reducers must require a known active/correlated launch window before interpreting stop/removal lines as terminal lifecycle proof.
- Shader cache lines can arrive at the same timestamp as `App Running`; they are useful evidence but not authoritative preparation state.
- Live tailing should follow log files by name. Parent-directory watching plus stat-based inode/size/offset tracking is required to handle truncation and rotation/recreation.

## Parser fixtures

Implementation tests use sanitized, source-specific fixtures under `parser-fixtures/`. Command paths are represented with stable placeholders such as `<steam-home>` and `<korri-bin>`, and account-adjacent identifiers are redacted. The raw spike capture is intentionally not required by production parser tests.
