import { describe, expect, test } from "bun:test"
import type { LocalStreamLaunchResponse } from "@app/stream/local-stream-launch-rpc"
import type { ConnectionServerRecord } from "./connection-state-snapshot"
import {
  createLaunchBridgeForegroundSessionOwner,
  createLocalStreamLaunchRpcHandler,
} from "./launch-bridge"

function postLocalLaunchRpc(payload: unknown): Request {
  return new Request("http://desktop.local/__korri/desktop/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      _tag: "Request",
      id: "0",
      tag: "app.desktop.launch",
      payload,
      traceId: "00000000000000000000000000000000",
      spanId: "0000000000000000",
      sampled: true,
      headers: [],
    }),
  })
}

const CONNECTED: ConnectionServerRecord = {
  hostId: "aka",
  controlUrl: "http://192.168.1.117:3001",
}

const CONNECTED_WITH_UNRESOLVABLE_ID: ConnectionServerRecord = {
  hostId: "living-room-server",
  controlUrl: "http://192.168.1.118:3001",
}

const CONNECTED_WITH_IPV6: ConnectionServerRecord = {
  hostId: "ipv6-server",
  controlUrl: "http://[fd00::1]:3001",
}

function createManagedSession(id = "session-child") {
  let resolveExit!: (value: { readonly exitCode: number | null }) => void
  const exited = new Promise<{ readonly exitCode: number | null }>(resolve => {
    resolveExit = resolve
  })
  return {
    id,
    processId: 4242,
    exited,
    terminate: () => undefined,
    terminateNow: () => undefined,
    resolveExit,
  }
}

function startedMoonlight(command = "moonlight") {
  return {
    status: "started" as const,
    command,
    session: createManagedSession(),
  }
}

function createPreparedLaunchBridgeHandler() {
  return createLocalStreamLaunchRpcHandler({
    getConnection: () => CONNECTED,
    prepareGame: async () => ({ status: "prepared", gameId: "noop" }),
    launchMoonlight: async () => startedMoonlight(),
  })
}

async function readRpcSuccess(
  response: Response,
): Promise<LocalStreamLaunchResponse> {
  expect(response.status).toBe(200)
  const [envelope] = (await response.json()) as Array<{
    readonly _tag: string
    readonly exit?: {
      readonly _tag: string
      readonly value?: LocalStreamLaunchResponse
    }
  }>
  expect(envelope?._tag).toBe("Exit")
  expect(envelope?.exit?._tag).toBe("Success")
  return envelope.exit?.value as LocalStreamLaunchResponse
}

async function readRpcFailure(response: Response): Promise<unknown> {
  expect(response.status).toBe(200)
  const [envelope] = (await response.json()) as Array<{
    readonly _tag: string
    readonly exit?: {
      readonly _tag: string
      readonly cause?: unknown
    }
  }>
  expect(envelope?._tag).toBe("Exit")
  expect(envelope?.exit?._tag).toBe("Failure")
  return envelope.exit?.cause
}

function createMoonlightHostRecorder() {
  let host: string | undefined
  return {
    launch: async (options: { readonly host: string }) => {
      host = options.host
      return startedMoonlight()
    },
    host: () => host,
  }
}

function createForegroundRepairRecorder(options: {
  readonly events: string[]
  readonly snapshotSurfaceIds: readonly number[]
  readonly repairedWindowId?: number
  readonly onRepair?: (ignoredWindowIds: readonly number[]) => void
  readonly onAbsence?: (input: {
    readonly ownedWindowIds: readonly number[]
    readonly ignoredWindowIds: readonly number[]
  }) => Promise<Record<string, unknown>>
}) {
  return {
    snapshotSurfaceIds: async () => {
      options.events.push("snapshot")
      return new Set(options.snapshotSurfaceIds)
    },
    repairSurface: async ({
      ignoredWindowIds,
    }: {
      readonly ignoredWindowIds: ReadonlySet<number>
    }) => {
      options.events.push("repair")
      options.onRepair?.([...ignoredWindowIds])
      return { windowId: options.repairedWindowId ?? 43 }
    },
    waitForSurfaceAbsence: async ({
      ownedWindowIds,
      ignoredWindowIds,
    }: {
      readonly ownedWindowIds: ReadonlySet<number>
      readonly ignoredWindowIds: ReadonlySet<number>
    }) => {
      options.events.push("absence")
      return options.onAbsence?.({
        ownedWindowIds: [...ownedWindowIds],
        ignoredWindowIds: [...ignoredWindowIds],
      })
    },
    probeCompositor: async () => {
      options.events.push("probe")
      return { ok: true, surfaceCount: 1 }
    },
  }
}

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index += 1) await Promise.resolve()
}

describe("desktop launch bridge", () => {
  test("reports host-unavailable when no upstream is connected", async () => {
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => undefined,
      prepareGame: async () => ({
        status: "prepared",
        gameId: "noop",
      }),
      launchMoonlight: async () => startedMoonlight(),
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    const body = await readRpcSuccess(response)
    expect(body.status).toBe("failed")
    if (body.status === "failed") expect(body.category).toBe("host-unavailable")
  })

  test("returns typed busy before any launch-path side effects while a session is running", async () => {
    const events: string[] = []
    const session = createManagedSession("active-child")
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => {
        events.push("connection")
        return CONNECTED
      },
      preflightMoonlightInput: async () => {
        events.push("preflight")
        return { status: "ok" }
      },
      resolveMoonlightGamescope: async () => {
        events.push("gamescope")
        return { enabled: false }
      },
      prepareGame: async (_controlUrl, id) => {
        events.push("prepare")
        return { status: "prepared", gameId: id }
      },
      moonlightForegroundRepair: createForegroundRepairRecorder({
        events,
        snapshotSurfaceIds: [10],
      }),
      launchMoonlight: async () => {
        events.push("launch")
        return { status: "started", command: "moonlight", session }
      },
    })

    await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/wario-land-4" })),
    )
    const busy = await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/metroid-fusion" })),
    )

    expect(busy.status).toBe("failed")
    if (busy.status === "failed") expect(busy.category).toBe("session-busy")
    expect(events).toEqual([
      "connection",
      "preflight",
      "gamescope",
      "prepare",
      "snapshot",
      "launch",
      "repair",
    ])
  })

  test("keeps launch busy after exit until foreground readiness passes", async () => {
    const events: string[] = []
    let absenceResolve!: () => void
    const absence = new Promise<Record<string, unknown>>(resolve => {
      absenceResolve = () => resolve({ gate: "surface", status: "absent" })
    })
    const session = createManagedSession("first-child")
    const absenceInputs: Array<{
      readonly ownedWindowIds: readonly number[]
      readonly ignoredWindowIds: readonly number[]
    }> = []
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      readinessCooldownMs: 0,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      moonlightForegroundRepair: createForegroundRepairRecorder({
        events,
        snapshotSurfaceIds: [42],
        repairedWindowId: 43,
        onAbsence: async input => {
          absenceInputs.push(input)
          return await absence
        },
      }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
        session,
      }),
    })

    await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/wario-land-4" })),
    )
    session.resolveExit({ exitCode: 0 })
    await flushMicrotasks()
    const busy = await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/metroid-fusion" })),
    )

    expect(busy.status).toBe("failed")
    if (busy.status === "failed") expect(busy.category).toBe("session-busy")
    expect(absenceInputs).toEqual([
      { ownedWindowIds: [43], ignoredWindowIds: [42] },
    ])

    absenceResolve()
    await flushMicrotasks()
    expect(events).toContain("probe")
  })

  test("uses unique request ids while preserving game id for repeated launches", async () => {
    const first = createManagedSession("first-child")
    const second = createManagedSession("second-child")
    const sessions = [first, second]
    const requestIds = ["request-1", "request-2"]
    const owner = createLaunchBridgeForegroundSessionOwner({
      getConnection: () => CONNECTED,
      createRequestId: () => requestIds.shift() ?? "fallback-request",
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
        session: sessions.shift() ?? createManagedSession("fallback-child"),
      }),
    })

    await owner.launch({ id: "gba/wario-land-4" })
    first.resolveExit({ exitCode: 0 })
    await flushMicrotasks()
    await owner.launch({ id: "gba/wario-land-4" })

    const acceptedEvents = owner
      .status()
      .events.filter(event => event._tag === "ForegroundSessionLaunchAccepted")
    expect(acceptedEvents).toEqual([
      {
        _tag: "ForegroundSessionLaunchAccepted",
        requestId: "request-1",
        gameId: "gba/wario-land-4",
      },
      {
        _tag: "ForegroundSessionLaunchAccepted",
        requestId: "request-2",
        gameId: "gba/wario-land-4",
      },
    ])
    second.resolveExit({ exitCode: 0 })
  })

  test("accepts a later launch after the managed session exits", async () => {
    const first = createManagedSession("first-child")
    const second = createManagedSession("second-child")
    const sessions = [first, second]
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
        session: sessions.shift() ?? createManagedSession("fallback-child"),
      }),
    })

    const firstResponse = await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/wario-land-4" })),
    )
    const busy = await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/metroid-fusion" })),
    )
    first.resolveExit({ exitCode: 0 })
    await flushMicrotasks()
    const secondResponse = await readRpcSuccess(
      await handler(postLocalLaunchRpc({ id: "gba/metroid-fusion" })),
    )

    expect(firstResponse.status).toBe("launched")
    expect(busy.status).toBe("failed")
    if (busy.status === "failed") expect(busy.category).toBe("session-busy")
    expect(secondResponse.status).toBe("launched")
  })

  test("typed RPC handler schema-decodes and launches the selected game id", async () => {
    let prepareCallGameId: string | undefined
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (_controlUrl, id) => {
        prepareCallGameId = id
        return { status: "prepared", gameId: id }
      },
      launchMoonlight: async () => startedMoonlight(),
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    await readRpcSuccess(response)
    expect(prepareCallGameId).toBe("gba/wario-land-4")
  })

  test("prepares then launches moonlight pointed at the reachable connected address", async () => {
    let prepareCallControlUrl: string | undefined
    let prepareCallGameId: string | undefined
    let moonlightCallHost: string | undefined
    let moonlightGamescope: unknown

    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (controlUrl, id) => {
        prepareCallControlUrl = controlUrl
        prepareCallGameId = id
        return { status: "prepared", gameId: id, sessionId: "sess-1" }
      },
      resolveMoonlightGamescope: async () => ({ enabled: false }),
      launchMoonlight: async opts => {
        moonlightCallHost = opts.host
        moonlightGamescope = opts.gamescope
        return startedMoonlight()
      },
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    expect(prepareCallControlUrl).toBe(CONNECTED.controlUrl)
    expect(prepareCallGameId).toBe("gba/wario-land-4")
    expect(moonlightCallHost).toBe("192.168.1.117")
    expect(moonlightGamescope).toEqual({ enabled: false })

    const body = await readRpcSuccess(response)
    expect(body.status).toBe("launched")
    if (body.status === "launched") {
      expect(body.gameId).toBe("gba/wario-land-4")
      expect(body.sessionId).toBe("sess-1")
      expect(body.moonlightCommand).toBe("moonlight")
    }
  })

  test("uses the control URL host for moonlight even when hostId is only identity", async () => {
    const moonlight = createMoonlightHostRecorder()
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED_WITH_UNRESOLVABLE_ID,
      prepareGame: async (controlUrl, id) => {
        expect(controlUrl).toBe(CONNECTED_WITH_UNRESOLVABLE_ID.controlUrl)
        return { status: "prepared", gameId: id, sessionId: "sess-addr" }
      },
      launchMoonlight: moonlight.launch,
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    await readRpcSuccess(response)
    expect(moonlight.host()).toBe("192.168.1.118")
  })

  test("normalizes IPv6 control URL hosts before invoking moonlight", async () => {
    const moonlight = createMoonlightHostRecorder()
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED_WITH_IPV6,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      launchMoonlight: moonlight.launch,
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    await readRpcSuccess(response)
    expect(moonlight.host()).toBe("fd00::1")
  })

  test("fails local input preflight before preparing the remote stream", async () => {
    let prepareCalled = false
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      preflightMoonlightInput: async () => ({
        status: "failed",
        category: "input-unavailable",
        message: "InputPlumber virtual gamepad not found",
      }),
      prepareGame: async () => {
        prepareCalled = true
        return { status: "prepared", gameId: "gba/wario-land-4" }
      },
      launchMoonlight: async () => {
        throw new Error(
          "moonlight should not launch when input preflight fails",
        )
      },
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    expect(prepareCalled).toBe(false)
    const body = await readRpcSuccess(response)
    expect(body.status).toBe("failed")
    if (body.status === "failed") {
      expect(body.category).toBe("input-unavailable")
      expect(body.message).toContain("InputPlumber")
    }
  })

  test("forwards prepare-failure categories to the renderer", async () => {
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async () => ({
        status: "failed",
        category: "no-such-game",
        message: "Unknown game id: gba/zzz",
      }),
      launchMoonlight: async () => {
        throw new Error("moonlight should not be called when prepare fails")
      },
    })

    const response = await handler(postLocalLaunchRpc({ id: "gba/zzz" }))

    const body = await readRpcSuccess(response)
    expect(body.status).toBe("failed")
    if (body.status === "failed") {
      expect(body.category).toBe("no-such-game")
      expect(body.message).toContain("Unknown game id")
    }
  })

  test("repairs the local Moonlight foreground surface after launch", async () => {
    const events: string[] = []
    let repairedIgnoredWindowIds: readonly number[] = []

    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      moonlightForegroundRepair: createForegroundRepairRecorder({
        events,
        snapshotSurfaceIds: [10, 11],
        onRepair: ignoredWindowIds => {
          repairedIgnoredWindowIds = ignoredWindowIds
        },
      }),
      launchMoonlight: async () => {
        events.push("launch")
        return startedMoonlight()
      },
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    await readRpcSuccess(response)
    expect(events).toEqual(["snapshot", "launch", "repair"])
    expect(repairedIgnoredWindowIds).toEqual([10, 11])
  })

  test("does not repair the foreground surface when Moonlight fails to start", async () => {
    const events: string[] = []

    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      moonlightForegroundRepair: createForegroundRepairRecorder({
        events,
        snapshotSurfaceIds: [10],
      }),
      launchMoonlight: async () => {
        events.push("launch")
        return { status: "failed", message: "moonlight not installed" }
      },
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    await readRpcSuccess(response)
    expect(events).toEqual(["snapshot", "launch"])
  })

  test("reports prepared-no-moonlight when Moonlight starts without a managed session handle", async () => {
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async () => ({
        status: "prepared",
        gameId: "gba/wario-land-4",
        sessionId: "sess-without-handle",
      }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    const body = await readRpcSuccess(response)
    expect(body.status).toBe("prepared-no-moonlight")
    if (body.status === "prepared-no-moonlight") {
      expect(body.sessionId).toBe("sess-without-handle")
      expect(body.message).toContain("managed session handle")
    }
  })

  test("reports prepared-no-moonlight when prepare succeeds but moonlight does not start", async () => {
    const handler = createLocalStreamLaunchRpcHandler({
      getConnection: () => CONNECTED,
      prepareGame: async () => ({
        status: "prepared",
        gameId: "gba/wario-land-4",
        sessionId: "sess-2",
      }),
      launchMoonlight: async () => ({
        status: "failed",
        message: "moonlight not installed",
      }),
    })

    const response = await handler(
      postLocalLaunchRpc({ id: "gba/wario-land-4" }),
    )

    const body = await readRpcSuccess(response)
    expect(body.status).toBe("prepared-no-moonlight")
    if (body.status === "prepared-no-moonlight") {
      expect(body.gameId).toBe("gba/wario-land-4")
      expect(body.message).toContain("moonlight not installed")
    }
  })

  test("rejects requests missing an id at the schema boundary", async () => {
    const handler = createPreparedLaunchBridgeHandler()

    const response = await handler(postLocalLaunchRpc({}))

    expect(await readRpcFailure(response)).toBeDefined()
  })

  test("rejects empty ids at the schema boundary", async () => {
    const handler = createPreparedLaunchBridgeHandler()

    const response = await handler(postLocalLaunchRpc({ id: "" }))

    expect(await readRpcFailure(response)).toBeDefined()
  })
})
