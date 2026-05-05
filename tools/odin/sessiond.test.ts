import { describe, expect, it } from "bun:test"
import type { LaunchResult, LaunchSpec } from "@shared/library/launcher"
import { createKorriSessiondCore, type KorriSessiondCore } from "./sessiond"
import type { KorriWindowSnapshot } from "./sessiond-state"

const token = "test-token"
const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

function startHarness(
  options: {
    readonly windows?: readonly KorriWindowSnapshot[]
    readonly launchResult?: LaunchResult
    readonly failChromiumLaunch?: boolean
    readonly rendererKind?: string
  } = {},
) {
  const events: string[] = []
  let chromiumPid = 100
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
      kind: options.rendererKind ?? "chromium",
      launch: async () => {
        events.push(`launch-${options.rendererKind ?? "chromium"}`)
        if (options.failChromiumLaunch) throw new Error("chromium failed")
        chromiumPid += 1
        windows = [{ id: chromiumPid, focused: true, fullscreen: true }]
        return {
          pid: chromiumPid,
          command: { command: options.rendererKind ?? "chromium", args: [] },
        }
      },
      stop: async pid => {
        events.push(
          `stop-${options.rendererKind ?? "chromium"}:${pid ?? "none"}`,
        )
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
  it("starts Korri mode by masking ES, launching Chromium, and entering home", async () => {
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
    expect(events).toContain("launch-chromium")
  })

  it("rejects unauthenticated control requests without changing state", async () => {
    const { core, events } = startHarness()

    const response = await request(core, "/control/start", { method: "POST" })

    expect(response.status).toBe(401)
    expect(events).toEqual([])
    expect(core.status().state.mode).toBe("stopped")
  })

  it("launches a game under session control and restores Chromium afterward", async () => {
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
    expect(body.renderer).toEqual({ kind: "chromium", pid: 102 })
    expect(events).toContain("stop-chromium:101")
    expect(events).toContain("launch-game:/bin/game")
    expect(events.filter(event => event === "launch-chromium")).toHaveLength(2)
  })

  it("restores Chromium even when the game exits non-zero", async () => {
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
    expect(events.filter(event => event === "launch-chromium")).toHaveLength(2)
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

  it("supports a non-Chromium renderer without exposing chromiumPid", async () => {
    const { core, events } = startHarness({ rendererKind: "electrobun" })

    const response = await request(
      core,
      "/control/start",
      authorized({ method: "POST" }),
    )
    const body = await response.json()

    expect(body.renderer).toEqual({ kind: "electrobun", pid: 101 })
    expect(body.chromiumPid).toBeUndefined()
    expect(events).toContain("launch-electrobun")
  })

  it("stops Korri mode by stopping Chromium and restoring ES", async () => {
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
    expect(events).toContain("stop-chromium:101")
  })
})

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
