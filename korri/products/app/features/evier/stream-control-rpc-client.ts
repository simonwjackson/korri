import { appRpcGroup } from "@app/api/app-rpc-group"
import { RpcClientLive } from "@shared/api/rpc/client"
import type { EvierStreamControlController } from "@shared/themes/evier/pages/EvierStreamControlPage"
import { Effect, type Scope } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export function createEvierStreamControlRpcClient(): EvierStreamControlController {
  return {
    getState: () =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client => client["app.stream-control.state.get"]({})),
        ),
      ),
    setMoonlightBitrate: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.moonlight-bitrate.set"]({
              bitrateKbps: payload.bitrateKbps,
            }),
          ),
        ),
      ),
    setMoonlightFps: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.moonlight-fps.set"]({
              fps: payload.fps,
            }),
          ),
        ),
      ),
    setMoonlightResolution: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.moonlight-resolution.set"]({
              width: payload.width,
              height: payload.height,
            }),
          ),
        ),
      ),
    setGamescopeMode: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.gamescope-mode.set"]({
              width: payload.width,
              height: payload.height,
            }),
          ),
        ),
      ),
    setGamescopeFps: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.gamescope-fps.set"]({
              fps: payload.fps,
            }),
          ),
        ),
      ),
    setGamescopeFilter: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.gamescope-filter.set"]({
              filter: payload.filter as
                | "linear"
                | "nearest"
                | "integer"
                | "fsr"
                | "nis",
            }),
          ),
        ),
      ),
    setGamescopeSharpness: payload =>
      runAppRpc(
        RpcClient.make(appRpcGroup).pipe(
          Effect.flatMap(client =>
            client["app.stream-control.gamescope-sharpness.set"]({
              sharpness: payload.sharpness,
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
