/**
 * Process-name-accurate reaper for `gamescope-wl`, `gamescopereaper`, and `gamescope`.
 *
 * Phase 4C teardown step. Sessiond invokes this during `restoring` with
 * the managed launch's process group id (pgid). The reaper:
 *
 * 1. Lists processes (PID, pgid, ppid, comm) via an injected query.
 * 2. Identifies any `gamescope-wl` / `gamescopereaper` / `gamescope` whose pgid matches
 *    the launch's pgid OR whose parent lineage chains back into that
 *    pgid (handles children that escaped the original group).
 * 3. Signals the process group with SIGTERM, waits the grace window,
 *    and escalates to SIGKILL on the group + any residual lineage-traced
 *    PIDs.
 *
 * It deliberately never uses broad `pkill`-by-name: we only kill the
 * compositor processes that belong to this launch.
 *
 * See docs/solutions/runtime-errors/steam-manual-launch-x86-eager-xwayland-dbus-readiness-2026-05-26.md
 */

export const GAMESCOPE_PROCESS_NAMES = [
  "gamescope-wl",
  "gamescopereaper",
  "gamescope",
] as const

export type GamescopeProcessName = (typeof GAMESCOPE_PROCESS_NAMES)[number]

export interface ProcessInfo {
  readonly pid: number
  readonly pgid: number
  readonly ppid: number
  readonly comm: string
}

export interface ProcessListQuery {
  list: () => Promise<readonly ProcessInfo[]>
}

export type ReapSignal = "SIGTERM" | "SIGKILL"

export interface ProcessSignaler {
  signalGroup: (pgid: number, signal: ReapSignal) => Promise<void>
  signalProcess: (pid: number, signal: ReapSignal) => Promise<void>
}

export interface GamescopeReaperLogger {
  warn: (input: unknown, message?: string) => void
}

export interface GamescopeReaperOptions {
  readonly processList: ProcessListQuery
  readonly signaler: ProcessSignaler
  readonly logger?: GamescopeReaperLogger
  /** Milliseconds between escalation passes. Default 200. */
  readonly graceMs?: number
  /** Total escalation passes including the initial SIGTERM. Default 3. */
  readonly retries?: number
}

export interface ReapRequest {
  /** Process group id of the managed launch, or undefined if none. */
  readonly pgid: number | undefined
}

export interface ReapOutcome {
  readonly reaped: readonly number[]
  readonly residual: readonly number[]
}

export type GamescopeReaper = (request: ReapRequest) => Promise<ReapOutcome>

const DEFAULT_GRACE_MS = 200
const DEFAULT_RETRIES = 3

export function createGamescopeReaper(
  options: GamescopeReaperOptions,
): GamescopeReaper {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  const retries = options.retries ?? DEFAULT_RETRIES

  return async ({ pgid }) => {
    if (pgid === undefined) return { reaped: [], residual: [] }

    const reapedPids = new Set<number>()

    let signaled = false
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const escalate = attempt > 0
      const signal: ReapSignal = escalate ? "SIGKILL" : "SIGTERM"
      let processes: readonly ProcessInfo[]
      try {
        processes = await options.processList.list()
      } catch (error) {
        options.logger?.warn(
          { err: error },
          "sessiond-gamescope-reaper: process-list query failed",
        )
        return { reaped: [], residual: [] }
      }

      const targets = collectGamescopeTargets(processes, pgid)

      if (targets.length === 0) {
        if (!signaled) return { reaped: [], residual: [] }
        return {
          reaped: Array.from(reapedPids).sort((a, b) => a - b),
          residual: [],
        }
      }

      for (const target of targets) reapedPids.add(target.pid)

      await options.signaler.signalGroup(pgid, signal)
      for (const target of targets) {
        if (target.pgid !== pgid) {
          // Escaped the group; signal directly.
          await options.signaler.signalProcess(target.pid, signal)
        }
      }
      signaled = true

      if (graceMs > 0) await delay(graceMs)
    }

    // Final residual check.
    let residualTargets: readonly ProcessInfo[]
    try {
      const processes = await options.processList.list()
      residualTargets = collectGamescopeTargets(processes, pgid)
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "sessiond-gamescope-reaper: residual check failed",
      )
      residualTargets = []
    }

    if (residualTargets.length > 0) {
      options.logger?.warn(
        {
          pgid,
          residualPids: residualTargets.map(t => t.pid),
          residualComms: residualTargets.map(t => t.comm),
        },
        "sessiond-gamescope-reaper: residual processes remain after retries",
      )
    }

    return {
      reaped: Array.from(reapedPids).sort((a, b) => a - b),
      residual: residualTargets.map(t => t.pid).sort((a, b) => a - b),
    }
  }
}

function isGamescopeProcess(info: ProcessInfo): boolean {
  return (GAMESCOPE_PROCESS_NAMES as readonly string[]).includes(info.comm)
}

function collectGamescopeTargets(
  processes: readonly ProcessInfo[],
  pgid: number,
): readonly ProcessInfo[] {
  const byPid = new Map<number, ProcessInfo>()
  for (const info of processes) byPid.set(info.pid, info)

  const inLineage = (info: ProcessInfo): boolean => {
    if (info.pgid === pgid) return true
    let cursor: ProcessInfo | undefined = info
    const visited = new Set<number>()
    while (cursor && !visited.has(cursor.pid)) {
      visited.add(cursor.pid)
      if (cursor.pgid === pgid) return true
      if (cursor.ppid === pgid) return true
      if (cursor.ppid <= 1) return false
      cursor = byPid.get(cursor.ppid)
    }
    return false
  }

  return processes.filter(info => isGamescopeProcess(info) && inLineage(info))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}

/**
 * Default POSIX signaler: `process.kill(-pgid, sig)` for the group,
 * `process.kill(pid, sig)` for an individual process. Both swallow ESRCH
 * (target already gone) so the reaper can run idempotently.
 */
export const POSIX_PROCESS_SIGNALER: ProcessSignaler = {
  signalGroup: async (pgid, signal) => {
    try {
      process.kill(-pgid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    }
  },
  signalProcess: async (pid, signal) => {
    try {
      process.kill(pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    }
  },
}

/**
 * Reads `/proc/<pid>/stat` for every numeric `/proc` entry, parsing the
 * stat fields (PID, comm, ppid, pgid). `comm` is the executable basename
 * truncated to 15 chars (per the kernel's TASK_COMM_LEN), wrapped in
 * parens and may itself contain spaces — we slice between the last `)`
 * and the rest to handle that correctly.
 */
export function createProcfsProcessList(procRoot = "/proc"): ProcessListQuery {
  return {
    list: async () => {
      const { readdir, readFile } = await import("node:fs/promises")
      const entries = await readdir(procRoot)
      const processes: ProcessInfo[] = []
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue
        const pid = Number.parseInt(entry, 10)
        try {
          const raw = await readFile(`${procRoot}/${entry}/stat`, "utf8")
          const lastParen = raw.lastIndexOf(")")
          if (lastParen < 0) continue
          const commStart = raw.indexOf("(")
          if (commStart < 0 || commStart > lastParen) continue
          const comm = raw.slice(commStart + 1, lastParen)
          const rest = raw.slice(lastParen + 2).split(/\s+/)
          // Fields after `state`: ppid (rest[1]), pgrp (rest[2]).
          const ppid = Number.parseInt(rest[1] ?? "0", 10)
          const pgid = Number.parseInt(rest[2] ?? "0", 10)
          if (
            !Number.isFinite(ppid) ||
            !Number.isFinite(pgid) ||
            !Number.isFinite(pid)
          )
            continue
          processes.push({ pid, ppid, pgid, comm })
        } catch (error) {
          // Process exited between readdir and readFile — skip silently.
          const code = (error as NodeJS.ErrnoException).code
          if (code !== "ENOENT" && code !== "ESRCH") throw error
        }
      }
      return processes
    },
  }
}

/**
 * Production reaper for sessiond's `main()`: reads /proc and signals via
 * POSIX kill. Test fixtures inject the cheaper inline pieces directly.
 */
export function createSystemGamescopeReaper(
  overrides: Partial<GamescopeReaperOptions> = {},
): GamescopeReaper {
  return createGamescopeReaper({
    processList: overrides.processList ?? createProcfsProcessList(),
    signaler: overrides.signaler ?? POSIX_PROCESS_SIGNALER,
    logger: overrides.logger,
    graceMs: overrides.graceMs,
    retries: overrides.retries,
  })
}
