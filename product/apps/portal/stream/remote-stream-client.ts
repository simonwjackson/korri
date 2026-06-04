/**
 * Korri stream control client.
 *
 * Wraps the Effect RPC client against a remote Korri host’s control
 * plane (`/api/rpc`) with the streaming-launch flow:
 *
 *   listSourceGames → sourceStatus → prepareGame(gameId)
 *
 * `prepareGame` calls `app.server.stream.prepare` first and falls back
 * to the legacy `app.stream.prepare` so older hosts still work. On
 * success the host has written a launch intent for its game-stream
 * runner (sunshine app) to pick up. Pair with `launchMoonlight()` to
 * connect locally.
 *
 * Originally lived in `product/apps/cli/`; promoted to `@product/apps/portal/stream/` (a
 * product-layer module, since it knows the app RPC schemas) so the
 * desktop’s launch bridge can share it without depending on CLI code.
 * The `product/apps/cli/remote-stream-control-client.ts` file is a re-export
 * shim during the migration window.
 */

import { rpcProtocolHttpLayer } from "@platform/api/rpc/client-layer"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { EphemeralOverride } from "@platform/library/config/ephemeral-override"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { serverRpcGroup } from "@product/apps/portal/api/server/rpc-group"
import { Cause, Effect, Exit, type Layer, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export type RemoteStreamControlFailureCategory =
  | "host-unavailable"
  | "host-control-disabled"
  | "no-such-game"
  | "prepare-failed"

export type RemotePrepareResult =
  | {
      readonly status: "prepared"
      readonly gameId: string
      readonly sessionId?: string
      readonly intentPath?: string
    }
  | {
      readonly status: "failed"
      readonly category: RemoteStreamControlFailureCategory
      readonly message: string
    }

export interface RemoteSourceGame {
  readonly id: string
  readonly displayName: string
  readonly streamable: boolean
  readonly source?: {
    readonly hostId: string
    readonly controlUrl: string
    readonly isLocal: boolean
  }
}

type RemoteRunnerMode =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "failed"

export type RemoteSourceStatus =
  | {
      readonly status: "available"
      readonly streamControl: "enabled"
      readonly catalog: "available"
      readonly runnerMode?: RemoteRunnerMode
      readonly message?: string
    }
  | {
      readonly status: "stream-unavailable"
      readonly streamControl: "disabled"
      readonly catalog: "unavailable"
      readonly runnerMode?: RemoteRunnerMode
      readonly message?: string
    }
  | {
      readonly status: "unavailable"
      readonly message: string
    }

export interface RemotePrepareOptions {
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface RemoteStreamControlClient {
  readonly listGames: () => Promise<readonly ResolvedGameRecord[]>
  readonly listSourceGames: () => Promise<readonly RemoteSourceGame[]>
  readonly sourceStatus: () => Promise<RemoteSourceStatus>
  readonly prepareGame: (
    gameId: string,
    options?: RemotePrepareOptions,
  ) => Promise<RemotePrepareResult>
}

export interface RemoteStreamControlClientOptions {
  readonly timeoutMs?: number
}

export function createRemoteStreamControlClient(
  baseUrl: string,
  options: RemoteStreamControlClientOptions = {},
): RemoteStreamControlClient {
  const rpcUrl = rpcUrlForBase(baseUrl)
  const layer = rpcProtocolHttpLayer(rpcUrl)

  const runRpc = <T>(
    effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
  ): Promise<T> =>
    withTimeout(
      Effect.runPromise(
        Effect.scoped(
          effect.pipe(Effect.provide(layer)) as Effect.Effect<
            T,
            unknown,
            never
          >,
        ),
      ),
      options.timeoutMs,
    )

  return {
    listGames: async () =>
      await runRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.library.list"]({})),
          Effect.map(response => response.games),
          Effect.mapError(toHostUnavailable),
        ),
      ),

    listSourceGames: async () =>
      await runRpc(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client => client["app.source.list"]({})),
          Effect.map(response => response.games),
          Effect.mapError(toHostUnavailable),
        ),
      ),

    sourceStatus: async () => {
      try {
        return await runRpc(serverStatusEffect())
      } catch {
        try {
          return await runRpc(sourceStatusEffect())
        } catch (error) {
          return {
            status: "unavailable",
            message: errorMessage(error) ?? "Korri stream host is unavailable",
          }
        }
      }
    },

    prepareGame: async (gameId, prepareOptions) => {
      const serverExit = await runPrepareExit(
        layer,
        gameId,
        prepareOptions,
        options.timeoutMs,
      )
      if (Exit.isSuccess(serverExit)) {
        return {
          status: "prepared",
          gameId: serverExit.value.gameId,
          sessionId: serverExit.value.sessionId,
        }
      }

      const legacyExit = await runLegacyPrepareExit(
        layer,
        gameId,
        prepareOptions,
        options.timeoutMs,
      )
      if (Exit.isSuccess(legacyExit)) {
        return {
          status: "prepared",
          gameId: legacyExit.value.gameId,
          intentPath: legacyExit.value.intentPath,
        }
      }

      return failedFromUnknown(Cause.squash(legacyExit.cause))
    },
  }
}

function serverStatusEffect() {
  return RpcClient.make(serverRpcGroup).pipe(
    Effect.flatMap(client => client["app.server.status"]({})),
    Effect.map(response => {
      const extras = {
        ...(response.runner?.mode ? { runnerMode: response.runner.mode } : {}),
        ...(response.message ? { message: response.message } : {}),
      }
      return response.status === "available"
        ? {
            status: "available" as const,
            streamControl: "enabled" as const,
            catalog: "available" as const,
            ...extras,
          }
        : {
            status: "stream-unavailable" as const,
            streamControl: "disabled" as const,
            catalog: "unavailable" as const,
            ...extras,
          }
    }),
    Effect.mapError(toHostUnavailable),
  )
}

function sourceStatusEffect() {
  return RpcClient.make(appRpcGroup).pipe(
    Effect.flatMap(client => client["app.source.status"]({})),
    Effect.map(response => {
      const extras = {
        ...(response.runnerMode ? { runnerMode: response.runnerMode } : {}),
        ...(response.message ? { message: response.message } : {}),
      }
      return response.status === "available"
        ? {
            status: "available" as const,
            streamControl: "enabled" as const,
            catalog: "available" as const,
            ...extras,
          }
        : {
            status: "stream-unavailable" as const,
            streamControl: "disabled" as const,
            catalog: "unavailable" as const,
            ...extras,
          }
    }),
    Effect.mapError(toHostUnavailable),
  )
}

function runPrepareExit(
  layer: Layer.Layer<RpcClient.Protocol>,
  gameId: string,
  options: RemotePrepareOptions | undefined,
  timeoutMs: number | undefined,
) {
  return withTimeout(
    Effect.runPromiseExit(
      Effect.scoped(
        RpcClient.make(serverRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.server.stream.prepare"]({
              id: gameId,
              userId: options?.userId,
              presetId: options?.presetId,
              override: options?.override,
            }),
          ),
          Effect.provide(layer),
        ),
      ),
    ),
    timeoutMs,
  )
}

function runLegacyPrepareExit(
  layer: Layer.Layer<RpcClient.Protocol>,
  gameId: string,
  options: RemotePrepareOptions | undefined,
  timeoutMs: number | undefined,
) {
  return withTimeout(
    Effect.runPromiseExit(
      Effect.scoped(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream.prepare"]({
              id: gameId,
              userId: options?.userId,
              presetId: options?.presetId,
              override: options?.override,
            }),
          ),
          Effect.provide(layer),
        ),
      ),
    ),
    timeoutMs,
  )
}

function rpcUrlForBase(baseUrl: string): string {
  const absolute = new URL("/api/rpc", baseUrl)
  if (
    typeof window !== "undefined" &&
    window.location?.origin === absolute.origin
  ) {
    return "/api/rpc"
  }
  return absolute.toString()
}

function toHostUnavailable(error: unknown): Error {
  return new Error(errorMessage(error) ?? "Korri stream host is unavailable")
}

function failedFromUnknown(error: unknown): RemotePrepareResult {
  const message = errorMessage(error) ?? "Could not prepare remote stream"
  if (message.includes("Unknown game id")) {
    return { status: "failed", category: "no-such-game", message }
  }
  if (message.includes("stream control is not enabled")) {
    return { status: "failed", category: "host-control-disabled", message }
  }
  if (message.includes("fetch") || message.includes("ECONNREFUSED")) {
    return { status: "failed", category: "host-unavailable", message }
  }
  return { status: "failed", category: "prepare-failed", message }
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return undefined
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs) return await promise
  let timeout: Timer | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Korri stream host timed out")),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
