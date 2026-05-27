import { describe, expect, it } from "bun:test"
import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"
import type { SessiondManagedLaunchEvent } from "@shared/library/sessiond-managed-launch-protocol"
import { createKorriSessiondCore, type KorriSessiondCore } from "./sessiond"
import type {
  GamescopeReaper,
  ReapOutcome,
  ReapRequest,
} from "./sessiond-gamescope-reaper"
import type { SessionRole } from "./sessiond-role"
import type { KorriWindowSnapshot } from "./sessiond-state"
import type {
  SessiondLifecycleSnapshot,
  StatusSidecar,
} from "./sessiond-status-sidecar"

const token = "test-token"
const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

function startHarness(
  options: {
    readonly windows?: readonly KorriWindowSnapshot[]
    readonly launchResult?: LaunchResult
    readonly failRendererLaunch?: boolean
    readonly failRendererRestore?: boolean
    readonly runLaunch?: (spec: LaunchSpec) => Promise<LaunchResult>
    readonly spawnLaunch?: (spec: LaunchSpec) => Promise<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
      readonly processGroupId?: number
    }>
    readonly reaper?: GamescopeReaper
  } = {},
) {
  const events: string[] = []
  let rendererPid = 100
  let windows = [...(options.windows ?? [])]
  const core = createKorriSessiondCore({
    token,
    logger: silentLogger,
    serviceManager: {
      maskEssway: async () => {
        events.push("mask-es")
      },
      restoreEssway: async () => {
        events.push("restore-es")
      },
    },
    renderer: {
      kind: "electrobun",
      launch: async () => {
        const launchCount = events.filter(
          event => event === "launch-electrobun",
        ).length
        events.push("launch-electrobun")
        if (
          options.failRendererLaunch ||
          (options.failRendererRestore && launchCount > 0)
        )
          throw new Error("renderer failed")
        rendererPid += 1
        windows = [{ id: rendererPid, focused: true, fullscreen: true }]
        return {
          pid: rendererPid,
          command: { command: "electrobun", args: [] },
        }
      },
      stop: async pid => {
        events.push(`stop-electrobun:${pid ?? "none"}`)
        windows = []
      },
    },
    sway: {
      getKorriWindows: async () => windows,
      applyDecisions: async decisions => {
        events.push(...decisions.map(decision => `sway:${decision.kind}`))
        return []
      },
    },
    launcher: {
      run: async receivedSpec => {
        events.push(`launch-game:${receivedSpec.command}`)
        if (options.runLaunch) return await options.runLaunch(receivedSpec)
        return options.launchResult ?? { status: "launched" }
      },
      spawn: options.spawnLaunch
        ? async receivedSpec => {
            events.push(`launch-game:${receivedSpec.command}`)
            const spawned = await options.spawnLaunch?.(receivedSpec)
            if (!spawned) throw new Error("missing spawned launch")
            return {
              status: "started" as const,
              result: spawned.result,
              session: {
                id: "sessiond-child",
                ...(spawned.processGroupId !== undefined
                  ? { processGroupId: spawned.processGroupId }
                  : {}),
                exited: spawned.result.then(result => ({
                  exitCode: result.status === "launched" ? 0 : result.exitCode,
                })),
                terminate: spawned.terminate,
                terminateNow: spawned.terminateNow,
              },
            }
          }
        : undefined,
    },
    reaper: options.reaper,
  })
  return { core, events }
}

function request(
  core: KorriSessiondCore,
  path: string,
  init: RequestInit = {},
) {
  return core.handleRequest(new Request(`http://127.0.0.1:3003${path}`, init))
}

function authorized(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "x-korri-sessiond-token": token,
    },
  }
}

describe("korri sessiond", () => {
  it("starts Korri mode by masking ES, launching Electrobun, and entering home", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/control/start",
      authorized({ method: "POST" }),
    )
    expect(response.ok).toBe(true)
    const body = await response.json()

    expect(body.state.mode).toBe("home")
    expect(events).toContain("mask-es")
    expect(events).toContain("launch-electrobun")
  })

  it("rejects unauthenticated control requests without changing state", async () => {
    const { core, events } = startHarness()

    const response = await request(core, "/control/start", { method: "POST" })

    expect(response.status).toBe(401)
    expect(events).toEqual([])
    expect(core.status().state.mode).toBe("stopped")
  })

  it("launches a game under session control and restores Electrobun afterward", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({ status: "launched" })
    expect(body.state.mode).toBe("home")
    expect(body.renderer).toEqual({ kind: "electrobun", pid: 102 })
    expect(events).toContain("stop-electrobun:101")
    expect(events).toContain("launch-game:/bin/game")
    expect(events.filter(event => event === "launch-electrobun")).toHaveLength(
      2,
    )
  })

  it("restores Electrobun even when the game exits non-zero", async () => {
    const { core, events } = startHarness({
      launchResult: { status: "failed", exitCode: 7, stderrTail: "boom" },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({
      status: "failed",
      exitCode: 7,
      stderrTail: "boom",
    })
    expect(body.state.mode).toBe("home")
    expect(events.filter(event => event === "launch-electrobun")).toHaveLength(
      2,
    )
  })

  it("rejects launches when the session is not in home mode", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result.status).toBe("failed")
    expect(events).not.toContain("launch-game:/bin/game")
  })

  it("starts a managed launch promptly and emits lifecycle events through restored home", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      runLaunch: async () => await control.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({ status: "accepted", launchId: "launch-1" })
    expect(core.status().state.mode).toBe("game")
    expect(events).toContain("launch-game:/bin/game")

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
      authorized(),
    )
    const streamText = streamResponse.text()

    control.resolve({ status: "launched" })
    const lifecycle = parseSseEvents(await streamText)

    expect(lifecycle.map(event => event.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "child-exited",
      "restoring",
      "home-ready",
    ])
    expect(core.status().state.mode).toBe("home")
  })

  it("rejects managed launch re-entry while sessiond is not home", async () => {
    const { core, events } = startHarness()

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({
      status: "failed",
      failureKind: "session-busy",
      message: "sessiond is stopped; launch requires home",
    })
    expect(events).not.toContain("launch-game:/bin/game")
  })

  it("returns bad-request for malformed managed launch payloads", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: { args: [] } }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("bad-request")
  })

  it("requires authentication for managed launch commands and events", async () => {
    const { core, events } = startHarness()

    const commandResponse = await request(core, "/managed-launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ launchId: "launch-1", spec }),
    })
    const eventsResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
    )

    expect(commandResponse.status).toBe(401)
    expect(eventsResponse.status).toBe(401)
    expect(events).toEqual([])
  })

  it("keeps the blocking launch path compatible while using managed execution", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    const body = await response.json()

    expect(body.result).toEqual({ status: "launched" })
    expect(body.state.mode).toBe("home")
  })

  it("records termination requested immediately after managed launch acceptance", async () => {
    const spawnReady = deferred<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
    }>()
    const childExit = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => await spawnReady.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )

    expect(await response.json()).toEqual({
      status: "accepted",
      launchId: "launch-1",
    })

    spawnReady.resolve({
      result: childExit.promise,
      terminate: () => {
        events.push("terminate-game")
        childExit.resolve({ status: "failed", exitCode: 143 })
      },
      terminateNow: () => {
        events.push("terminate-game-now")
        childExit.resolve({ status: "failed", exitCode: 137 })
      },
    })

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game")
  })

  it("terminates only the active managed launch identity", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => {
          events.push("terminate-game")
          control.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          control.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1" }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({ status: "accepted", launchId: "launch-1" })
    expect(events).toContain("terminate-game")
    await waitForSessionMode(core, "home")
    expect(events).not.toContain("restore-es")
  })

  it("force terminates an accepted managed launch when requested before child registration", async () => {
    const spawnReady = deferred<{
      readonly result: Promise<LaunchResult>
      readonly terminate: () => void
      readonly terminateNow: () => void
    }>()
    const childExit = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => await spawnReady.promise,
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", force: true }),
      }),
    )

    spawnReady.resolve({
      result: childExit.promise,
      terminate: () => {
        events.push("terminate-game")
        childExit.resolve({ status: "failed", exitCode: 143 })
      },
      terminateNow: () => {
        events.push("terminate-game-now")
        childExit.resolve({ status: "failed", exitCode: 137 })
      },
    })

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game-now")
    expect(events).not.toContain("terminate-game")
  })

  it("force terminates the active managed launch identity", async () => {
    const control = deferred<LaunchResult>()
    const { core, events } = startHarness({
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => {
          events.push("terminate-game")
          control.resolve({ status: "failed", exitCode: 143 })
        },
        terminateNow: () => {
          events.push("terminate-game-now")
          control.resolve({ status: "failed", exitCode: 137 })
        },
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )

    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", force: true }),
      }),
    )

    await waitForSessionMode(core, "home")
    expect(events).toContain("terminate-game-now")
    expect(events).not.toContain("terminate-game")
  })

  it("does not stop the kiosk for stale managed launch termination", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "stale-launch" }),
      }),
    )
    const body = await response.json()

    expect(body).toEqual({
      status: "not-found",
      launchId: "stale-launch",
      message: "managed launch is not active",
    })
    expect(core.status().state.mode).toBe("home")
    expect(events).not.toContain("restore-es")
  })

  it("emits recovering without home-ready when managed restore fails", async () => {
    const { core } = startHarness({ failRendererRestore: true })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-1", spec }),
      }),
    )
    await waitForSessionMode(core, "recovering")

    const stream = await request(
      core,
      "/managed-launch/events?launchId=launch-1",
      authorized(),
    )
    const lifecycle = parseSseEvents(await stream.text())

    expect(lifecycle.map(event => event.type)).toContain("recovering")
    expect(lifecycle.map(event => event.type)).not.toContain("home-ready")
  })

  it("returns a bounded failed event for stale lifecycle replay requests", async () => {
    const { core } = startHarness()

    const response = await request(
      core,
      "/managed-launch/events?launchId=missing-launch",
      authorized(),
    )
    const lifecycle = parseSseEvents(await response.text())

    expect(lifecycle).toMatchObject([
      {
        launchId: "missing-launch",
        type: "failed",
        message: "managed launch event replay unavailable",
      },
    ])
  })

  it("stops Korri mode by stopping Electrobun and restoring ES", async () => {
    const { core, events } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(
      core,
      "/control/stop",
      authorized({ method: "POST" }),
    )
    const body = await response.json()

    expect(body.state.mode).toBe("stopped")
    expect(events).toContain("restore-es")
    expect(events).toContain("stop-electrobun:101")
  })

  it("invokes the gamescope reaper with the launch pgid at the restoring transition", async () => {
    const reapCalls: ReapRequest[] = []
    const reaper: GamescopeReaper = async request => {
      reapCalls.push(request)
      const outcome: ReapOutcome = { reaped: [], residual: [] }
      return outcome
    }
    const control = deferred<LaunchResult>()
    const { core } = startHarness({
      reaper,
      spawnLaunch: async () => ({
        result: control.promise,
        terminate: () => control.resolve({ status: "launched" }),
        terminateNow: () => control.resolve({ status: "launched" }),
        processGroupId: 99001,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-reap", spec }),
      }),
    )

    control.resolve({ status: "launched" })
    await waitForSessionMode(core, "home")

    expect(reapCalls).toEqual([{ pgid: 99001 }])

    const stream = await request(
      core,
      "/managed-launch/events?launchId=launch-reap",
      authorized(),
    )
    const lifecycle = parseSseEvents(await stream.text())
    const types = lifecycle.map(event => event.type)
    // child-exited must precede restoring; reaper runs during restoring,
    // home-ready terminal readiness must be last.
    const childExited = types.indexOf("child-exited")
    const restoring = types.indexOf("restoring")
    const homeReady = types.indexOf("home-ready")
    expect(childExited).toBeLessThan(restoring)
    expect(restoring).toBeLessThan(homeReady)
  })

  it("skips the reaper when the active launch has no process group", async () => {
    const reapCalls: ReapRequest[] = []
    const reaper: GamescopeReaper = async request => {
      reapCalls.push(request)
      return { reaped: [], residual: [] }
    }
    const { core } = startHarness({
      reaper,
      // runLaunch provides no processGroupId; this branch uses launcher.run
      // path which lacks a session handle entirely.
      launchResult: { status: "launched" },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      }),
    )
    // With no pgid, the reaper is still invoked but with pgid: undefined
    // so it returns a no-op. Sessiond never calls the reaper at all on
    // the blocking-launch path.
    expect(reapCalls).toEqual([])
  })

  it("writes status sidecar snapshots on every kiosk lifecycle transition", async () => {
    const snapshots: SessiondLifecycleSnapshot[] = []
    const sidecar: StatusSidecar = {
      write: async snapshot => {
        snapshots.push(snapshot)
      },
    }
    const injectedCore = createKorriSessiondCore({
      token,
      logger: silentLogger,
      statusSidecar: sidecar,
      launcher: { run: async () => ({ status: "launched" }) },
      renderer: {
        kind: "electrobun",
        launch: async () => ({
          pid: 200,
          command: { command: "electrobun", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
    })

    await injectedCore.handleRequest(
      new Request("http://127.0.0.1:3003/control/start", {
        method: "POST",
        headers: { "x-korri-sessiond-token": token },
      }),
    )

    const modes = snapshots.map(s => s.mode)
    expect(modes).toContain("starting")
    expect(modes).toContain("home")
  })

  it("translates state.mode='home' to the role's idleModeLabel in managed status", async () => {
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {},
      idleReadyEvidence: () => "idle-blank",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      token,
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))

    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()

    expect(body.mode).toBe("idle")
    expect(core.status().state.mode).toBe("home")
  })

  it("delegates idle target to injected SessionRole and emits the role's terminal readiness event", async () => {
    const calls: string[] = []
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {
        calls.push("enterIdle")
      },
      leaveIdle: async () => {
        calls.push("leaveIdle")
      },
      beforeChildLaunch: async () => {
        calls.push("beforeChildLaunch")
      },
      restoreIdleAfterLaunch: async () => {
        calls.push("restoreIdleAfterLaunch")
      },
      afterChildRunning: async () => {},
      reconcileIdle: async () => {
        calls.push("reconcileIdle")
      },
      idleReadyEvidence: () => "idle-blank-satisfied",
      rendererStatus: () => ({ kind: "noop" }),
    }

    const core = createKorriSessiondCore({
      token,
      logger: silentLogger,
      role,
      launcher: { run: async () => ({ status: "launched" }) },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    expect(calls).toContain("enterIdle")
    expect(core.status().state.mode).toBe("home")
    expect(core.status().renderer).toEqual({ kind: "noop" })

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-role", spec }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-role",
      authorized(),
    )
    const lifecycle = parseSseEvents(await streamResponse.text())
    const types = lifecycle.map(event => event.type)

    expect(types).toContain("idle-ready")
    expect(types).not.toContain("renderer-stopped")
    expect(types).not.toContain("home-ready")
    const idleReady = lifecycle.find(event => event.type === "idle-ready")
    expect(idleReady?.readiness).toEqual({
      status: "ok",
      evidence: "idle-blank-satisfied",
    })
    expect(calls).toContain("beforeChildLaunch")
    expect(calls).toContain("restoreIdleAfterLaunch")
  })

  // Phase 4D / Track A U4 -- session-lifecycle dispatch.

  it("advertises sessionLifecycle in managed-launch capabilities", async () => {
    const { core } = startHarness()
    await request(core, "/control/start", authorized({ method: "POST" }))
    const response = await request(core, "/managed-launch/status", authorized())
    const body = await response.json()
    expect(body.capabilities.sessionLifecycle).toBe(true)
  })

  it("emits launcher-exited + wait-monitor lifecycle for session+wait launches", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/steam-wait-monitor.sh",
      args: ["--pid-tree"],
    }
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => ({
        result:
          receivedSpec.command === waitSpec.command
            ? waitCtrl.promise
            : launcherCtrl.promise,
        terminate: () => {},
        terminateNow: () => {},
        processGroupId: receivedSpec.command === waitSpec.command ? 4242 : 1212,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    const start = await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-w",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    expect(await start.json()).toEqual({
      status: "accepted",
      launchId: "launch-w",
    })

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-w",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 5))
    waitCtrl.resolve({ status: "launched" })

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "wait-monitor-running",
      "wait-monitor-exited",
      "restoring",
      "home-ready",
    ])
  })

  it("anchors session+no-wait launches and resumes restoring after external terminate", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const { core } = startHarness({
      spawnLaunch: async () => ({
        result: launcherCtrl.promise,
        terminate: () => {},
        terminateNow: () => {},
        processGroupId: 1212,
      }),
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-a",
          spec,
          lifecycle: "session",
        }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-a",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    // Give sessiond time to emit launcher-exited + session-anchored before
    // we issue the terminate request.
    await new Promise(resolve => setTimeout(resolve, 10))
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-a" }),
      }),
    )

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "home-ready",
    ])
    const anchored = lifecycle.find(e => e.type === "session-anchored")
    expect(anchored?.readiness?.status).toBe("ok")
    expect(anchored?.readiness?.evidence).toContain("anchor holding")
  })

  it("degrades session+wait to anchor when wait monitor spawn throws", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/steam-wait-monitor.sh",
      args: [],
    }
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => {
        if (receivedSpec.command === waitSpec.command) {
          throw new Error("wait monitor spawn failed")
        }
        return {
          result: launcherCtrl.promise,
          terminate: () => {},
          terminateNow: () => {},
          processGroupId: 1212,
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-d",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )

    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-d",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 10))
    await request(
      core,
      "/managed-launch/terminate",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-d" }),
      }),
    )

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "launcher-exited",
      "session-anchored",
      "terminated",
      "restoring",
      "home-ready",
    ])
  })

  it("falls through to child-exited when session launcher exits non-zero", async () => {
    // Graceful degradation: under lifecycle: "session", a non-zero launcher
    // exit must NOT emit launcher-exited / wait-monitor / anchored. It
    // routes to the standard child-exited terminal path.
    const launcherCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = {
      command: "/bin/wait",
      args: [],
    }
    let waitSpawnCalls = 0
    const { core } = startHarness({
      spawnLaunch: async receivedSpec => {
        if (receivedSpec.command === waitSpec.command) {
          waitSpawnCalls += 1
        }
        return {
          result: launcherCtrl.promise,
          terminate: () => {},
          terminateNow: () => {},
          processGroupId: 1212,
        }
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "launch-f",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-f",
      authorized(),
    )
    const streamText = streamResponse.text()

    launcherCtrl.resolve({
      status: "failed",
      exitCode: 2,
      failureKind: "command-failed",
      stderrTail: "boom",
    })

    const lifecycle = parseSseEvents(await streamText)
    expect(lifecycle.map(e => e.type)).toEqual([
      "launch-accepted",
      "renderer-stopped",
      "child-running",
      "child-exited",
      "restoring",
      "home-ready",
    ])
    expect(waitSpawnCalls).toBe(0)
    expect(
      lifecycle.find(e => e.type === "child-exited")?.terminal?.exitCode,
    ).toBe(2)
  })

  it("emits session sub-phase to the status sidecar across a session+wait lifecycle", async () => {
    const snapshots: SessiondLifecycleSnapshot[] = []
    const sidecar: StatusSidecar = {
      write: async snapshot => {
        snapshots.push(snapshot)
      },
    }
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = { command: "/bin/wait", args: [] }
    const core = createKorriSessiondCore({
      token,
      logger: silentLogger,
      statusSidecar: sidecar,
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      renderer: {
        kind: "electrobun",
        launch: async () => ({
          pid: 200,
          command: { command: "electrobun", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async receivedSpec => ({
          status: "started" as const,
          result:
            receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise,
          session: {
            id: "child",
            processGroupId:
              receivedSpec.command === waitSpec.command ? 4242 : 1212,
            exited: (receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise
            ).then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })

    await request(core, "/control/start", authorized({ method: "POST" }))
    snapshots.length = 0
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "phase-1",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=phase-1",
      authorized(),
    )
    const streamText = streamResponse.text()
    launcherCtrl.resolve({ status: "launched" })
    await new Promise(resolve => setTimeout(resolve, 5))
    waitCtrl.resolve({ status: "launched" })
    await streamText

    const phases = snapshots
      .map(s => s.phase)
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
    // Must include the four interesting sub-phases in order.
    expect(phases).toContain("launching")
    expect(phases).toContain("running")
    expect(phases).toContain("wait-monitor")
    expect(phases).toContain("restoring")
    // launching must precede running which precedes wait-monitor which
    // precedes restoring.
    const indexOf = (p: (typeof phases)[number]) => phases.indexOf(p)
    expect(indexOf("launching")).toBeLessThan(indexOf("running"))
    expect(indexOf("running")).toBeLessThan(indexOf("wait-monitor"))
    expect(indexOf("wait-monitor")).toBeLessThan(indexOf("restoring"))
  })

  // Phase 4D / Track A finishing follow-up. Sessiond's /managed-launch/status
  // endpoint surfaces the same sub-phase the sidecar carries, so the
  // app.server.status RPC proxy can forward it without depending on the
  // sidecar JSON-on-disk path.

  it("surfaces the current sub-phase through /managed-launch/status during a session+wait lifecycle", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const waitCtrl = deferred<LaunchResult>()
    const waitSpec: LaunchSpec = { command: "/bin/wait", args: [] }
    const core = createKorriSessiondCore({
      token,
      logger: silentLogger,
      serviceManager: {
        maskEssway: async () => {},
        restoreEssway: async () => {},
      },
      renderer: {
        kind: "electrobun",
        launch: async () => ({
          pid: 200,
          command: { command: "electrobun", args: [] },
        }),
        stop: async () => {},
      },
      sway: {
        getKorriWindows: async () => [
          { id: 200, focused: true, fullscreen: true },
        ],
        applyDecisions: async () => [],
      },
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async receivedSpec => ({
          status: "started" as const,
          result:
            receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise,
          session: {
            id: "child",
            processGroupId:
              receivedSpec.command === waitSpec.command ? 4242 : 1212,
            exited: (receivedSpec.command === waitSpec.command
              ? waitCtrl.promise
              : launcherCtrl.promise
            ).then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })

    const readStatus = async () => {
      const res = await request(core, "/managed-launch/status", authorized())
      return (await res.json()) as {
        active?: { phase?: string; mode: string; launchId: string }
      }
    }

    const pollPhase = async (target: string | undefined, attempts = 40) => {
      for (let i = 0; i < attempts; i++) {
        const s = await readStatus()
        if (
          target === undefined
            ? s.active === undefined
            : s.active?.phase === target
        )
          return s
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      throw new Error(`phase '${target}' not observed in time`)
    }

    await request(core, "/control/start", authorized({ method: "POST" }))
    expect((await readStatus()).active).toBeUndefined()

    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          launchId: "phase-status-1",
          spec,
          lifecycle: "session",
          wait: waitSpec,
        }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=phase-status-1",
      authorized(),
    )
    const streamText = streamResponse.text()

    await pollPhase("running")
    launcherCtrl.resolve({ status: "launched" })
    await pollPhase("wait-monitor")
    waitCtrl.resolve({ status: "launched" })
    await streamText
    // Post-terminal: sessiond returns to idle/home and the active
    // payload is gone, so phase is naturally absent.
    await pollPhase(undefined)
  })

  it("fails the launch with host-unavailable when afterChildRunning throws", async () => {
    const launcherCtrl = deferred<LaunchResult>()
    const role: SessionRole = {
      id: "source-machine",
      idleModeLabel: "idle",
      idleReadyEventName: "idle-ready",
      emitsRendererStopped: false,
      enterIdle: async () => {},
      leaveIdle: async () => {},
      beforeChildLaunch: async () => {},
      restoreIdleAfterLaunch: async () => {},
      reconcileIdle: async () => {},
      afterChildRunning: async () => {
        throw new Error("gamescope window never appeared")
      },
      idleReadyEvidence: () => "idle-blank",
      rendererStatus: () => ({ kind: "noop" }),
    }
    const core = createKorriSessiondCore({
      token,
      logger: silentLogger,
      role,
      launcher: {
        run: async () => ({ status: "launched" }),
        spawn: async () => ({
          status: "started" as const,
          result: launcherCtrl.promise,
          session: {
            id: "sessiond-child",
            processGroupId: 1212,
            exited: launcherCtrl.promise.then(r => ({
              exitCode: r.status === "launched" ? 0 : r.exitCode,
            })),
            terminate: () => {},
            terminateNow: () => {},
          },
        }),
      },
    })
    await request(core, "/control/start", authorized({ method: "POST" }))
    await request(
      core,
      "/managed-launch",
      authorized({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launchId: "launch-h", spec }),
      }),
    )
    const streamResponse = await request(
      core,
      "/managed-launch/events?launchId=launch-h",
      authorized(),
    )
    const streamText = streamResponse.text()
    launcherCtrl.resolve({ status: "launched" })

    const lifecycle = parseSseEvents(await streamText)
    const childExited = lifecycle.find(e => e.type === "child-exited")
    expect(childExited?.terminal?.failureKind).toBe("host-unavailable")
    expect(childExited?.terminal?.stderrTail).toContain(
      "gamescope window never appeared",
    )
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForSessionMode(
  core: KorriSessiondCore,
  mode: ReturnType<KorriSessiondCore["status"]>["state"]["mode"],
) {
  for (let index = 0; index < 20; index += 1) {
    if (core.status().state.mode === mode) return
    await Promise.resolve()
  }
  expect(core.status().state.mode).toBe(mode)
}

function parseSseEvents(text: string): readonly SessiondManagedLaunchEvent[] {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map(chunk => {
      const data = chunk
        .split("\n")
        .find(line => line.startsWith("data: "))
        ?.slice("data: ".length)
      if (!data) throw new Error(`missing SSE data in ${chunk}`)
      return JSON.parse(data) as SessiondManagedLaunchEvent
    })
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
