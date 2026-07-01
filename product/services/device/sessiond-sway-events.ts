import { parseSwayWindowEvent, parseSwayWorkspaceEvent } from "./sessiond-sway"

const SWAY_IPC_MAGIC = "i3-ipc"
const SWAY_IPC_HEADER_BYTES = 14
const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024

export const SWAY_IPC_MESSAGE_TYPE = {
  command: 0,
  getWorkspaces: 1,
  subscribe: 2,
  getTree: 4,
} as const

const SWAY_IPC_EVENT_BIT = 0x80000000
export const SWAY_IPC_EVENT_TYPE = {
  workspace: SWAY_IPC_EVENT_BIT + 0,
  window: SWAY_IPC_EVENT_BIT + 3,
} as const

export type SessiondSwayEvent =
  | {
      readonly kind: "window"
      readonly change?: string
      readonly container: NonNullable<ReturnType<typeof parseSwayWindowEvent>>
    }
  | {
      readonly kind: "workspace"
      readonly change?: string
      readonly current?: NonNullable<
        ReturnType<typeof parseSwayWorkspaceEvent>
      >["current"]
      readonly old?: NonNullable<ReturnType<typeof parseSwayWorkspaceEvent>>["old"]
    }

export interface SessiondSwayEventDiagnostic {
  readonly message: string
  readonly error?: unknown
  readonly messageType?: number
}

export class SwayIpcFrameDecoderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SwayIpcFrameDecoderError"
  }
}

export interface SwayIpcFrameDecoder {
  push: (chunk: Uint8Array) => void
  reset: () => void
}

export function createSwayIpcFrameDecoder(options: {
  readonly onEvent: (event: SessiondSwayEvent) => void
  readonly onDiagnostic?: (diagnostic: SessiondSwayEventDiagnostic) => void
  readonly maxFrameBytes?: number
}): SwayIpcFrameDecoder {
  let buffer = new Uint8Array(0)
  const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES

  const diagnostic = (input: SessiondSwayEventDiagnostic) =>
    options.onDiagnostic?.(input)

  return {
    push(chunk) {
      buffer = concatBytes(buffer, chunk)
      while (buffer.length >= SWAY_IPC_HEADER_BYTES) {
        const header = readHeader(buffer)
        if (!header.ok) {
          buffer = new Uint8Array(0)
          throw new SwayIpcFrameDecoderError(header.message)
        }
        if (header.payloadLength > maxFrameBytes) {
          buffer = new Uint8Array(0)
          throw new SwayIpcFrameDecoderError(
            `Sway IPC frame length ${header.payloadLength} exceeds limit ${maxFrameBytes}`,
          )
        }
        const totalLength = SWAY_IPC_HEADER_BYTES + header.payloadLength
        if (buffer.length < totalLength) return

        const payloadBytes = buffer.slice(SWAY_IPC_HEADER_BYTES, totalLength)
        buffer = buffer.slice(totalLength)
        const payload = new TextDecoder().decode(payloadBytes)
        const event = decodeEventFrame(header.messageType, payload, diagnostic)
        if (event) options.onEvent(event)
      }
    },
    reset() {
      buffer = new Uint8Array(0)
    },
  }
}

function decodeEventFrame(
  messageType: number,
  payload: string,
  diagnostic: (diagnostic: SessiondSwayEventDiagnostic) => void,
): SessiondSwayEvent | undefined {
  if (messageType === SWAY_IPC_EVENT_TYPE.window) {
    try {
      const parsed = JSON.parse(payload) as { readonly change?: string }
      const container = parseSwayWindowEvent(payload)
      if (!container) {
        diagnostic({ message: "Sway window event missing container", messageType })
        return undefined
      }
      return { kind: "window", change: parsed.change, container }
    } catch (error) {
      diagnostic({ message: "invalid Sway IPC event JSON", error, messageType })
      return undefined
    }
  }

  if (messageType === SWAY_IPC_EVENT_TYPE.workspace) {
    try {
      const parsed = parseSwayWorkspaceEvent(payload)
      return {
        kind: "workspace",
        change: parsed.change,
        current: parsed.current,
        old: parsed.old,
      }
    } catch (error) {
      diagnostic({ message: "invalid Sway IPC event JSON", error, messageType })
      return undefined
    }
  }

  diagnostic({ message: "ignored non-event Sway IPC message", messageType })
  return undefined
}

function readHeader(buffer: Uint8Array):
  | { readonly ok: true; readonly payloadLength: number; readonly messageType: number }
  | { readonly ok: false; readonly message: string } {
  const magic = new TextDecoder().decode(buffer.slice(0, 6))
  if (magic !== SWAY_IPC_MAGIC) {
    return { ok: false, message: "invalid Sway IPC magic" }
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return {
    ok: true,
    payloadLength: view.getUint32(6, true),
    messageType: view.getUint32(10, true),
  }
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right
  const output = new Uint8Array(left.length + right.length)
  output.set(left, 0)
  output.set(right, left.length)
  return output
}

export function encodeSwayIpcFrameForTest(options: {
  readonly messageType: number
  readonly payload: string
}): Uint8Array {
  const payload = new TextEncoder().encode(options.payload)
  const frame = new Uint8Array(SWAY_IPC_HEADER_BYTES + payload.length)
  frame.set(new TextEncoder().encode(SWAY_IPC_MAGIC), 0)
  const view = new DataView(frame.buffer)
  view.setUint32(6, payload.length, true)
  view.setUint32(10, options.messageType, true)
  frame.set(payload, SWAY_IPC_HEADER_BYTES)
  return frame
}
