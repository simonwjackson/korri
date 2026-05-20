import { appRpcGroup } from "@app/api/app-rpc-group"
import { serverRpcGroup } from "@app/api/server/rpc-group"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import type { GameRecord } from "@shared/fixtures/games/game"
import { Cause, Effect, Exit, Layer, type Scope } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
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

export interface RemoteStreamControlClient {
  readonly listGames: () => Promise<readonly GameRecord[]>
  readonly listSourceGames: () => Promise<readonly RemoteSourceGame[]>
  readonly sourceStatus: () => Promise<RemoteSourceStatus>
  readonly prepareGame: (gameId: string) => Promise<RemotePrepareResult>
}

export interface RemoteStreamControlClientOptions {
  readonly timeoutMs?: number
}

export function createRemoteStreamControlClient(
  baseUrl: string,
  options: RemoteStreamControlClientOptions = {},
): RemoteStreamControlClient {
  const rpcUrl = rpcUrlForBase(baseUrl)
  const layer = RpcClient.layerProtocolHttp({
    url: "",
    transformClient: client =>
      HttpClient.mapRequest(client, HttpClientRequest.prependUrl(rpcUrl)),
  }).pipe(
    Layer.provide(BatchJsonSerializationLive),
    Layer.provide(FetchHttpClient.layer),
  )

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
        return await runRpc(
          RpcClient.make(serverRpcGroup).pipe(
            Effect.flatMap(client => client["app.server.status"]({})),
            Effect.map(response => {
              const extras = {
                ...(response.runner?.mode
                  ? { runnerMode: response.runner.mode }
                  : {}),
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
          ),
        )
      } catch (error) {
        return {
          status: "unavailable",
          message: errorMessage(error) ?? "Korri stream host is unavailable",
        }
      }
    },

    prepareGame: async gameId => {
      const exit = await withTimeout(
        Effect.runPromiseExit(
          Effect.scoped(
            RpcClient.make(serverRpcGroup).pipe(
              Effect.flatMap(client =>
                client["app.server.stream.prepare"]({ id: gameId }),
              ),
              Effect.provide(layer),
            ),
          ),
        ),
        options.timeoutMs,
      )

      if (Exit.isSuccess(exit)) {
        return {
          status: "prepared",
          gameId: exit.value.gameId,
          sessionId: exit.value.sessionId,
        }
      }

      return failedFromUnknown(Cause.squash(exit.cause))
    },
  }
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
