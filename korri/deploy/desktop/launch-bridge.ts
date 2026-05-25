/**
 * Renderer\u2192bun launch bridge.
 *
 * The desktop renderer cannot spawn local processes (it lives in a
 * webview) and the launch flow needs two server-side actions in
 * sequence:
 *
 *   1. Tell the connected korri-server to prepare a stream-launch
 *      (writes a launch intent for the host's game-stream-runner
 *      sunshine app).
 *   2. Spawn Moonlight on *this* device pointed at the connected host
 *      so the just-prepared game's stream is visible.
 *
 * Both happen here on the bun side. The renderer just POSTs:
 *
 *   POST /__korri/desktop/launch  { id: "gba/wario-land-4" }
 *
 * and gets back a structured `LaunchBridgeResponse`.
 *
 * The handler factory takes its dependencies (getConnection,
 * prepareGame, launchMoonlight) as injectable arguments so the bun
 * wiring lives in main.ts and the unit tests can substitute
 * deterministic fakes.
 */

import type {
  MoonlightLaunchOptions,
  MoonlightLaunchResult,
} from "@app/stream/moonlight-launcher"
import type { RemotePrepareResult } from "@app/stream/remote-stream-client"
import { logger } from "@shared/logger"
import type { ConnectionServerRecord } from "./connection-state-snapshot"

export type LaunchBridgeResponse =
  | {
      readonly status: "launched"
      readonly gameId: string
      readonly sessionId?: string
      readonly moonlightCommand: string
    }
  | {
      readonly status: "prepared-no-moonlight"
      readonly gameId: string
      readonly sessionId?: string
      readonly message: string
    }
  | {
      readonly status: "failed"
      readonly category:
        | "host-unavailable"
        | "host-control-disabled"
        | "no-such-game"
        | "prepare-failed"
        | "input-unavailable"
        | "input-ambiguous"
      readonly message: string
    }

export type MoonlightInputPreflightResult =
  | { readonly status: "ok" }
  | {
      readonly status: "failed"
      readonly category: "input-unavailable" | "input-ambiguous"
      readonly message: string
    }

export interface MoonlightForegroundRepair {
  readonly snapshotSurfaceIds: () => Promise<ReadonlySet<number>>
  readonly repairSurface: (options: {
    readonly ignoredWindowIds: ReadonlySet<number>
  }) => Promise<void>
}

export interface LaunchBridgeOptions {
  /**
   * Returns the currently-connected server (hostId + controlUrl), or
   * undefined if the connection controller has not reached the
   * `connected` state. The handler reads this on every request so a
   * reconnection or disconnect between renderer launches is reflected
   * without restart.
   */
  readonly getConnection: () => ConnectionServerRecord | undefined

  /**
   * Optional local input preflight. Appliance builds use this to fail before
   * preparing a remote stream when the normalized InputPlumber controller is
   * unavailable or ambiguous.
   */
  readonly preflightMoonlightInput?: () => Promise<MoonlightInputPreflightResult>

  /**
   * Calls `app.server.stream.prepare` (with the legacy fallback) on the
   * given host. The product-layer `@app/stream/remote-stream-client`
   * exposes this as `RemoteStreamControlClient.prepareGame`; the
   * indirection here lets tests inject a deterministic fake.
   */
  readonly prepareGame: (
    controlUrl: string,
    gameId: string,
  ) => Promise<RemotePrepareResult>

  /**
   * Spawns Moonlight locally pointed at the given Korri host. The
   * product-layer `@app/stream/moonlight-launcher` exposes this as
   * `launchMoonlight`; the indirection lets tests inject a
   * deterministic fake.
   */
  readonly resolveMoonlightGamescope?: () => Promise<
    NonNullable<MoonlightLaunchOptions["gamescope"]>
  >

  readonly launchMoonlight: (options: {
    readonly host: string
    readonly gamescope?: MoonlightLaunchOptions["gamescope"]
  }) => Promise<MoonlightLaunchResult>

  /**
   * Optional local compositor repair for the Moonlight foreground surface.
   * Appliance builds wire this to Sway; tests inject a deterministic fake.
   */
  readonly moonlightForegroundRepair?: MoonlightForegroundRepair
}

/**
 * Hono-compatible request handler. Lives at `POST
 * /__korri/desktop/launch` in the desktop app composition.
 */
export function createLaunchBridgeHandler(
  options: LaunchBridgeOptions,
): (request: Request) => Promise<Response> {
  return async request => {
    const id = await readGameId(request)
    if (!id) return jsonResponse(400, { error: "missing or invalid id" })

    const connection = options.getConnection()
    if (!connection) {
      logger.warn({ id }, "launch-bridge: refused \u2014 no connected upstream")
      return jsonResponse(503, {
        status: "failed",
        category: "host-unavailable",
        message: "No connected Korri host",
      } satisfies LaunchBridgeResponse)
    }

    const inputPreflight = await options.preflightMoonlightInput?.()
    if (inputPreflight?.status === "failed") {
      logger.warn(
        { id, host: connection.hostId, category: inputPreflight.category },
        "launch-bridge: refused — local normalized input unavailable",
      )
      return jsonResponse(200, {
        status: "failed",
        category: inputPreflight.category,
        message: inputPreflight.message,
      } satisfies LaunchBridgeResponse)
    }

    let moonlightGamescope: MoonlightLaunchOptions["gamescope"]
    try {
      moonlightGamescope = await options.resolveMoonlightGamescope?.()
    } catch (error) {
      logger.warn(
        { id, host: connection.hostId, err: error },
        "launch-bridge: local moonlight Gamescope policy resolution failed; using product default",
      )
    }

    let prepare: RemotePrepareResult
    try {
      prepare = await options.prepareGame(connection.controlUrl, id)
    } catch (error) {
      const message = errorMessage(error) ?? "prepare-stream call failed"
      logger.warn(
        { id, host: connection.hostId, err: error },
        "launch-bridge: prepareGame threw",
      )
      return jsonResponse(200, {
        status: "failed",
        category: "prepare-failed",
        message,
      } satisfies LaunchBridgeResponse)
    }

    if (prepare.status === "failed") {
      logger.warn(
        {
          id,
          host: connection.hostId,
          category: prepare.category,
          message: prepare.message,
        },
        "launch-bridge: prepare failed",
      )
      return jsonResponse(200, {
        status: "failed",
        category: prepare.category,
        message: prepare.message,
      } satisfies LaunchBridgeResponse)
    }

    let ignoredForegroundSurfaceIds: ReadonlySet<number> | undefined
    if (options.moonlightForegroundRepair) {
      try {
        ignoredForegroundSurfaceIds =
          await options.moonlightForegroundRepair.snapshotSurfaceIds()
      } catch (error) {
        logger.warn(
          { id, host: connection.hostId, err: error },
          "launch-bridge: skipped Moonlight foreground repair after snapshot failure",
        )
      }
    }

    const moonlight = await options.launchMoonlight({
      host: moonlightHostForConnection(connection),
      gamescope: moonlightGamescope,
    })

    if (moonlight.status === "failed") {
      logger.warn(
        {
          id,
          host: connection.hostId,
          sessionId: prepare.sessionId,
          message: moonlight.message,
        },
        "launch-bridge: prepared but moonlight could not start",
      )
      return jsonResponse(200, {
        status: "prepared-no-moonlight",
        gameId: prepare.gameId,
        ...(prepare.sessionId ? { sessionId: prepare.sessionId } : {}),
        message: moonlight.message,
      } satisfies LaunchBridgeResponse)
    }

    if (options.moonlightForegroundRepair && ignoredForegroundSurfaceIds) {
      try {
        await options.moonlightForegroundRepair.repairSurface({
          ignoredWindowIds: ignoredForegroundSurfaceIds,
        })
      } catch (error) {
        logger.warn(
          {
            id,
            host: connection.hostId,
            sessionId: prepare.sessionId,
            err: error,
          },
          "launch-bridge: Moonlight started but foreground repair failed",
        )
      }
    }

    logger.info(
      {
        id,
        host: connection.hostId,
        sessionId: prepare.sessionId,
        moonlight: moonlight.command,
      },
      "launch-bridge: launched",
    )
    return jsonResponse(200, {
      status: "launched",
      gameId: prepare.gameId,
      ...(prepare.sessionId ? { sessionId: prepare.sessionId } : {}),
      moonlightCommand: moonlight.command,
    } satisfies LaunchBridgeResponse)
  }
}

async function readGameId(request: Request): Promise<string | undefined> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return undefined
  }
  if (typeof body !== "object" || body === null) return undefined
  const id = (body as { id?: unknown }).id
  return typeof id === "string" && id.length > 0 ? id : undefined
}

function moonlightHostForConnection(
  connection: ConnectionServerRecord,
): string {
  try {
    const hostname =
      new URL(connection.controlUrl).hostname || connection.hostId
    return hostname.replace(/^\[(.*)\]$/, "$1")
  } catch {
    return connection.hostId
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return undefined
}
