/**
 * Generic hook for RPC queries — replaces ~40 hand-rolled query hooks.
 *
 * Handles: loading state, error state, app-wide shared dedup/cache, refetch.
 *
 * Usage:
 *   const { data, isPending, isError, refetch } = useRpcQuery(
 *     (client) => client.goals["annualOverview.list"]({ propertyCode: "ABC" }),
 *     { key: propertyCode }
 *   )
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import {
  ensureRpcQuery,
  getRpcQueryKey,
  getRpcQuerySnapshot,
  refetchRpcQuery,
  subscribeToRpcQuery,
} from "./rpcQueryStore"
import { type RpcFn, runRpc } from "./runRpc"

interface UseRpcQueryOptions {
  /** Optional cache key suffix when callers need to distinguish equivalent RPC signatures. */
  key?: string
  /** Whether the query should execute. Defaults to true. */
  enabled?: boolean
}

export interface UseRpcQueryResult<T> {
  data: T | undefined
  isPending: boolean
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | undefined
  refetch: () => void
}

export function useRpcQuery<T>(
  fn: RpcFn<T>,
  options?: UseRpcQueryOptions,
): UseRpcQueryResult<T> {
  const { key = "static", enabled = true } = options ?? {}
  const fnRef = useRef(fn)
  fnRef.current = fn

  const queryKey = getRpcQueryKey(fn, key)
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToRpcQuery(queryKey, onStoreChange),
    [queryKey],
  )
  const getSnapshot = useCallback(
    () => getRpcQuerySnapshot<T>(queryKey),
    [queryKey],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!enabled) {
      return
    }

    ensureRpcQuery(queryKey, () => runRpc(fnRef.current))
  }, [enabled, queryKey])

  const refetch = useCallback(() => {
    if (!enabled) {
      return
    }

    void refetchRpcQuery(queryKey, () => runRpc(fnRef.current))
  }, [enabled, queryKey])

  const isPending =
    enabled && (snapshot.status === "idle" || snapshot.status === "pending")
  const isError = enabled && snapshot.status === "error"

  return {
    data: snapshot.data,
    isPending,
    isLoading: isPending,
    isFetching: isPending,
    isError,
    error: isError ? snapshot.error : undefined,
    refetch,
  }
}
