import {
  createRemoteStreamControlClient,
  type RemotePrepareOptions,
  type RemotePrepareResult,
} from "@product/apps/portal/stream/remote-stream-client"
import { Context, Effect, Layer } from "effect"

/**
 * `RemoteStreamPrepare` — server-to-server federation seam for
 * `app.server.stream.prepare`. Wraps `createRemoteStreamControlClient` with
 * a default timeout. The handler at `launch.rpc-handler.ts` calls this when
 * `payload.source.isLocal === false` to prep the peer host before
 * dispatching a Moonlight launch through sessiond.
 *
 * The live layer is a thin Effect wrapper around the existing
 * `remote-stream-client` (federation-v1 path with legacy fallback). The
 * service interface keeps `RemotePrepareResult` (which already encodes
 * failure categories) so the handler maps them directly to `LaunchFailureKind`.
 */
export interface RemoteStreamPrepareService {
  readonly prepare: (
    controlUrl: string,
    gameId: string,
    options?: RemotePrepareOptions,
  ) => Effect.Effect<RemotePrepareResult, never>
}

export class RemoteStreamPrepare extends Context.Service<
  RemoteStreamPrepare,
  RemoteStreamPrepareService
>()("RemoteStreamPrepare") {}

/**
 * Default per-call timeout for the peer's `app.server.stream.prepare`. Matches
 * the value used by the desktop bun bridge before this work (5s).
 */
export const DEFAULT_REMOTE_STREAM_TIMEOUT_MS = 5_000

export const RemoteStreamPrepareLive = Layer.sync(RemoteStreamPrepare)(() => ({
  prepare: (controlUrl, gameId, options) =>
    Effect.promise(async () => {
      try {
        const client = createRemoteStreamControlClient(controlUrl, {
          timeoutMs: DEFAULT_REMOTE_STREAM_TIMEOUT_MS,
        })
        return await client.prepareGame(gameId, options)
      } catch (error) {
        return {
          status: "failed",
          category: "host-unavailable",
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }),
}))
