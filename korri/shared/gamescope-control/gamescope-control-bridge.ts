import { rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import {
  createGamescopeHelloResult,
  decodeGamescopeControlRequest,
  type GamescopeControlBackend,
  type GamescopeControlErrorResponse,
  type GamescopeControlRequest,
  type GamescopeControlResponse,
  type GamescopeControlSuccessResponse,
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

export async function startGamescopeControlBridge(
  options: GamescopeControlBridgeOptions,
): Promise<GamescopeControlBridge> {
  await rm(options.socketPath, { force: true })
  const server = createServer(socket => handleSocket(socket, options))
  await listen(server, options.socketPath)
  return {
    socketPath: options.socketPath,
    close: async () => {
      await closeServer(server)
      await rm(options.socketPath, { force: true })
    },
  }
}

function handleSocket(
  socket: Socket,
  options: GamescopeControlBridgeOptions,
): void {
  const maxFrameBytes = options.maxFrameBytes ?? 64 * 1024
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
      void handleLine(socket, line, options.backend)
    }
  })
}

async function handleLine(
  socket: Socket,
  line: string,
  backend: GamescopeControlBackend,
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
    const result = await dispatchRequest(request, backend)
    writeResponse(socket, { jsonrpc: "2.0", id: request.id, result })
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
  request: GamescopeControlRequest,
  backend: GamescopeControlBackend,
): Promise<GamescopeControlSuccessResponse["result"]> {
  switch (request.method) {
    case "protocol.hello":
      return createGamescopeHelloResult()
    case "state.get":
      return { _tag: "state.snapshot", ...(await backend.getState()) }
    case "mode.set":
      return backend.setMode(validateGamescopeMode(request.params))
    case "filter.set":
      return backend.setFilter(validateGamescopeFilter(request.params))
    case "sharpness.set":
      return backend.setSharpness(validateGamescopeSharpness(request.params))
  }
}

function writeResponse(
  socket: Socket,
  response: GamescopeControlResponse,
): void {
  socket.write(`${JSON.stringify(response)}\n`)
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
