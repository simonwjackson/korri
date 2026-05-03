import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import type { AppRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { RpcClientLive } from "@shared/api/rpc/rx/client"
import { Cause, Context, Effect, Exit, Layer, ManagedRuntime } from "effect"

/** The fully-typed RPC client derived from the app's RpcGroup */
type AppRpcClient = RpcClient.FromGroup<
  AppRpcGroup,
  RpcClientError.RpcClientError
>

/** A function that takes the RPC client and returns an Effect (for queries) */
export type RpcFn<T> = (
  client: AppRpcClient,
) => Effect.Effect<T, unknown, unknown>

/** A function that takes the RPC client + payload and returns an Effect (for mutations) */
export type MutationRpcFn<P, T> = (
  client: AppRpcClient,
  payload: P,
) => Effect.Effect<T, unknown, unknown>

// ---------------------------------------------------------------------------
// Shared client as a Context.Service for Layer-based singleton
// ---------------------------------------------------------------------------

class SharedRpcClient extends Context.Service<SharedRpcClient, AppRpcClient>()(
  "SharedRpcClient",
) {}

// ---------------------------------------------------------------------------
// Lazy runtime — defers importing the RPC schema files until first call
// ---------------------------------------------------------------------------

let runtimePromise: Promise<
  ManagedRuntime.ManagedRuntime<SharedRpcClient, unknown>
> | null = null

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("@shared/api/rpc/app-rpc-group").then(
      ({ appRpcGroup }) => {
        const SharedRpcClientLive = Layer.effect(SharedRpcClient)(
          RpcClient.make(appRpcGroup),
        )
        const AppRpcLive = SharedRpcClientLive.pipe(
          Layer.provide(RpcClientLive),
        )
        return ManagedRuntime.make(AppRpcLive)
      },
    )
  }
  return runtimePromise
}

/**
 * Run an RPC call. Uses the shared runtime + shared client.
 *
 * The runtime is created lazily on first call — the RPC group module
 * is only loaded when actually needed, not at module resolution time.
 */
export const runRpc = async <T>(fn: RpcFn<T>): Promise<T> => {
  const runtime = await getRuntime()

  const exit = await runtime.runPromiseExit(
    Effect.gen(function* () {
      const client = yield* SharedRpcClient
      return yield* fn(client)
    }) as Effect.Effect<T>,
  )

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  const error = Cause.squash(exit.cause)
  throw error
}
