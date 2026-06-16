import { readdir, readFile } from "node:fs/promises"

export interface SteamForegroundProcessInfo {
  readonly pid: number
  readonly uid?: number
  readonly cmdline: readonly string[]
}

export interface SteamForegroundProcessFilter {
  readonly appId?: string
}

export type SteamForegroundProcessScanner = () => Promise<
  readonly SteamForegroundProcessInfo[]
>
export type SteamForegroundProcessSignaler = (
  pid: number,
  signal: NodeJS.Signals,
) => void

export interface SteamForegroundCleanupLogger {
  info?: (input: unknown, message?: string) => void
  warn?: (input: unknown, message?: string) => void
}

export interface SteamForegroundCleanupOptions {
  readonly processScanner: SteamForegroundProcessScanner
  readonly signalProcess: SteamForegroundProcessSignaler
  readonly appId?: string
  readonly graceMs?: number
  readonly logger?: SteamForegroundCleanupLogger
}

export interface SteamForegroundCleanupOutcome {
  readonly targeted: readonly number[]
  readonly killed: readonly number[]
  readonly residual: readonly number[]
}

export function collectSteamForegroundProcesses(
  processes: readonly SteamForegroundProcessInfo[],
  filter: SteamForegroundProcessFilter = {},
): readonly SteamForegroundProcessInfo[] {
  return processes.filter(process => isSteamForegroundProcess(process, filter))
}

export function isSteamForegroundProcess(
  process: SteamForegroundProcessInfo,
  filter: SteamForegroundProcessFilter = {},
): boolean {
  if (filter.appId && steamAppIdFromProcess(process) !== filter.appId) {
    return false
  }

  const commandLine = commandLineForMatch(process)
  if (/\bSteamLaunch AppId=\d+\b/.test(commandLine)) return true
  if (!commandLine.includes("/var/lib/korri/steam/steamapps/common/")) {
    return false
  }
  return /\.exe(?:\s|$)/i.test(commandLine)
}

export async function cleanupSteamForegroundProcesses(
  options: SteamForegroundCleanupOptions,
): Promise<SteamForegroundCleanupOutcome> {
  const filter = options.appId ? { appId: options.appId } : {}
  const targets = collectSteamForegroundProcesses(
    await options.processScanner(),
    filter,
  )
  if (targets.length === 0) return { targeted: [], killed: [], residual: [] }

  const targetPids = new Set(targets.map(process => process.pid))
  options.logger?.info?.(
    {
      targets: targets.map(process =>
        formatSteamForegroundProcessForLog(process),
      ),
    },
    "cleaning Steam foreground processes",
  )

  for (const process of targets) {
    signalProcessSafely(options.signalProcess, process.pid, "SIGTERM")
  }

  await cleanupDelay(options.graceMs ?? 1500)

  const afterGrace = collectSteamForegroundProcesses(
    await options.processScanner(),
    filter,
  ).filter(process => targetPids.has(process.pid))

  for (const process of afterGrace) {
    signalProcessSafely(options.signalProcess, process.pid, "SIGKILL")
  }

  const residual =
    afterGrace.length === 0
      ? []
      : collectSteamForegroundProcesses(await options.processScanner(), filter)
          .filter(process => targetPids.has(process.pid))
          .map(process => process.pid)

  if (afterGrace.length > 0) {
    options.logger?.warn?.(
      { residualPids: afterGrace.map(process => process.pid) },
      "escalated Steam foreground cleanup",
    )
  }

  return {
    targeted: targets.map(process => process.pid),
    killed: afterGrace.map(process => process.pid),
    residual,
  }
}

export function steamAppIdFromProcess(
  process: SteamForegroundProcessInfo,
): string | undefined {
  const match = commandLineForMatch(process).match(
    /\bSteamLaunch AppId=(\d+)\b/,
  )
  return match?.[1]
}

export async function scanCurrentUserProcesses(): Promise<
  readonly SteamForegroundProcessInfo[]
> {
  let entries: readonly import("node:fs").Dirent[]
  try {
    entries = await readdir("/proc", { withFileTypes: true })
  } catch {
    return []
  }

  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : undefined
  const processes: SteamForegroundProcessInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    const pid = Number(entry.name)
    const [uid, cmdline] = await Promise.all([
      readProcUid(pid),
      readProcCmdline(pid),
    ])
    if (cmdline.length === 0) continue
    if (currentUid !== undefined && uid !== undefined && uid !== currentUid) {
      continue
    }
    processes.push({ pid, ...(uid !== undefined ? { uid } : {}), cmdline })
  }
  return processes
}

export function signalProcessByPid(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal)
}

export function formatSteamForegroundProcessForLog(
  process: SteamForegroundProcessInfo,
) {
  return {
    pid: process.pid,
    cmdline: process.cmdline.join(" ").slice(0, 500),
  }
}

function commandLineForMatch(process: SteamForegroundProcessInfo): string {
  return process.cmdline.join(" ")
}

async function readProcUid(pid: number): Promise<number | undefined> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8")
    const uidLine = status.split("\n").find(line => line.startsWith("Uid:"))
    const realUid = uidLine?.trim().split(/\s+/)[1]
    return realUid ? Number(realUid) : undefined
  } catch {
    return undefined
  }
}

async function readProcCmdline(pid: number): Promise<readonly string[]> {
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`, "utf8")
    return raw.split("\0").filter(Boolean)
  } catch {
    return []
  }
}

function signalProcessSafely(
  signalProcess: SteamForegroundProcessSignaler,
  pid: number,
  signal: NodeJS.Signals,
): void {
  try {
    signalProcess(pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") return
    throw error
  }
}

async function cleanupDelay(ms: number): Promise<void> {
  if (ms <= 0) {
    await Promise.resolve()
    return
  }
  await new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}
