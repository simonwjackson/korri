import { chmod, unlink } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { createServer, type Server } from "node:net"
import {
  createSunshineRemoteInputSourceAdapter,
  decodeSunshineInputSeatFrame,
  type SunshineInputSeatAcceptResult,
  type SunshineRemoteInputSourceAdapter,
} from "./sunshine-remote-input-source"

export type SunshineInputSeatMirrorDiagnostic =
  | {
      readonly kind: "frame-accepted"
      readonly result: SunshineInputSeatAcceptResult
    }
  | { readonly kind: "frame-too-large"; readonly bytes: number }
  | { readonly kind: "frame-json-invalid"; readonly message: string }
  | { readonly kind: "frame-schema-invalid"; readonly message: string }
  | { readonly kind: "socket-client-error"; readonly message: string }
  | { readonly kind: "socket-server-error"; readonly message: string }

export interface SunshineInputSeatMirrorFrameSink {
  readonly push: (chunk: string | Uint8Array) => void
  readonly close: () => void
}

export interface SunshineInputSeatMirrorFrameSinkOptions {
  readonly adapter: SunshineRemoteInputSourceAdapter
  readonly maxFrameBytes?: number
  readonly onDiagnostic?: (
    diagnostic: SunshineInputSeatMirrorDiagnostic,
  ) => void
}

export interface SunshineInputSeatMirrorSocketOptions {
  readonly launchId: string
  readonly socketPath: string
  readonly seatCount: number
  readonly maxEventsPerSecond: number
  readonly maxFrameBytes?: number
  readonly onDiagnostic?: (
    diagnostic: SunshineInputSeatMirrorDiagnostic,
  ) => void
}

export interface SunshineInputSeatMirrorSocketHandle {
  readonly socketPath: string
  readonly adapter: SunshineRemoteInputSourceAdapter
  readonly stop: () => Promise<void>
}

const DEFAULT_MAX_FRAME_BYTES = 4096

export const createSunshineInputSeatMirrorFrameSink = (
  options: SunshineInputSeatMirrorFrameSinkOptions,
): SunshineInputSeatMirrorFrameSink => {
  const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
  let buffer = ""

  const diagnostic = (event: SunshineInputSeatMirrorDiagnostic) => {
    options.onDiagnostic?.(event)
  }

  const processLine = (line: string) => {
    if (line.trim().length === 0) return
    const bytes = Buffer.byteLength(line, "utf8")
    if (bytes > maxFrameBytes) {
      diagnostic({ kind: "frame-too-large", bytes })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (error) {
      diagnostic({
        kind: "frame-json-invalid",
        message: error instanceof Error ? error.message : String(error),
      })
      return
    }

    try {
      const frame = decodeSunshineInputSeatFrame(parsed)
      diagnostic({
        kind: "frame-accepted",
        result: options.adapter.accept(frame),
      })
    } catch (error) {
      diagnostic({
        kind: "frame-schema-invalid",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const flushCompleteLines = () => {
    while (true) {
      const newline = buffer.indexOf("\n")
      if (newline < 0) return
      const line = buffer.slice(0, newline).replace(/\r$/, "")
      buffer = buffer.slice(newline + 1)
      processLine(line)
    }
  }

  return {
    push: chunk => {
      buffer +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()
      if (
        Buffer.byteLength(buffer, "utf8") > maxFrameBytes &&
        !buffer.includes("\n")
      ) {
        diagnostic({
          kind: "frame-too-large",
          bytes: Buffer.byteLength(buffer, "utf8"),
        })
        buffer = ""
        return
      }
      flushCompleteLines()
    },
    close: () => {
      const tail = buffer
      buffer = ""
      processLine(tail)
    },
  }
}

export const startSunshineInputSeatMirrorSocket = async (
  options: SunshineInputSeatMirrorSocketOptions,
): Promise<SunshineInputSeatMirrorSocketHandle> => {
  if (!isAbsolute(options.socketPath)) {
    throw new Error("Sunshine input-seat mirror socket path must be absolute")
  }

  const adapter = createSunshineRemoteInputSourceAdapter({
    launchId: options.launchId,
    seatCount: options.seatCount,
    maxEventsPerSecond: options.maxEventsPerSecond,
  })

  await unlink(options.socketPath).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  })

  const server = createServer(connection => {
    const sink = createSunshineInputSeatMirrorFrameSink({
      adapter,
      maxFrameBytes: options.maxFrameBytes,
      onDiagnostic: options.onDiagnostic,
    })
    connection.on("data", chunk => sink.push(chunk))
    connection.on("end", () => sink.close())
    connection.on("error", error => {
      options.onDiagnostic?.({
        kind: "socket-client-error",
        message: error instanceof Error ? error.message : String(error),
      })
    })
  })

  server.on("error", error => {
    options.onDiagnostic?.({
      kind: "socket-server-error",
      message: error instanceof Error ? error.message : String(error),
    })
  })

  await listen(server, options.socketPath)
  await chmod(options.socketPath, 0o600)

  return {
    socketPath: options.socketPath,
    adapter,
    stop: async () => {
      await closeServer(server)
      await unlink(options.socketPath).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      })
    },
  }
}

const listen = (server: Server, socketPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(socketPath)
  })

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
