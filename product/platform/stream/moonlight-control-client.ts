import { connect, type Socket } from "node:net"
import {
  decodeMoonlightControlEventEnvelope,
  decodeMoonlightControlResponse,
  MOONLIGHT_CONTROL_PROTOCOL_LIMITS,
  type MoonlightControlEvent,
  type MoonlightControlSuccessResponse,
} from "./moonlight-control-protocol"

export interface MoonlightControlClientOptions {
  readonly socketPath: string
  readonly maxFrameBytes?: number
  readonly onSequenceGap?: (gap: MoonlightControlSequenceGap) => void
}

export interface MoonlightControlSequenceGap {
  readonly expectedSeq: number
  readonly actualSeq: number
}

export interface MoonlightControlEventDelivery {
  readonly seq: number
  readonly event: MoonlightControlEvent
}

export interface MoonlightControlClient {
  readonly hello: () => Promise<MoonlightControlSuccessResponse>
  readonly state: () => Promise<MoonlightControlSuccessResponse>
  readonly subscribe: () => Promise<MoonlightControlSuccessResponse>
  readonly setBitrate: (params: {
    readonly bitrateKbps: number
  }) => Promise<MoonlightControlSuccessResponse>
  readonly setFps: (params: {
    readonly fps: number
  }) => Promise<MoonlightControlSuccessResponse>
  readonly setResolution: (params: {
    readonly width: number
    readonly height: number
  }) => Promise<MoonlightControlSuccessResponse>
  readonly setTouchBounds: (params: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }) => Promise<MoonlightControlSuccessResponse>
  readonly onEvent: (
    listener: (delivery: MoonlightControlEventDelivery) => void,
  ) => () => void
  readonly close: () => void
}

interface MoonlightControlClientProtocolError {
  readonly _tag: "MoonlightControlClientProtocolError"
  readonly message: string
}

interface PendingRequest {
  readonly resolve: (response: MoonlightControlSuccessResponse) => void
  readonly reject: (error: unknown) => void
}

export async function connectMoonlightControl(
  options: MoonlightControlClientOptions,
): Promise<MoonlightControlClient> {
  const socket = await connectUnixSocket(options.socketPath)
  return createMoonlightControlClient(socket, options)
}

function createMoonlightControlClient(
  socket: Socket,
  options: MoonlightControlClientOptions,
): MoonlightControlClient {
  const maxFrameBytes =
    options.maxFrameBytes ?? MOONLIGHT_CONTROL_PROTOCOL_LIMITS.maxFrameBytes
  const pending = new Map<string, PendingRequest>()
  const listeners = new Set<(delivery: MoonlightControlEventDelivery) => void>()
  let nextRequestId = 1
  let buffered = ""
  let lastSeq = 0
  let closed = false

  socket.on("data", chunk => {
    buffered += chunk.toString("utf8")
    if (Buffer.byteLength(buffered, "utf8") > maxFrameBytes) {
      rejectAll(protocolError("Moonlight control frame exceeded maxFrameBytes"))
      socket.destroy()
      return
    }

    while (buffered.includes("\n")) {
      const index = buffered.indexOf("\n")
      const line = buffered.slice(0, index)
      buffered = buffered.slice(index + 1)
      if (line === "") {
        rejectAll(protocolError("Moonlight control emitted a blank frame"))
        socket.destroy()
        return
      }
      handleLine(line)
    }
  })

  socket.on("error", error => rejectAll(error))
  socket.on("close", () => {
    closed = true
    rejectAll(protocolError("Moonlight control socket closed"))
  })

  // fallow-ignore-next-line code-duplication
  return {
    hello: () => request("protocol.hello"),
    state: () => request("state.get"),
    subscribe: () => request("events.subscribe"),
    setBitrate: params => request("runtime.setBitrate", params),
    setFps: params => request("runtime.setFps", params),
    setResolution: params => request("runtime.setResolution", params),
    setTouchBounds: params => request("input.setTouchBounds", params),
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
    params?: Readonly<Record<string, unknown>>,
  ): Promise<MoonlightControlSuccessResponse> {
    if (closed)
      return Promise.reject(protocolError("Moonlight control socket closed"))
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
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      rejectAll(protocolError("Moonlight control emitted malformed JSON"))
      socket.destroy()
      return
    }

    try {
      if (isEventFrame(value)) {
        const envelope = decodeMoonlightControlEventEnvelope(value)
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

      const response = decodeMoonlightControlResponse(value)
      const pendingRequest = pending.get(String(response.id))
      if (!pendingRequest) return
      pending.delete(String(response.id))
      if ("result" in response) {
        pendingRequest.resolve(response)
      } else {
        pendingRequest.reject(response.error)
      }
    } catch (error) {
      rejectAll(
        protocolError(error instanceof Error ? error.message : String(error)),
      )
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

function connectUnixSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath })
    socket.once("connect", () => resolve(socket))
    socket.once("error", reject)
  })
}

function isEventFrame(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).method === "moonlight.event"
  )
}

function protocolError(message: string): MoonlightControlClientProtocolError {
  return { _tag: "MoonlightControlClientProtocolError", message }
}
