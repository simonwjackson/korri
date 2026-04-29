import type { RpcFn } from "./runRpc"

type QueryStatus = "idle" | "pending" | "success" | "error"

export interface RpcQuerySnapshot<T> {
  readonly status: QueryStatus
  readonly data: T | undefined
  readonly error: Error | undefined
}

interface RpcQueryRecord<T> {
  state: RpcQuerySnapshot<T>
  promise: Promise<T> | undefined
  requestId: number
  subscribers: Set<() => void>
}

type RpcCallDescriptor = {
  readonly path: readonly string[]
  readonly args: readonly unknown[]
}

const rpcCallDescriptorMarker = Symbol("rpc-call-descriptor")

const defaultSnapshot = <T>(): RpcQuerySnapshot<T> => ({
  status: "idle",
  data: undefined,
  error: undefined,
})

const queryStore = new Map<string, RpcQueryRecord<unknown>>()

function getOrCreateRecord<T>(queryKey: string): RpcQueryRecord<T> {
  const existing = queryStore.get(queryKey) as RpcQueryRecord<T> | undefined
  if (existing) {
    return existing
  }

  const created: RpcQueryRecord<T> = {
    state: defaultSnapshot<T>(),
    promise: undefined,
    requestId: 0,
    subscribers: new Set(),
  }
  queryStore.set(queryKey, created as RpcQueryRecord<unknown>)
  return created
}

function notifySubscribers(record: RpcQueryRecord<unknown>) {
  for (const subscriber of record.subscribers) {
    subscriber()
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function executeQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
  force: boolean,
): Promise<T> {
  const record = getOrCreateRecord<T>(queryKey)

  if (!force && record.promise) {
    return record.promise
  }

  const requestId = record.requestId + 1
  record.requestId = requestId
  record.state = {
    ...record.state,
    status: "pending",
    error: undefined,
  }
  notifySubscribers(record as RpcQueryRecord<unknown>)

  const promise = fetcher()
    .then(data => {
      if (record.requestId === requestId) {
        record.state = {
          status: "success",
          data,
          error: undefined,
        }
        record.promise = undefined
        notifySubscribers(record as RpcQueryRecord<unknown>)
      }
      return data
    })
    .catch(error => {
      const normalizedError = normalizeError(error)
      if (record.requestId === requestId) {
        record.state = {
          status: "error",
          data: undefined,
          error: normalizedError,
        }
        record.promise = undefined
        notifySubscribers(record as RpcQueryRecord<unknown>)
      }
      throw normalizedError
    })

  record.promise = promise
  return promise
}

export function ensureRpcQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
): void {
  const record = getOrCreateRecord<T>(queryKey)
  if (record.state.status !== "idle") {
    return
  }

  void executeQuery(queryKey, fetcher, false)
}

export function primeRpcQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const record = getOrCreateRecord<T>(queryKey)

  if (record.state.status === "success" && record.state.data !== undefined) {
    return Promise.resolve(record.state.data)
  }

  if (record.promise) {
    return record.promise
  }

  return executeQuery(queryKey, fetcher, false)
}

export function refetchRpcQuery<T>(
  queryKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return executeQuery(queryKey, fetcher, true)
}

export function subscribeToRpcQuery(
  queryKey: string,
  subscriber: () => void,
): () => void {
  const record = getOrCreateRecord(queryKey)
  record.subscribers.add(subscriber)
  return () => {
    record.subscribers.delete(subscriber)
  }
}

export function getRpcQuerySnapshot<T>(queryKey: string): RpcQuerySnapshot<T> {
  return getOrCreateRecord<T>(queryKey).state
}

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return '"__undefined__"'
  }

  if (value === null || typeof value !== "object") {
    const serializedValue = JSON.stringify(value)
    return serializedValue ?? JSON.stringify(String(value))
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return `{${entries
    .map(
      ([key, nestedValue]) =>
        `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`,
    )
    .join(",")}}`
}

function createRpcClientProxy(path: readonly string[] = []): object {
  return new Proxy(
    function rpcClientProxy() {
      return undefined
    },
    {
      get(_target, property) {
        if (property === rpcCallDescriptorMarker) {
          return true
        }

        if (typeof property !== "string") {
          return undefined
        }

        return createRpcClientProxy([...path, property])
      },
      apply(_target, _thisArg, args) {
        return {
          [rpcCallDescriptorMarker]: true,
          path,
          args,
        }
      },
    },
  )
}

function isRpcCallDescriptor(value: unknown): value is RpcCallDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[rpcCallDescriptorMarker] === true
  )
}

function extractRpcCallDescriptor<T>(
  fn: RpcFn<T>,
): RpcCallDescriptor | undefined {
  try {
    const descriptor = fn(createRpcClientProxy() as never)
    return isRpcCallDescriptor(descriptor) ? descriptor : undefined
  } catch {
    return undefined
  }
}

export function getRpcQueryKey<T>(fn: RpcFn<T>, key?: string): string {
  const descriptor = extractRpcCallDescriptor(fn)
  if (descriptor) {
    const argsKey = descriptor.args.map(stableSerialize).join(",")
    const baseKey = `rpc:${descriptor.path.join(".")}(${argsKey})`
    return key && key !== "static" ? `${baseKey}|key:${key}` : baseKey
  }

  if (key && key !== "static") {
    return `rpc:key:${key}`
  }

  return `rpc:fn:${fn.toString()}`
}

export function clearRpcQueryStore() {
  queryStore.clear()
}
