import { RpcClientLive } from "@platform/api/rpc/client"
import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export function createEvierStreamControlRpcClient(): StreamControlClient {
  return {
    getControls: () =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.controls.get"]({}),
          ),
        ),
      ),
    getState: () =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.stream-control.state.get"]({})),
        ),
      ),
    applyAction: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.action.set"]({
              action: payload.action,
              payload: payload.payload,
            }),
          ),
        ),
      ),
    setBrightness: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.brightness.set"]({
              percent: payload.percent,
              ...(payload.device ? { device: payload.device } : {}),
            }),
          ),
        ),
      ),
  }
}

function runAppRpc<T>(
  effect: Effect.Effect<T, unknown, Scope.Scope | RpcClient.Protocol>,
): Promise<T> {
  return Effect.runPromise(
    Effect.scoped(effect.pipe(Effect.provide(RpcClientLive))),
  )
}
