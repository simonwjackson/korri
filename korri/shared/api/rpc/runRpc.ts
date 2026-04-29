/**
 * Shared RPC execution helper — singleton runtime for all RPC calls.
 *
 * Uses a ManagedRuntime backed by a shared RpcClient instance.
 * This eliminates per-call overhead of creating/destroying the client
 * and scope, keeping the Protocol layer (HTTP transport) alive.
 *
 * Errors preserve their `_tag` discriminant (e.g., "DataError",
 * "NotFoundError") through the Promise boundary, enabling callers
 * to discriminate on error type.
 *
 * All browser-side RPC traffic goes through runRpc().
 *
 * PERF: The RPC group (80+ schema definitions) is lazy-loaded on first
 * call via dynamic import(). This prevents the root route module from
 * pulling in the entire schema graph at page load, saving seconds in
 * Vite dev mode where every import is a separate HTTP request.
 */

import { RpcClient, type RpcGroup } from "@effect/rpc"
import type { AppRpcGroup } from "@shared/api/rpc/app-rpc-group"
import { RpcClientLive } from "@shared/api/rpc/rx/client"
import { Cause, Context, Effect, Exit, Layer, ManagedRuntime } from "effect"

/** The fully-typed RPC client derived from the app's RpcGroup */
type AppRpcClient = RpcClient.RpcClient<RpcGroup.Rpcs<AppRpcGroup>>

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
// Shared client as a Context.Tag for Layer-based singleton
// ---------------------------------------------------------------------------

class SharedRpcClient extends Context.Tag("SharedRpcClient")<
  SharedRpcClient,
  AppRpcClient
>() {}

// ---------------------------------------------------------------------------
// Lazy runtime — defers importing the 80+ RPC schema files until first call
// ---------------------------------------------------------------------------

let runtimePromise: Promise<
  ManagedRuntime.ManagedRuntime<SharedRpcClient, never>
> | null = null

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("@shared/api/rpc/app-rpc-group").then(
      ({ appRpcGroup }) => {
        const SharedRpcClientLive = Layer.scoped(
          SharedRpcClient,
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
 * (and its 80+ schema imports) is only loaded when actually needed,
 * not at module resolution time.
 *
 * Errors are preserved with their original structure (including `_tag`
 * discriminants like "DataError", "NotFoundError", etc.) so callers
 * can discriminate:
 *
 * ```ts
 * try {
 *   await runRpc((c) => c.goals["annualOverview.list"]({ ... }))
 * } catch (error) {
 *   if (error._tag === "NotFoundError") { ... }
 * }
 * ```
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

  // Cause.squash extracts the most relevant error from the Cause tree.
  // For typed errors (TaggedError), this preserves _tag, message, etc.
  // For defects, it wraps them in an Error.
  const error = Cause.squash(exit.cause)
  throw error
}
