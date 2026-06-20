import { readdir, readFile } from "node:fs/promises"

export interface SteamForegroundProcessInfo {
  readonly pid: number
  readonly ppid?: number
  readonly uid?: number
  readonly cmdline: readonly string[]
  readonly environ?: readonly string[]
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
  if (!filter.appId) {
    return processes.filter(process => isSteamForegroundProcess(process))
  }

  const roots = processes.filter(
    process => steamAppIdFromProcess(process) === filter.appId,
  )
  const descendantPids = descendantsOf(
    processes,
    roots.map(root => root.pid),
  )
  return processes.filter(process => {
    if (steamAppIdFromProcess(process) === filter.appId) return true
    return descendantPids.has(process.pid)
  })
}

export function isSteamForegroundProcess(
  process: SteamForegroundProcessInfo,
  filter: SteamForegroundProcessFilter = {},
): boolean {
  if (filter.appId) {
    return collectSteamForegroundProcesses([process], filter).length > 0
  }

  const commandLine = commandLineForMatch(process)
  if (/\bSteamLaunch AppId=\d+\b/.test(commandLine)) return true
  if (!commandLine.includes("/var/lib/korri/steam/steamapps/")) {
    return false
  }
  return (
    /\.exe(?:\s|$)/i.test(commandLine) ||
    /(?:^|[\s/])(?:FEX|FEXInterpreter|proton|pressure-vessel)(?:[\s/]|$)/i.test(
      commandLine,
    )
  )
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

  if (afterGrace.length > 0) {
    await cleanupDelay(Math.min(options.graceMs ?? 1500, 250))
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
  const commandLineMatch = commandLineForMatch(process).match(
    /\bSteamLaunch AppId=(\d+)\b/,
  )
  if (commandLineMatch?.[1]) return commandLineMatch[1]

  for (const entry of process.environ ?? []) {
    const match = entry.match(
      /^(?:SteamAppId|SteamGameId|SteamOverlayGameId)=(\d+)$/,
    )
    if (match?.[1]) return match[1]
  }
  return undefined
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
    const [uid, ppid, cmdline, environ] = await Promise.all([
      readProcUid(pid),
      readProcParentPid(pid),
      readProcCmdline(pid),
      readProcEnviron(pid),
    ])
    if (cmdline.length === 0) continue
    if (currentUid !== undefined && uid !== undefined && uid !== currentUid) {
      continue
    }
    processes.push({
      pid,
      ...(ppid !== undefined ? { ppid } : {}),
      ...(uid !== undefined ? { uid } : {}),
      cmdline,
      ...(environ.length > 0 ? { environ } : {}),
    })
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

function descendantsOf(
  processes: readonly SteamForegroundProcessInfo[],
  rootPids: readonly number[],
): ReadonlySet<number> {
  const childrenByParent = new Map<number, SteamForegroundProcessInfo[]>()
  for (const process of processes) {
    if (process.ppid === undefined) continue
    const siblings = childrenByParent.get(process.ppid) ?? []
    siblings.push(process)
    childrenByParent.set(process.ppid, siblings)
  }

  const descendants = new Set<number>()
  const pending = [...rootPids]
  while (pending.length > 0) {
    const parent = pending.shift()
    if (parent === undefined) continue
    for (const child of childrenByParent.get(parent) ?? []) {
      if (descendants.has(child.pid)) continue
      descendants.add(child.pid)
      pending.push(child.pid)
    }
  }
  return descendants
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

async function readProcParentPid(pid: number): Promise<number | undefined> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8")
    const ppidLine = status.split("\n").find(line => line.startsWith("PPid:"))
    const ppid = ppidLine?.trim().split(/\s+/)[1]
    return ppid ? Number(ppid) : undefined
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

async function readProcEnviron(pid: number): Promise<readonly string[]> {
  try {
    const raw = await readFile(`/proc/${pid}/environ`, "utf8")
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
