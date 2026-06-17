import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import type { ProcessInfo } from "@product/plugins/gamescope/session"
import {
  formatSessionRoleReadyEvidence,
  sessionRoleReadyOutcome,
} from "./sessiond-role"
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
    expect(sessionRoleReadyOutcome(role)).toMatchObject({
      status: "ok",
      evidence: { kind: "idle-blank" },
    })
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

  it("idle-ready evidence pins the windows/processes/cooldown contract after a successful restore (task-016 AC #6)", async () => {
    // Regression guard: the evidence format is part of the wire
    // contract operators read. Order, separators, and field names
    // must stay stable so monitors and the operator UI can parse
    // it without ambiguity. Mirrors the kiosk-side
    // `formatKioskReadyEvidence` regression guard added in
    // task-015.
    const { sway } = makeSway()
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

    const outcome = sessionRoleReadyOutcome(role)
    expect(outcome).toMatchObject({
      status: "ok",
      evidence: {
        kind: "idle-blank",
        gamescopeWindowsAbsent: true,
        gamescopeProcessesAbsent: true,
        cooldownElapsed: true,
      },
    })
    if (outcome.status !== "ok") throw new Error("expected ok")
    expect(formatSessionRoleReadyEvidence(outcome.evidence)).toBe(
      "idle-blank|windows=absent|processes=absent|cooldown=elapsed",
    )
    expect(role.idleReadyEvidence()).toBe(
      "idle-blank|windows=absent|processes=absent|cooldown=elapsed",
    )
  })

  it("initial idle-ready evidence is wire-shape valid before any restore runs (task-016 AC #6)", async () => {
    // The role's initial \`latestChecks\` defaults to all-satisfied so
    // a freshly-constructed role can answer \`idleReadyEvidence()\`
    // without crashing. This regression guard pins the initial-state
    // wire shape so a future re-initialization (e.g. lifecycle
    // reset) cannot quietly leak unsatisfied labels.
    const { sway } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 0,
      delay: async () => {},
      cooldownMs: 0,
    })

    expect(role.idleReadyEvidence()).toBe(
      "idle-blank|windows=absent|processes=absent|cooldown=elapsed",
    )
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

  // Task-009 coverage gap: pin the distinct error message for
  // "windows lingered" so an operator can disambiguate window-residue
  // failures from process-residue failures. The previous test covers
  // the clear-processes branch; this one covers clear-foreground.
  it("restoreIdleAfterLaunch throws a windows-lingered error when gamescope windows outlive the budget", async () => {
    const state = {
      windows: [{ id: 7, focused: true, fullscreen: true }] as {
        id: number
        focused: boolean
        fullscreen: boolean
      }[],
    }
    const sway: SourceMachineSwayController = {
      getGamescopeWindows: async () => state.windows,
      // No-op clear: windows persist across every attempt so the
      // role exhausts its budget on the clear-foreground branch.
      clearGamescopeWindows: async () => {},
    }
    let now = 0
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => now,
      delay: async ms => {
        now += ms
      },
      cooldownMs: 0,
      pollIntervalMs: 10,
      maxReadyAttempts: 3,
    })

    await expect(role.restoreIdleAfterLaunch()).rejects.toThrow(
      /gamescope windows lingered past idle-blank budget/,
    )
  })

  // Task-009 coverage gap: the default \`delay\` implementation that
  // wraps \`setTimeout\` is never exercised when tests inject a delay
  // shim. This test bounds the wall-time interaction and proves the
  // production code path is reachable.
  it("uses a real setTimeout-backed delay when none is injected", async () => {
    const role = createSourceMachineSessionRole({
      sway: {
        getGamescopeWindows: async () => [],
        clearGamescopeWindows: async () => {},
      },
      processList: makeProcessList([]),
      // No delay/clock injection — takes the production default.
      cooldownMs: 5,
      pollIntervalMs: 5,
      maxReadyAttempts: 50,
    })

    const before = Date.now()
    await role.restoreIdleAfterLaunch()
    const elapsed = Date.now() - before

    // Cooldown is 5ms; a real setTimeout will take \u2265 5ms of wall
    // time. The upper bound is generous to keep this test stable on
    // a loaded CI host.
    expect(elapsed).toBeGreaterThanOrEqual(5)
    expect(elapsed).toBeLessThan(2000)
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

  // Phase 4D / Track A U5 -- foreground surface repair via afterChildRunning.

  it("afterChildRunning is a no-op when no surfaceRepair config is provided", async () => {
    const { sway, events } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
    })

    await role.afterChildRunning({ command: "/bin/game", args: [] })
    expect(events).toEqual([])
  })

  it("afterChildRunning invokes the surfaceRepair callback with the role's selector", async () => {
    const { sway } = makeSway()
    const repairCalls: Array<{ readonly spec: LaunchSpec }> = []
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
      surfaceRepair: async spec => {
        repairCalls.push({ spec })
      },
    })

    await role.afterChildRunning({
      command: "/bin/game",
      args: ["rom.smc"],
    })

    expect(repairCalls).toHaveLength(1)
    expect(repairCalls[0].spec).toEqual({
      command: "/bin/game",
      args: ["rom.smc"],
    })
  })

  it("afterChildRunning propagates surfaceRepair failures so sessiond maps them to host-unavailable", async () => {
    const { sway } = makeSway()
    const role = createSourceMachineSessionRole({
      sway,
      processList: makeProcessList([]),
      clock: () => 1_000,
      delay: async () => {},
      cooldownMs: 0,
      surfaceRepair: async () => {
        throw new Error("stream surface remained after timeout")
      },
    })

    await expect(
      role.afterChildRunning({ command: "/bin/game", args: [] }),
    ).rejects.toThrow(/stream surface remained/i)
  })
})
