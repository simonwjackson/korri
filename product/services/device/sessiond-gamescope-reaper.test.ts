import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createGamescopeReaper,
  createProcfsProcessList,
  createSystemGamescopeReaper,
  GAMESCOPE_PROCESS_NAMES,
  POSIX_PROCESS_SIGNALER,
  type ProcessInfo,
} from "./sessiond-gamescope-reaper"

function makeProcessList(processes: readonly ProcessInfo[]) {
  return { list: async () => processes }
}

interface Signal {
  readonly target: "group" | "process"
  readonly id: number
  readonly signal: "SIGTERM" | "SIGKILL"
}

function makeSignaler() {
  const sent: Signal[] = []
  const signaler = {
    signalGroup: async (pgid: number, signal: "SIGTERM" | "SIGKILL") => {
      sent.push({ target: "group", id: pgid, signal })
    },
    signalProcess: async (pid: number, signal: "SIGTERM" | "SIGKILL") => {
      sent.push({ target: "process", id: pid, signal })
    },
  }
  return { sent, signaler }
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe("sessiond gamescope reaper", () => {
  it("exposes the canonical compositor process names", () => {
    expect(GAMESCOPE_PROCESS_NAMES).toEqual([
      "gamescope-wl",
      "gamescopereaper",
      "gamescope",
    ])
  })

  it("reaps Bandai gamescope processes that use the gamescope comm name", async () => {
    let pass = 0
    const processList = {
      list: async () => {
        pass += 1
        if (pass === 1) {
          return [
            { pid: 1000, pgid: 1000, ppid: 1, comm: "setsid" },
            { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope" },
          ] satisfies readonly ProcessInfo[]
        }
        return [] satisfies readonly ProcessInfo[]
      },
    }
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(sent[0]).toEqual({ target: "group", id: 1000, signal: "SIGTERM" })
    expect(outcome).toEqual({ reaped: [1001], residual: [] })
  })

  it("signals the process group then verifies both gamescope processes are gone", async () => {
    let pass = 0
    const processList = {
      list: async () => {
        pass += 1
        if (pass === 1) {
          return [
            { pid: 1000, pgid: 1000, ppid: 1, comm: "setsid" },
            { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
            { pid: 1002, pgid: 1000, ppid: 1001, comm: "gamescopereaper" },
            { pid: 2000, pgid: 2000, ppid: 1, comm: "editor" },
          ] satisfies readonly ProcessInfo[]
        }
        return [
          { pid: 2000, pgid: 2000, ppid: 1, comm: "editor" },
        ] satisfies readonly ProcessInfo[]
      },
    }
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(sent[0]).toEqual({ target: "group", id: 1000, signal: "SIGTERM" })
    expect(outcome.residual).toEqual([])
    expect([...outcome.reaped].sort()).toEqual([1001, 1002])
  })

  it("is a no-op when the pgid is already empty", async () => {
    const processList = makeProcessList([
      { pid: 2000, pgid: 2000, ppid: 1, comm: "editor" },
    ])
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(sent).toEqual([])
    expect(outcome.reaped).toEqual([])
    expect(outcome.residual).toEqual([])
  })

  it("never signals processes outside the pgid or its lineage", async () => {
    const processList = makeProcessList([
      { pid: 3001, pgid: 3001, ppid: 1, comm: "gamescope-wl" },
      { pid: 3002, pgid: 3001, ppid: 1, comm: "editor" },
      { pid: 4000, pgid: 4000, ppid: 1, comm: "gamescope-wl" },
    ])
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    await reap({ pgid: 3001 })

    expect(
      sent.filter(s => s.target === "process").map(s => s.id),
    ).not.toContain(4000)
    expect(
      sent.filter(s => s.target === "process").map(s => s.id),
    ).not.toContain(3002)
  })

  it("reaps gamescope-wl whose parent lineage traces back into the pgid even after escape", async () => {
    let pass = 0
    const processList = {
      list: async () => {
        pass += 1
        if (pass === 1) {
          return [
            { pid: 1000, pgid: 1000, ppid: 1, comm: "setsid" },
            // Child escaped the group: pgid != 1000 but ppid chains back.
            { pid: 1500, pgid: 1500, ppid: 1000, comm: "gamescope-wl" },
          ] satisfies readonly ProcessInfo[]
        }
        return [] satisfies readonly ProcessInfo[]
      },
    }
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    const processSignals = sent.filter(s => s.target === "process")
    expect(processSignals.some(s => s.id === 1500)).toBe(true)
    expect(outcome.reaped).toContain(1500)
  })

  it("escalates to SIGKILL when residual gamescope processes survive the grace window", async () => {
    let pass = 0
    const processList = {
      list: async () => {
        pass += 1
        // Always-living gamescope-wl in the pgid that ignores SIGTERM.
        return [
          { pid: 1000, pgid: 1000, ppid: 1, comm: "setsid" },
          { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
        ] satisfies readonly ProcessInfo[]
      },
    }
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 2,
    })

    const outcome = await reap({ pgid: 1000 })

    const groupSignals = sent.filter(s => s.target === "group")
    expect(groupSignals.map(s => s.signal)).toContain("SIGTERM")
    expect(groupSignals.map(s => s.signal)).toContain("SIGKILL")
    expect(outcome.residual).toEqual([1001])
    expect(pass).toBeGreaterThan(1)
  })

  it("surfaces structured warnings without crashing when process-list query fails", async () => {
    const warnings: Array<{
      readonly input: unknown
      readonly message?: string
    }> = []
    const failingList = {
      list: async () => {
        throw new Error("kaboom")
      },
    }
    const { signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList: failingList,
      signaler,
      logger: {
        warn: (input: unknown, message?: string) =>
          warnings.push({ input, message }),
      },
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(outcome.residual).toEqual([])
    expect(outcome.reaped).toEqual([])
    expect(warnings.length).toBeGreaterThan(0)
    const messages = warnings.map(w => w.message ?? "")
    expect(messages.some(m => m.includes("process-list"))).toBe(true)
    const err = warnings.find(w => {
      const value = w.input as { readonly err?: unknown }
      return value?.err instanceof Error
    })
    expect((err?.input as { readonly err: Error }).err.message).toBe("kaboom")
  })

  it("returns accumulated reaped pids when a later pass sees an empty target set", async () => {
    let pass = 0
    const processList = {
      list: async () => {
        pass += 1
        if (pass === 1) {
          return [
            { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
          ] satisfies readonly ProcessInfo[]
        }
        return [] satisfies readonly ProcessInfo[]
      },
    }
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 3,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(outcome).toEqual({ reaped: [1001], residual: [] })
    expect(sent).toEqual([{ target: "group", id: 1000, signal: "SIGTERM" }])
  })

  it("treats residual-check query failures as an empty residual set with a warning", async () => {
    let pass = 0
    const warnings: string[] = []
    const processList = {
      list: async () => {
        pass += 1
        if (pass <= 2) {
          return [
            { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
          ] satisfies readonly ProcessInfo[]
        }
        throw new Error("residual scan failed")
      },
    }
    const { signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      logger: { warn: (_input, message) => warnings.push(message ?? "") },
      graceMs: 0,
      retries: 2,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(outcome.residual).toEqual([])
    expect(warnings).toContain(
      "sessiond-gamescope-reaper: residual check failed",
    )
  })

  it("does not loop forever when process lineage contains a parent cycle", async () => {
    const processList = makeProcessList([
      { pid: 20, pgid: 20, ppid: 21, comm: "gamescope-wl" },
      { pid: 21, pgid: 21, ppid: 20, comm: "gamescopereaper" },
    ])
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 1000 })

    expect(outcome).toEqual({ reaped: [], residual: [] })
    expect(sent).toEqual([])
  })

  it("waits the grace window before escalation when configured", async () => {
    const processList = makeProcessList([
      { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
    ])
    const { signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 5,
      retries: 1,
    })

    const before = Date.now()
    await reap({ pgid: 1000 })
    const elapsed = Date.now() - before

    expect(elapsed).toBeGreaterThanOrEqual(5)
    expect(elapsed).toBeLessThan(2000)
  })

  it("POSIX_PROCESS_SIGNALER swallows ESRCH but rethrows other process.kill failures", async () => {
    const originalKill = process.kill
    const calls: Array<{ readonly pid: number; readonly signal: string }> = []
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      calls.push({ pid, signal: String(signal) })
      return true
    }) as typeof process.kill
    try {
      await POSIX_PROCESS_SIGNALER.signalGroup(123, "SIGTERM")
      await POSIX_PROCESS_SIGNALER.signalProcess(456, "SIGKILL")
      expect(calls).toEqual([
        { pid: -123, signal: "SIGTERM" },
        { pid: 456, signal: "SIGKILL" },
      ])
    } finally {
      process.kill = originalKill
    }

    calls.length = 0
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      calls.push({ pid, signal: String(signal) })
      const error = new Error("gone") as NodeJS.ErrnoException
      error.code = "ESRCH"
      throw error
    }) as typeof process.kill
    try {
      await POSIX_PROCESS_SIGNALER.signalGroup(123, "SIGTERM")
      await POSIX_PROCESS_SIGNALER.signalProcess(456, "SIGKILL")
      expect(calls).toEqual([
        { pid: -123, signal: "SIGTERM" },
        { pid: 456, signal: "SIGKILL" },
      ])
    } finally {
      process.kill = originalKill
    }

    process.kill = (() => {
      const error = new Error("permission denied") as NodeJS.ErrnoException
      error.code = "EPERM"
      throw error
    }) as typeof process.kill
    try {
      await expect(
        POSIX_PROCESS_SIGNALER.signalGroup(123, "SIGTERM"),
      ).rejects.toThrow("permission denied")
      await expect(
        POSIX_PROCESS_SIGNALER.signalProcess(456, "SIGKILL"),
      ).rejects.toThrow("permission denied")
    } finally {
      process.kill = originalKill
    }
  })

  it("parses procfs stat entries and skips malformed or disappearing processes", async () => {
    const procRoot = await mkdtemp(join(tmpdir(), "korri-procfs-"))
    cleanups.push(() => rm(procRoot, { recursive: true, force: true }))
    await writeFile(join(procRoot, "not-a-pid"), "ignored")
    await mkdir(join(procRoot, "100"))
    await mkdir(join(procRoot, "101"))
    await mkdir(join(procRoot, "102"))
    await mkdir(join(procRoot, "103"))
    await writeFile(
      join(procRoot, "100", "stat"),
      "100 (gamescope wl) S 7 77 0 0 0",
    )
    await writeFile(join(procRoot, "101", "stat"), "101 no-parens")
    await writeFile(join(procRoot, "102", "stat"), "102 ) bad")
    // 103 disappears between readdir and readFile: directory exists,
    // stat file does not. createProcfsProcessList should skip it.

    const processes = await createProcfsProcessList(procRoot).list()

    expect(processes).toEqual([
      { pid: 100, comm: "gamescope wl", ppid: 7, pgid: 77 },
    ])
  })

  it("rethrows unexpected procfs read errors", async () => {
    const procRoot = await mkdtemp(join(tmpdir(), "korri-procfs-eisdir-"))
    cleanups.push(() => rm(procRoot, { recursive: true, force: true }))
    await mkdir(join(procRoot, "200"))
    await mkdir(join(procRoot, "200", "stat"))

    await expect(createProcfsProcessList(procRoot).list()).rejects.toThrow()
  })

  it("createSystemGamescopeReaper composes supplied overrides", async () => {
    const { sent, signaler } = makeSignaler()
    const reap = createSystemGamescopeReaper({
      processList: makeProcessList([
        { pid: 42, pgid: 7, ppid: 7, comm: "gamescope-wl" },
      ]),
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: 7 })

    expect(outcome.reaped).toEqual([42])
    expect(sent).toContainEqual({ target: "group", id: 7, signal: "SIGTERM" })
  })

  it("createSystemGamescopeReaper default composition is a no-op without a pgid", async () => {
    const reap = createSystemGamescopeReaper({ graceMs: 0, retries: 1 })

    const outcome = await reap({ pgid: undefined })

    expect(outcome).toEqual({ reaped: [], residual: [] })
  })

  it("is a no-op when pgid is undefined", async () => {
    const processList = makeProcessList([
      { pid: 1001, pgid: 1000, ppid: 1000, comm: "gamescope-wl" },
    ])
    const { sent, signaler } = makeSignaler()
    const reap = createGamescopeReaper({
      processList,
      signaler,
      graceMs: 0,
      retries: 1,
    })

    const outcome = await reap({ pgid: undefined })

    expect(sent).toEqual([])
    expect(outcome.reaped).toEqual([])
    expect(outcome.residual).toEqual([])
  })
})
