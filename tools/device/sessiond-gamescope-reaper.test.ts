import { describe, expect, it } from "bun:test"
import {
  createGamescopeReaper,
  GAMESCOPE_PROCESS_NAMES,
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

describe("sessiond gamescope reaper", () => {
  it("exposes the canonical compositor process names", () => {
    expect(GAMESCOPE_PROCESS_NAMES).toEqual(["gamescope-wl", "gamescopereaper"])
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
