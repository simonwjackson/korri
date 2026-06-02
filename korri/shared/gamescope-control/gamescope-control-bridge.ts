import { chmod, mkdir, rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { dirname } from "node:path"
import {
  createGamescopeHelloResult,
  createUnsupportedGamescopeCommandResult,
  decodeGamescopeControlRequest,
  type GamescopeControlBackend,
  type GamescopeControlCommandResult,
  type GamescopeControlErrorResponse,
  type GamescopeControlEvent,
  type GamescopeControlRequest,
  type GamescopeControlResponse,
  type GamescopeControlSuccessResponse,
  isGamescopeControlCommandMethod,
  validateGamescopeFilter,
  validateGamescopeMode,
  validateGamescopeSharpness,
} from "./gamescope-control-protocol"

export interface GamescopeControlBridgeOptions {
  readonly socketPath: string
  readonly backend: GamescopeControlBackend
  readonly maxFrameBytes?: number
}

export interface GamescopeControlBridge {
  readonly socketPath: string
  readonly close: () => Promise<void>
}

interface BridgeContext {
  readonly options: GamescopeControlBridgeOptions
  readonly sockets: Set<Socket>
  readonly subscribers: Set<Socket>
  readonly queue: CommandQueue
  nextAckSeq: number
  nextEventSeq: number
  closing: boolean
}

interface CommandQueue {
  readonly enqueue: <T>(job: () => Promise<T>) => Promise<T>
}

export async function startGamescopeControlBridge(
  options: GamescopeControlBridgeOptions,
): Promise<GamescopeControlBridge> {
  await mkdir(dirname(options.socketPath), { recursive: true, mode: 0o700 })
  await rm(options.socketPath, { force: true })
  const context: BridgeContext = {
    options,
    sockets: new Set(),
    subscribers: new Set(),
    queue: createCommandQueue(),
    nextAckSeq: 0,
    nextEventSeq: 0,
    closing: false,
  }
  const server = createServer(socket => handleSocket(socket, context))
  const previousUmask = process.umask(0o077)
  try {
    await listen(server, options.socketPath)
  } finally {
    process.umask(previousUmask)
  }
  await chmod(options.socketPath, 0o600)
  return {
    socketPath: options.socketPath,
    close: async () => {
      context.closing = true
      for (const socket of context.sockets) socket.destroy()
      context.sockets.clear()
      context.subscribers.clear()
      await closeServer(server)
      await rm(options.socketPath, { force: true })
    },
  }
}

function handleSocket(socket: Socket, context: BridgeContext): void {
  if (context.closing) {
    socket.destroy()
    return
  }
  context.sockets.add(socket)
  const maxFrameBytes = context.options.maxFrameBytes ?? 64 * 1024
  let buffered = ""
  socket.on("data", chunk => {
    buffered += chunk.toString("utf8")
    if (Buffer.byteLength(buffered, "utf8") > maxFrameBytes) {
      writeResponse(
        socket,
        errorResponse(undefined, -32000, "frame exceeded maxFrameBytes"),
      )
      socket.destroy()
      return
    }

    while (buffered.includes("\n")) {
      const index = buffered.indexOf("\n")
      const line = buffered.slice(0, index)
      buffered = buffered.slice(index + 1)
      void handleLine(socket, line, context)
    }
  })

  socket.on("error", () => {
    socket.destroy()
  })

  socket.on("close", () => {
    context.sockets.delete(socket)
    context.subscribers.delete(socket)
  })
}

async function handleLine(
  socket: Socket,
  line: string,
  context: BridgeContext,
): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    writeResponse(socket, errorResponse(undefined, -32700, "parse error"))
    return
  }

  let request: GamescopeControlRequest
  try {
    request = decodeGamescopeControlRequest(parsed)
  } catch (error) {
    writeResponse(
      socket,
      errorResponse(
        requestIdFromUnknown(parsed),
        -32600,
        error instanceof Error ? error.message : String(error),
      ),
    )
    return
  }

  try {
    const result = isQueuedMutation(request)
      ? await context.queue.enqueue(() =>
          dispatchRequest(socket, request, context),
        )
      : await dispatchRequest(socket, request, context)
    writeResponse(socket, { jsonrpc: "2.0", id: request.id, result })
    if (isCommandResult(result)) {
      emitEvent(context, {
        type: "command.result",
        requestId: request.id,
        result,
      })
    }
  } catch (error) {
    writeResponse(
      socket,
      errorResponse(
        request.id,
        -32001,
        error instanceof Error ? error.message : String(error),
      ),
    )
  }
}

async function dispatchRequest(
  socket: Socket,
  request: GamescopeControlRequest,
  context: BridgeContext,
): Promise<GamescopeControlSuccessResponse["result"]> {
  switch (request.method) {
    case "protocol.hello":
      return createGamescopeHelloResult()
    case "state.get":
      return {
        _tag: "state.snapshot",
        ...(await context.options.backend.getState()),
      }
    case "events.subscribe":
      context.subscribers.add(socket)
      return { _tag: "events.subscribed", seq: nextAckSeq(context) }
    case "events.unsubscribe":
      context.subscribers.delete(socket)
      return { _tag: "events.unsubscribed", seq: nextAckSeq(context) }
    case "mode.set": {
      const result = await context.options.backend.setMode(
        validateGamescopeMode(request.params),
      )
      return withRequestId(result, request.id)
    }
    case "filter.set": {
      const result = await context.options.backend.setFilter(
        validateGamescopeFilter(request.params),
      )
      return withRequestId(result, request.id)
    }
    case "sharpness.set": {
      const result = await context.options.backend.setSharpness(
        validateGamescopeSharpness(request.params),
      )
      return withRequestId(result, request.id)
    }
    default:
      return withRequestId(
        createUnsupportedGamescopeCommandResult(request.method, request.params),
        request.id,
      )
  }
}

function writeResponse(
  socket: Socket,
  response: GamescopeControlResponse,
): void {
  socket.write(`${JSON.stringify(response)}\n`)
}

function writeEvent(
  socket: Socket,
  seq: number,
  event: GamescopeControlEvent,
): void {
  socket.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "gamescope.event", params: { seq, event } })}\n`,
  )
}

function emitEvent(context: BridgeContext, event: GamescopeControlEvent): void {
  const seq = nextEventSeq(context)
  for (const subscriber of context.subscribers) {
    if (!subscriber.destroyed) writeEvent(subscriber, seq, event)
  }
}

function nextAckSeq(context: BridgeContext): number {
  context.nextAckSeq += 1
  return context.nextAckSeq
}

function nextEventSeq(context: BridgeContext): number {
  context.nextEventSeq += 1
  return context.nextEventSeq
}

function errorResponse(
  id: string | number | undefined,
  code: number,
  message: string,
): GamescopeControlErrorResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function requestIdFromUnknown(value: unknown): string | number | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (typeof (value as Record<string, unknown>).id === "string" ||
      typeof (value as Record<string, unknown>).id === "number")
  ) {
    return (value as { id: string | number }).id
  }
  return undefined
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function createCommandQueue(): CommandQueue {
  let chain: Promise<void> = Promise.resolve()
  return {
    enqueue: async <T>(job: () => Promise<T>): Promise<T> => {
      const run = chain.then(job, job)
      chain = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
  }
}

function isQueuedMutation(request: GamescopeControlRequest): boolean {
  return isGamescopeControlCommandMethod(request.method)
}

function withRequestId(
  result: GamescopeControlCommandResult,
  requestId: string | number,
): GamescopeControlCommandResult {
  return { ...result, requestId }
}

function isCommandResult(
  result: GamescopeControlSuccessResponse["result"],
): result is GamescopeControlCommandResult {
  return result._tag === "command.result"
}
