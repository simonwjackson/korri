import { describe, expect, it } from "bun:test"
import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"
import type { SessiondManagedLaunchEvent } from "@shared/library/sessiond-managed-launch-protocol"
import { createKorriSessiondCore, type KorriSessiondCore } from "./sessiond"
import type { KorriWindowSnapshot } from "./sessiond-state"

const token = "test-token"
const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

function startHarness(
  options: {
    readonly windows?: readonly KorriWindowSnapshot[]
    readonly launchResult?: LaunchResult
    readonly failRendererLaunch?: boolean
    readonly runLaunch?: (spec: LaunchSpec) => Promise<LaunchResult>
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
        events.push("launch-electrobun")
        if (options.failRendererLaunch) throw new Error("renderer failed")
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
    },
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
