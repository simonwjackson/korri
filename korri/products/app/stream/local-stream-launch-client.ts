import { rpcProtocolHttpLayer } from "@shared/api/rpc/client-layer"
import type { EntrySource } from "@shared/api/rpc/entry-source"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import {
  type LocalStreamLaunchResponse,
  localStreamLaunchRpcGroup,
} from "./local-stream-launch-rpc"

export interface LocalStreamLaunchInput {
  readonly id: string
  /**
   * Federation source tag. When provided, the desktop-bridge routes
   * local-source payloads (`source.isLocal === true`) through the
   * `launchLocal` delegate and remote-source payloads through the
   * Moonlight prepare/spawn pipeline. Source-absent calls fall back
   * to the legacy single-server connection record (U1-transition
   * compat) and surface a typed `host-unavailable` failure in
   * federated environments without a connection record.
   */
  readonly source?: EntrySource
}

const LOCAL_STREAM_LAUNCH_RPC_URL = "/__korri/desktop/rpc"

export interface LocalStreamLaunchClient {
  readonly launchGame: (
    input: LocalStreamLaunchInput,
  ) => Promise<LocalStreamLaunchResponse>
}

export interface LocalStreamLaunchClientOptions {
  readonly rpcUrl?: string
}

export function createLocalStreamLaunchClient(
  options: LocalStreamLaunchClientOptions = {},
): LocalStreamLaunchClient {
  const rpcUrl = absoluteRpcUrl(options.rpcUrl ?? LOCAL_STREAM_LAUNCH_RPC_URL)
  const layer = rpcProtocolHttpLayer(rpcUrl)

  const runRpc = <T>(
    effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
  ): Promise<T> =>
    Effect.runPromise(
      Effect.scoped(
        effect.pipe(Effect.provide(layer)) as Effect.Effect<T, unknown, never>,
      ),
    )

  return {
    launchGame: async ({ id, source }) =>
      await runRpc(
        RpcClient.make(localStreamLaunchRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.desktop.launch"](source ? { id, source } : { id }),
          ),
        ),
      ),
  }
}

function absoluteRpcUrl(rpcUrl: string): string {
  if (!rpcUrl.startsWith("/")) return rpcUrl
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://desktop.local"
  return new URL(rpcUrl, origin).toString()
}
