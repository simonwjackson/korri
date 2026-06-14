import { sanitizeSteamEvidenceExcerpt } from "./steam-evidence-sanitizer"

export type SteamLogSource =
  | "content_log"
  | "gameprocess_log"
  | "console_log"
  | "shader_log"
  | "compat_log"
  | "appinfo_log"
  | "guest_log"
  | "wrapper_log"
  | "auxiliary_log"

export type SteamSignalConfidence = "confirmed" | "hint" | "unknown" | "low"

export interface SteamRawLogLine {
  readonly source: SteamLogSource
  readonly logFile: string
  readonly line: string
  readonly observedAt: string
  readonly sequence: number
  readonly offset?: number
}

export interface SteamSignalEvidence {
  readonly source: SteamLogSource
  readonly logFile: string
  readonly steamTimestamp?: string
  readonly observedAt: string
  readonly sequence: number
  readonly offset?: number
  readonly excerpt: string
  readonly parser: "steam-log-signals@1"
  readonly confidence: SteamSignalConfidence
}

export type SteamLaunchProjectionHint = "Preparing" | "Launching"

export type SteamLogSignal =
  | {
      readonly _tag: "SteamAppStateChanged"
      readonly appId: string
      readonly appState: string
      readonly running: boolean
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "TrackedPidAdded"
      readonly appId: string
      readonly pid: number
      readonly commandExcerpt?: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "TrackedPidRemoved"
      readonly appId: string
      readonly pid: number
      readonly exitCode: number
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "RunningListRemoved"
      readonly appId: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "ExecCommandLine"
      readonly appId?: string
      readonly commandExcerpt: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "LaunchTaskChanged"
      readonly appId: string
      readonly actionId: string
      readonly task: string
      readonly detail: string
      readonly projection: SteamLaunchProjectionHint
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "InstallScriptProgress"
      readonly appId: string
      readonly stepCount: number
      readonly commandExcerpt?: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "LaunchUserPrompt"
      readonly appId: string
      readonly actionId: string
      readonly prompt: "waiting" | "continues"
      readonly task: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "ConsoleProcessEvidence"
      readonly action: "added" | "updated" | "removed"
      readonly appId: string
      readonly procId: number
      readonly commandExcerpt?: string
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "ShaderEvidence"
      readonly appId: string
      readonly evidenceKind: "cache-dir" | "app-exited"
      readonly evidence: SteamSignalEvidence
    }
  | {
      readonly _tag: "RawEvidence"
      readonly evidence: SteamSignalEvidence
    }

export interface ParseSteamLogTextInput {
  readonly source: SteamLogSource
  readonly logFile: string
  readonly text: string
  readonly observedAt: string
  readonly startingSequence?: number
}

const APP_STATE_RE =
  /^\[(?<ts>[^\]]+)\] AppID (?<appId>\d+) state changed : (?<state>.*)$/
const PID_ADD_RE =
  /^\[(?<ts>[^\]]+)\] AppID (?<appId>\d+) adding PID (?<pid>\d+) as a tracked process(?: "(?<command>.*)")?$/
const PID_REMOVE_RE =
  /^\[(?<ts>[^\]]+)\] AppID (?<appId>\d+) no longer tracking PID (?<pid>\d+), exit code (?<exitCode>-?\d+)$/
const RUNNING_LIST_RE =
  /^\[(?<ts>[^\]]+)\] Remove (?<appId>\d+) from running list/i
const EXEC_COMMAND_RE = /^\[(?<ts>[^\]]+)\] ExecCommandLine: (?<command>.*)$/
const LAUNCH_TASK_RE =
  /^\[(?<ts>[^\]]+)\] GameAction \[AppID (?<appId>\d+), ActionID (?<actionId>\d+)\] : LaunchApp changed task to (?<task>[^ ]+) with "(?<detail>.*)"$/
const INSTALL_SCRIPT_RE =
  /^\[(?<ts>[^\]]+)\] Running install script evaluator for AppID (?<appId>\d+), (?<steps>\d+) step\(s\)(?:\s+(?<command>.*))?$/
const PROMPT_RE =
  /^\[(?<ts>[^\]]+)\] GameAction \[AppID (?<appId>\d+), ActionID (?<actionId>\d+)\] : LaunchApp (?:(?<waiting>waiting for user response to) (?<waitingTask>[^" ]+) ""|(?<continues>continues with user response) "(?<continuesTask>[^"]+)")$/
const PROCESS_RE =
  /^\[(?<ts>[^\]]+)\] Game process (?<action>added|updated|removed) ?:\s+AppID (?<appId>\d+) (?:(?:"(?<command>.*)",\s*)?)ProcID (?<procId>\d+)/
const SHADER_CACHE_RE =
  /^.*\[(?<ts>[^\]]+)\] Setting MESA_GLSL_CACHE_DIR=.*shadercache\/(?<appId>\d+)\b/
const SHADER_EXIT_RE = /^.*\[(?<ts>[^\]]+)\] AppID (?<appId>\d+) exited\.$/
const APPLAUNCH_RE = /(?:-applaunch'?\s+'?|AppId=|--appid\s+)(?<appId>\d+)/

const PREPARING_TASKS = new Set([
  "CheckShaderDepotManifest",
  "ProcessingInstallScript",
  "RunningInstallScript",
  "SynchronizingCloud",
  "SynchronizingStats",
  "ShowInterstitials",
  "SynchronizingControllerConfig",
  "SiteLicenseSeatCheckout",
  "DelayLaunch",
])

export function parseSteamLogText(
  input: ParseSteamLogTextInput,
): SteamLogSignal[] {
  const startingSequence = input.startingSequence ?? 1
  return input.text
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map((line, index) =>
      parseSteamLogLine({
        source: input.source,
        logFile: input.logFile,
        line,
        observedAt: input.observedAt,
        sequence: startingSequence + index,
      }),
    )
}

export function parseSteamLogLine(input: SteamRawLogLine): SteamLogSignal {
  try {
    switch (input.source) {
      case "content_log":
        return parseContentLogLine(input)
      case "gameprocess_log":
        return parseGameprocessLogLine(input)
      case "console_log":
        return parseConsoleLogLine(input)
      case "shader_log":
        return parseShaderLogLine(input)
      default:
        return rawEvidence(input, "unknown")
    }
  } catch {
    return rawEvidence(input, "unknown")
  }
}

function parseContentLogLine(input: SteamRawLogLine): SteamLogSignal {
  const match = APP_STATE_RE.exec(input.line)
  if (!match?.groups) return rawEvidence(input, "unknown")
  const appState = match.groups.state ?? ""
  return {
    _tag: "SteamAppStateChanged",
    appId: match.groups.appId ?? "",
    appState,
    running: appState.includes("App Running"),
    evidence: evidence(input, match.groups.ts, "confirmed"),
  }
}

// fallow-ignore-next-line complexity
function parseGameprocessLogLine(input: SteamRawLogLine): SteamLogSignal {
  const added = PID_ADD_RE.exec(input.line)
  if (added?.groups) {
    const command = added.groups.command
    return omitUndefined({
      _tag: "TrackedPidAdded" as const,
      appId: added.groups.appId ?? "",
      pid: Number.parseInt(added.groups.pid ?? "0", 10),
      commandExcerpt: command
        ? sanitizeSteamEvidenceExcerpt(command)
        : undefined,
      evidence: evidence(input, added.groups.ts, "confirmed"),
    })
  }
  const removed = PID_REMOVE_RE.exec(input.line)
  if (removed?.groups) {
    return {
      _tag: "TrackedPidRemoved",
      appId: removed.groups.appId ?? "",
      pid: Number.parseInt(removed.groups.pid ?? "0", 10),
      exitCode: Number.parseInt(removed.groups.exitCode ?? "0", 10),
      evidence: evidence(input, removed.groups.ts, "confirmed"),
    }
  }
  const runningList = RUNNING_LIST_RE.exec(input.line)
  if (runningList?.groups) {
    return {
      _tag: "RunningListRemoved",
      appId: runningList.groups.appId ?? "",
      evidence: evidence(input, runningList.groups.ts, "confirmed"),
    }
  }
  return rawEvidence(input, "unknown")
}

// fallow-ignore-next-line complexity
function parseConsoleLogLine(input: SteamRawLogLine): SteamLogSignal {
  const exec = EXEC_COMMAND_RE.exec(input.line)
  if (exec?.groups) {
    const command = exec.groups.command ?? ""
    return omitUndefined({
      _tag: "ExecCommandLine" as const,
      appId: APPLAUNCH_RE.exec(command)?.groups?.appId,
      commandExcerpt: sanitizeSteamEvidenceExcerpt(command),
      evidence: evidence(input, exec.groups.ts, "hint"),
    })
  }
  const task = LAUNCH_TASK_RE.exec(input.line)
  if (task?.groups) {
    const taskName = task.groups.task ?? ""
    return {
      _tag: "LaunchTaskChanged",
      appId: task.groups.appId ?? "",
      actionId: task.groups.actionId ?? "",
      task: taskName,
      detail: task.groups.detail ?? "",
      projection: PREPARING_TASKS.has(taskName) ? "Preparing" : "Launching",
      evidence: evidence(input, task.groups.ts, "hint"),
    }
  }
  const install = INSTALL_SCRIPT_RE.exec(input.line)
  if (install?.groups) {
    return omitUndefined({
      _tag: "InstallScriptProgress" as const,
      appId: install.groups.appId ?? "",
      stepCount: Number.parseInt(install.groups.steps ?? "0", 10),
      commandExcerpt: install.groups.command
        ? sanitizeSteamEvidenceExcerpt(install.groups.command)
        : undefined,
      evidence: evidence(input, install.groups.ts, "hint"),
    })
  }
  const prompt = PROMPT_RE.exec(input.line)
  if (prompt?.groups) {
    return {
      _tag: "LaunchUserPrompt",
      appId: prompt.groups.appId ?? "",
      actionId: prompt.groups.actionId ?? "",
      prompt: prompt.groups.waiting ? "waiting" : "continues",
      task: prompt.groups.waitingTask ?? prompt.groups.continuesTask ?? "",
      evidence: evidence(input, prompt.groups.ts, "hint"),
    }
  }
  const process = PROCESS_RE.exec(input.line)
  if (process?.groups) {
    return omitUndefined({
      _tag: "ConsoleProcessEvidence" as const,
      action: process.groups.action as "added" | "updated" | "removed",
      appId: process.groups.appId ?? "",
      procId: Number.parseInt(process.groups.procId ?? "0", 10),
      commandExcerpt: process.groups.command
        ? sanitizeSteamEvidenceExcerpt(process.groups.command)
        : undefined,
      evidence: evidence(input, process.groups.ts, "hint"),
    })
  }
  return rawEvidence(input, "unknown")
}

function parseShaderLogLine(input: SteamRawLogLine): SteamLogSignal {
  const cache = SHADER_CACHE_RE.exec(input.line)
  if (cache?.groups) {
    return {
      _tag: "ShaderEvidence",
      appId: cache.groups.appId ?? "",
      evidenceKind: "cache-dir",
      evidence: evidence(input, cache.groups.ts, "hint"),
    }
  }
  const exited = SHADER_EXIT_RE.exec(input.line)
  if (exited?.groups) {
    return {
      _tag: "ShaderEvidence",
      appId: exited.groups.appId ?? "",
      evidenceKind: "app-exited",
      evidence: evidence(input, exited.groups.ts, "hint"),
    }
  }
  return rawEvidence(input, "unknown")
}

function rawEvidence(
  input: SteamRawLogLine,
  confidence: SteamSignalConfidence,
): SteamLogSignal {
  return {
    _tag: "RawEvidence",
    evidence: evidence(input, parseTimestamp(input.line), confidence),
  }
}

function evidence(
  input: SteamRawLogLine,
  steamTimestamp: string | undefined,
  confidence: SteamSignalConfidence,
): SteamSignalEvidence {
  return omitUndefined({
    source: input.source,
    logFile: input.logFile,
    steamTimestamp,
    observedAt: input.observedAt,
    sequence: input.sequence,
    offset: input.offset,
    excerpt: sanitizeSteamEvidenceExcerpt(input.line),
    parser: "steam-log-signals@1" as const,
    confidence,
  })
}

function parseTimestamp(line: string): string | undefined {
  const match = /^\[([^\]]+)\]/.exec(line) ?? /^.*\[([^\]]+)\]/.exec(line)
  return match?.[1]
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}
