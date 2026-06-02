import { connect, type Socket } from "node:net"
import {
  decodeGamescopeControlEventEnvelope,
  decodeGamescopeControlResponse,
  GAMESCOPE_CONTROL_PROTOCOL,
  GAMESCOPE_CONTROL_PROTOCOL_LIMITS,
  type GamescopeControlCommandMethod,
  type GamescopeControlCommandResult,
  type GamescopeControlEvent,
  type GamescopeControlEventsSubscribedResult,
  type GamescopeControlEventsUnsubscribedResult,
  type GamescopeControlHelloResult,
  type GamescopeControlResponse,
  type GamescopeControlState,
  type GamescopeControlSuccessResponse,
  type GamescopeModeRequest,
  type GamescopeScalingFilter,
} from "./gamescope-control-protocol"

export interface GamescopeControlClientOptions {
  readonly socketPath: string
  readonly maxFrameBytes?: number
  readonly onSequenceGap?: (gap: GamescopeControlSequenceGap) => void
  readonly connectTimeoutMs?: number
  readonly skipVersionCheck?: boolean
}

export interface GamescopeControlSequenceGap {
  readonly expectedSeq: number
  readonly actualSeq: number
}

export interface GamescopeControlEventDelivery {
  readonly seq: number
  readonly event: GamescopeControlEvent
}

export interface GamescopeControlClient {
  readonly hello: () => Promise<
    GamescopeControlSuccessResponse<GamescopeControlHelloResult>
  >
  readonly state: () => Promise<
    GamescopeControlSuccessResponse<
      GamescopeControlState & { _tag: "state.snapshot" }
    >
  >
  readonly subscribe: () => Promise<
    GamescopeControlSuccessResponse<GamescopeControlEventsSubscribedResult>
  >
  readonly unsubscribe: () => Promise<
    GamescopeControlSuccessResponse<GamescopeControlEventsUnsubscribedResult>
  >
  readonly setMode: (
    params: GamescopeModeRequest,
  ) => Promise<GamescopeControlSuccessResponse<GamescopeControlCommandResult>>
  readonly setFilter: (params: {
    readonly filter: GamescopeScalingFilter
  }) => Promise<GamescopeControlSuccessResponse<GamescopeControlCommandResult>>
  readonly setSharpness: (params: {
    readonly sharpness: number
  }) => Promise<GamescopeControlSuccessResponse<GamescopeControlCommandResult>>
  readonly requestCommand: (
    method: GamescopeControlCommandMethod,
    params?: unknown,
  ) => Promise<GamescopeControlSuccessResponse<GamescopeControlCommandResult>>
  readonly onEvent: (
    listener: (delivery: GamescopeControlEventDelivery) => void,
  ) => () => void
  readonly close: () => void
}

interface PendingRequest {
  readonly resolve: (response: GamescopeControlSuccessResponse) => void
  readonly reject: (error: unknown) => void
}

export async function connectGamescopeControl(
  options: GamescopeControlClientOptions,
): Promise<GamescopeControlClient> {
  const socket = await connectUnixSocket(
    options.socketPath,
    options.connectTimeoutMs ?? 1000,
  )
  const client = createGamescopeControlClient(socket, options)
  if (!options.skipVersionCheck) {
    const hello = await client.hello()
    assertCompatibleProtocol(hello.result)
  }
  return client
}

function createGamescopeControlClient(
  socket: Socket,
  options: GamescopeControlClientOptions,
): GamescopeControlClient {
  const maxFrameBytes =
    options.maxFrameBytes ?? GAMESCOPE_CONTROL_PROTOCOL_LIMITS.maxFrameBytes
  const pending = new Map<string, PendingRequest>()
  const listeners = new Set<(delivery: GamescopeControlEventDelivery) => void>()
  let buffered = ""
  let nextRequestId = 1
  let lastSeq = 0
  let closed = false

  socket.on("data", chunk => {
    buffered += chunk.toString("utf8")
    if (Buffer.byteLength(buffered, "utf8") > maxFrameBytes) {
      rejectAll(new Error("Gamescope control frame exceeded maxFrameBytes"))
      socket.destroy()
      return
    }

    while (buffered.includes("\n")) {
      const index = buffered.indexOf("\n")
      const line = buffered.slice(0, index)
      buffered = buffered.slice(index + 1)
      handleLine(line)
    }
  })

  socket.on("error", error => rejectAll(error))
  socket.on("close", () => {
    closed = true
    rejectAll(new Error("Gamescope control socket closed"))
  })

  return {
    hello: () =>
      request("protocol.hello") as Promise<
        GamescopeControlSuccessResponse<GamescopeControlHelloResult>
      >,
    state: () =>
      request("state.get") as Promise<
        GamescopeControlSuccessResponse<
          GamescopeControlState & { _tag: "state.snapshot" }
        >
      >,
    subscribe: () =>
      request("events.subscribe") as Promise<
        GamescopeControlSuccessResponse<GamescopeControlEventsSubscribedResult>
      >,
    unsubscribe: () =>
      request("events.unsubscribe") as Promise<
        GamescopeControlSuccessResponse<GamescopeControlEventsUnsubscribedResult>
      >,
    setMode: params =>
      request("mode.set", params) as Promise<
        GamescopeControlSuccessResponse<GamescopeControlCommandResult>
      >,
    setFilter: params =>
      request("filter.set", params) as Promise<
        GamescopeControlSuccessResponse<GamescopeControlCommandResult>
      >,
    setSharpness: params =>
      request("sharpness.set", params) as Promise<
        GamescopeControlSuccessResponse<GamescopeControlCommandResult>
      >,
    requestCommand: (method, params) =>
      request(method, params) as Promise<
        GamescopeControlSuccessResponse<GamescopeControlCommandResult>
      >,
    onEvent: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => {
      closed = true
      socket.destroy()
    },
  }

  function request(
    method: string,
    params?: unknown,
  ): Promise<GamescopeControlSuccessResponse> {
    if (closed)
      return Promise.reject(new Error("Gamescope control socket closed"))
    const id = String(nextRequestId++)
    const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params })
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.write(`${frame}\n`, error => {
        if (error) {
          pending.delete(id)
          reject(error)
        }
      })
    })
  }

  function handleLine(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
      if (isEventFrame(parsed)) {
        const envelope = decodeGamescopeControlEventEnvelope(parsed)
        const expectedSeq = lastSeq + 1
        if (lastSeq !== 0 && envelope.params.seq !== expectedSeq) {
          options.onSequenceGap?.({
            expectedSeq,
            actualSeq: envelope.params.seq,
          })
        }
        lastSeq = envelope.params.seq
        for (const listener of listeners) {
          listener({ seq: envelope.params.seq, event: envelope.params.event })
        }
        return
      }

      const response = decodeGamescopeControlResponse(parsed)
      const pendingRequest = pending.get(String(response.id))
      if (!pendingRequest) return
      pending.delete(String(response.id))
      if (isSuccess(response)) pendingRequest.resolve(response)
      else pendingRequest.reject(response.error)
    } catch (error) {
      rejectAll(error)
      socket.destroy()
    }
  }

  function rejectAll(error: unknown): void {
    for (const [id, request] of pending) {
      pending.delete(id)
      request.reject(error)
    }
  }
}

function connectUnixSocket(
  socketPath: string,
  timeoutMs: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(
        new Error(`Gamescope control connect timed out after ${timeoutMs}ms`),
      )
    }, timeoutMs)
    socket.once("connect", () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once("error", error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function isSuccess(
  response: GamescopeControlResponse,
): response is GamescopeControlSuccessResponse {
  return "result" in response
}

function assertCompatibleProtocol(hello: GamescopeControlHelloResult): void {
  if (hello.protocol.major !== GAMESCOPE_CONTROL_PROTOCOL.major) {
    throw new Error(
      `Unsupported Gamescope control protocol major ${hello.protocol.major}; expected ${GAMESCOPE_CONTROL_PROTOCOL.major}`,
    )
  }
  if (hello.protocol.minor < GAMESCOPE_CONTROL_PROTOCOL.minor) {
    throw new Error(
      `Gamescope control protocol minor ${hello.protocol.minor} is older than required ${GAMESCOPE_CONTROL_PROTOCOL.minor}`,
    )
  }
}

function isEventFrame(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).method === "gamescope.event"
  )
}
