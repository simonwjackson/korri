import { describe, expect, it } from "bun:test"
import type { ProcessInfo } from "./sessiond-gamescope-reaper"
import {
  createSourceMachineSessionRole,
  evaluateIdleBlank,
  type SourceMachineSwayController,
} from "./sessiond-source-machine"

const SLEEP_PID: ProcessInfo = {
  pid: 1000,
  pgid: 1000,
  ppid: 1,
  comm: "sleep",
}
const GAMESCOPE_PID: ProcessInfo = {
  pid: 1001,
  pgid: 1000,
  ppid: 1000,
  comm: "gamescope-wl",
}

describe("evaluateIdleBlank", () => {
  it("returns ready when no gamescope windows or processes are present and cooldown elapsed", () => {
    const assessment = evaluateIdleBlank(
      {
        gamescopeWindows: [],
        gamescopeProcesses: [],
        cooldownElapsedMs: 500,
      },
      { cooldownMs: 200 },
    )
    expect(assessment.status).toBe("ready")
    expect(assessment.checks).toEqual({
      gamescopeWindowsAbsent: true,
      gamescopeProcessesAbsent: true,
      cooldownElapsed: true,
    })
  })

  it("flags clear-foreground when a Gamescope window remains in the sway tree", () => {
    const assessment = evaluateIdleBlank(
      {
        gamescopeWindows: [
          { id: 7, focused: false, fullscreen: true, appId: "gamescope" },
        ],
        gamescopeProcesses: [],
        cooldownElapsedMs: 500,
      },
      { cooldownMs: 200 },
    )
    expect(assessment.status).toBe("clear-foreground")
    expect(assessment.checks.gamescopeWindowsAbsent).toBe(false)
  })

  it("flags clear-processes when gamescope-wl is still alive", () => {
    const assessment = evaluateIdleBlank(
      {
        gamescopeWindows: [],
        gamescopeProcesses: [GAMESCOPE_PID],
        cooldownElapsedMs: 500,
      },
      { cooldownMs: 200 },
    )
    expect(assessment.status).toBe("clear-processes")
    expect(assessment.checks.gamescopeProcessesAbsent).toBe(false)
  })

  it("flags waiting when invariants are satisfied but cooldown has not elapsed", () => {
    const assessment = evaluateIdleBlank(
      {
        gamescopeWindows: [],
        gamescopeProcesses: [],
        cooldownElapsedMs: 100,
      },
      { cooldownMs: 500 },
    )
    expect(assessment.status).toBe("waiting")
    expect(assessment.checks.cooldownElapsed).toBe(false)
  })

  it("ignores non-gamescope processes in the list", () => {
    const assessment = evaluateIdleBlank(
      {
        gamescopeWindows: [],
        gamescopeProcesses: [SLEEP_PID].filter(
          p => p.comm === "gamescope-wl" || p.comm === "gamescopereaper",
        ),
        cooldownElapsedMs: 500,
      },
      { cooldownMs: 200 },
    )
    expect(assessment.status).toBe("ready")
  })
})

interface SwayHarness {
  readonly sway: SourceMachineSwayController
  readonly events: string[]
  readonly state: { windows: ReadonlyArray<{ id: number; focused: boolean }> }
}

function makeSway(
  initial: ReadonlyArray<{ id: number; focused: boolean }> = [],
): SwayHarness {
  const events: string[] = []
  const state = { windows: [...initial] }
  return {
    events,
    state,
    sway: {
      getGamescopeWindows: async () =>
        state.windows.map(w => ({
          id: w.id,
          focused: w.focused,
          fullscreen: true,
        })),
      clearGamescopeWindows: async windows => {
        events.push(...windows.map(w => `clear:${w.id}`))
        state.windows = []
      },
    },
  }
}

function makeProcessList(processes: readonly ProcessInfo[]) {
  return {
    list: async () => processes,
  }
}

describe("source-machine session role", () => {
  it("identifies as source-machine and emits idle-ready with no renderer-stopped", () => {
    const { sway } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
    })

    expect(role.id).toBe("source-machine")
    expect(role.idleReadyEventName).toBe("idle-ready")
    expect(role.emitsRendererStopped).toBe(false)
    expect(role.rendererStatus()).toEqual({ kind: "noop" })
    expect(role.idleReadyEvidence()).toContain("idle-blank")
  })

  it("enterIdle and leaveIdle are renderer-free no-ops", async () => {
    const { sway, events } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
    })

    await role.enterIdle()
    await role.leaveIdle()
    expect(events).toEqual([])
  })

  it("beforeChildLaunch is a no-op (no renderer to yield)", async () => {
    const { sway, events } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
    })

    await role.beforeChildLaunch()
    expect(events).toEqual([])
  })

  it("restoreIdleAfterLaunch clears stale Gamescope windows and resolves once idle-blank", async () => {
    const { sway, events, state } = makeSway([{ id: 42, focused: true }])
    let now = 0
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => now,
      delay: async ms => {
        now += ms
      },
      cooldownMs: 50,
      pollIntervalMs: 25,
      maxReadyAttempts: 10,
    })

    await role.restoreIdleAfterLaunch()

    expect(events).toContain("clear:42")
    expect(state.windows).toEqual([])
  })

  it("restoreIdleAfterLaunch waits through cooldown before resolving", async () => {
    const { sway } = makeSway()
    let now = 0
    const delays: number[] = []
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => now,
      delay: async ms => {
        delays.push(ms)
        now += ms
      },
      cooldownMs: 75,
      pollIntervalMs: 25,
      maxReadyAttempts: 10,
    })

    await role.restoreIdleAfterLaunch()

    expect(delays.length).toBeGreaterThan(0)
    expect(now).toBeGreaterThanOrEqual(75)
  })

  it("restoreIdleAfterLaunch throws when ready attempts exceed the budget while gamescope processes linger", async () => {
    const { sway } = makeSway()
    const lingeringGamescope: ProcessInfo = {
      pid: 5500,
      pgid: 5500,
      ppid: 1,
      comm: "gamescope-wl",
    }
    let now = 0
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([lingeringGamescope]),
      clock: () => now,
      delay: async ms => {
        now += ms
      },
      cooldownMs: 0,
      pollIntervalMs: 10,
      maxReadyAttempts: 3,
    })

    await expect(role.restoreIdleAfterLaunch()).rejects.toThrow(/idle-blank/i)
  })

  it("reconcileIdle surfaces a recovering-friendly error when sway query fails", async () => {
    const role = createSourceMachineSessionRole({
      sway: {
        getGamescopeWindows: async () => {
          throw new Error("sway tree query failed")
        },
        clearGamescopeWindows: async () => {},
      },
      processList: makeProcessList([]),
      clock: () => 0,
      delay: async () => {},
      cooldownMs: 0,
      pollIntervalMs: 0,
      maxReadyAttempts: 2,
    })

    await expect(role.reconcileIdle()).rejects.toThrow(/sway tree query/i)
  })
})
