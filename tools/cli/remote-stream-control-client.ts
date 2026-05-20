import { appRpcGroup } from "@app/api/app-rpc-group"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import type { GameRecord } from "@shared/fixtures/games/game"
import { Cause, Effect, Exit, Layer } from "effect"
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
      readonly intentPath: string
    }
  | {
      readonly status: "failed"
      readonly category: RemoteStreamControlFailureCategory
      readonly message: string
    }

export interface RemoteStreamControlClient {
  readonly listGames: () => Promise<readonly GameRecord[]>
  readonly prepareGame: (gameId: string) => Promise<RemotePrepareResult>
}

export function createRemoteStreamControlClient(
  baseUrl: string,
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

  return {
    listGames: async () =>
      await Effect.runPromise(
        Effect.scoped(
          RpcClient.make(appRpcGroup).pipe(
            Effect.flatMap(client => client["app.library.list"]({})),
            Effect.map(response => response.games),
            Effect.mapError(toHostUnavailable),
            Effect.provide(layer),
          ),
        ),
      ),

    prepareGame: async gameId => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          RpcClient.make(appRpcGroup).pipe(
            Effect.flatMap(client =>
              client["app.stream.prepare"]({ id: gameId }),
            ),
            Effect.provide(layer),
          ),
        ),
      )

      if (Exit.isSuccess(exit)) {
        return {
          status: "prepared",
          gameId: exit.value.gameId,
          intentPath: exit.value.intentPath,
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
