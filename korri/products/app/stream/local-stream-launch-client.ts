import { rpcProtocolHttpLayer } from "@shared/api/rpc/client-layer"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"
import {
  type LocalStreamLaunchResponse,
  localStreamLaunchRpcGroup,
} from "./local-stream-launch-rpc"

const LOCAL_STREAM_LAUNCH_RPC_URL = "/__korri/desktop/rpc"

export interface LocalStreamLaunchClient {
  readonly launchGame: (gameId: string) => Promise<LocalStreamLaunchResponse>
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
    launchGame: async gameId =>
      await runRpc(
        RpcClient.make(localStreamLaunchRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.desktop.launch"]({ id: gameId }),
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
