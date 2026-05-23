import { describe, expect, test } from "bun:test"
import type { ConnectionServerRecord } from "./connection-state-bridge"
import {
  createLaunchBridgeHandler,
  type LaunchBridgeResponse,
} from "./launch-bridge"

function postJson(body: unknown): Request {
  return new Request("http://desktop.local/__korri/desktop/launch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

describe("desktop launch bridge", () => {
  test("returns 503 when no upstream is connected", async () => {
    const handler = createLaunchBridgeHandler({
      getConnection: () => undefined,
      prepareGame: async () => ({
        status: "prepared",
        gameId: "noop",
      }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
    })

    const response = await handler(postJson({ id: "gba/wario-land-4" }))

    expect(response.status).toBe(503)
    const body = (await response.json()) as LaunchBridgeResponse
    expect(body.status).toBe("failed")
    if (body.status === "failed") expect(body.category).toBe("host-unavailable")
  })

  test("returns 400 on a malformed body", async () => {
    const handler = createLaunchBridgeHandler({
      getConnection: () => CONNECTED,
      prepareGame: async () => ({ status: "prepared", gameId: "noop" }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
    })

    const response = await handler(
      new Request("http://desktop.local/__korri/desktop/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    )

    expect(response.status).toBe(400)
  })

  test("prepares then launches moonlight pointed at the reachable connected address", async () => {
    let prepareCallControlUrl: string | undefined
    let prepareCallGameId: string | undefined
    let moonlightCallHost: string | undefined

    const handler = createLaunchBridgeHandler({
      getConnection: () => CONNECTED,
      prepareGame: async (controlUrl, id) => {
        prepareCallControlUrl = controlUrl
        prepareCallGameId = id
        return { status: "prepared", gameId: id, sessionId: "sess-1" }
      },
      launchMoonlight: async opts => {
        moonlightCallHost = opts.host
        return { status: "started", command: "moonlight" }
      },
    })

    const response = await handler(postJson({ id: "gba/wario-land-4" }))

    expect(prepareCallControlUrl).toBe(CONNECTED.controlUrl)
    expect(prepareCallGameId).toBe("gba/wario-land-4")
    expect(moonlightCallHost).toBe("192.168.1.117")

    expect(response.status).toBe(200)
    const body = (await response.json()) as LaunchBridgeResponse
    expect(body.status).toBe("launched")
    if (body.status === "launched") {
      expect(body.gameId).toBe("gba/wario-land-4")
      expect(body.sessionId).toBe("sess-1")
      expect(body.moonlightCommand).toBe("moonlight")
    }
  })

  test("uses the control URL host for moonlight even when hostId is only identity", async () => {
    let moonlightCallHost: string | undefined
    const handler = createLaunchBridgeHandler({
      getConnection: () => CONNECTED_WITH_UNRESOLVABLE_ID,
      prepareGame: async (controlUrl, id) => {
        expect(controlUrl).toBe(CONNECTED_WITH_UNRESOLVABLE_ID.controlUrl)
        return { status: "prepared", gameId: id, sessionId: "sess-addr" }
      },
      launchMoonlight: async opts => {
        moonlightCallHost = opts.host
        return { status: "started", command: "moonlight" }
      },
    })

    const response = await handler(postJson({ id: "gba/wario-land-4" }))

    expect(response.status).toBe(200)
    expect(moonlightCallHost).toBe("192.168.1.118")
  })

  test("normalizes IPv6 control URL hosts before invoking moonlight", async () => {
    let moonlightCallHost: string | undefined
    const handler = createLaunchBridgeHandler({
      getConnection: () => CONNECTED_WITH_IPV6,
      prepareGame: async (_controlUrl, id) => ({
        status: "prepared",
        gameId: id,
      }),
      launchMoonlight: async opts => {
        moonlightCallHost = opts.host
        return { status: "started", command: "moonlight" }
      },
    })

    const response = await handler(postJson({ id: "gba/wario-land-4" }))

    expect(response.status).toBe(200)
    expect(moonlightCallHost).toBe("fd00::1")
  })

  test("forwards prepare-failure categories to the renderer", async () => {
    const handler = createLaunchBridgeHandler({
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

    const response = await handler(postJson({ id: "gba/zzz" }))

    expect(response.status).toBe(200)
    const body = (await response.json()) as LaunchBridgeResponse
    expect(body.status).toBe("failed")
    if (body.status === "failed") {
      expect(body.category).toBe("no-such-game")
      expect(body.message).toContain("Unknown game id")
    }
  })

  test("reports prepared-no-moonlight when prepare succeeds but moonlight does not start", async () => {
    const handler = createLaunchBridgeHandler({
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

    const response = await handler(postJson({ id: "gba/wario-land-4" }))

    expect(response.status).toBe(200)
    const body = (await response.json()) as LaunchBridgeResponse
    expect(body.status).toBe("prepared-no-moonlight")
    if (body.status === "prepared-no-moonlight") {
      expect(body.gameId).toBe("gba/wario-land-4")
      expect(body.message).toContain("moonlight not installed")
    }
  })

  test("rejects requests missing an id", async () => {
    const handler = createLaunchBridgeHandler({
      getConnection: () => CONNECTED,
      prepareGame: async () => ({ status: "prepared", gameId: "noop" }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
    })

    const response = await handler(postJson({}))

    expect(response.status).toBe(400)
  })
})
