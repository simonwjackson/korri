import { createLogger } from "@shared/logger"
import {
  decodeNativeInputEvent,
  decodeNativeInputSubscription,
  encodeNativeInputSubscription,
  type NativeInputDeviceClass,
} from "./native/wire-schema"
import {
  createNativeGamepadMapper,
  type NativeGamepadMapperOptions,
} from "./native/gamepad-mapper"
import type { InputAdapter, InputListener } from "./types"

const logger = createLogger("native-input-adapter")

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 250
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5_000
const DEFAULT_RECONNECT_FACTOR = 2

export interface NativeInputReconnectOptions {
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly factor?: number
}

export interface NativeInputAdapterOptions extends NativeGamepadMapperOptions {
  readonly url: string
  readonly subscribe?: readonly NativeInputDeviceClass[]
  readonly reconnect?: NativeInputReconnectOptions
}

export function createNativeInputAdapter(
  options: NativeInputAdapterOptions,
): InputAdapter {
  const subscribe = options.subscribe ?? ["gamepad"]
  const reconnectInitialDelayMs =
    options.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS
  const reconnectMaxDelayMs =
    options.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
  const reconnectFactor = options.reconnect?.factor ?? DEFAULT_RECONNECT_FACTOR

  return {
    name: "native",
    start(emit) {
      reportNativeInputDiagnostic("start", { url: options.url })
      if (typeof WebSocket === "undefined") {
        reportNativeInputDiagnostic("websocket-unavailable", {
          url: options.url,
        })
        return () => {}
      }

      const mapper = createNativeGamepadMapper(options)
      let socket: WebSocket | undefined
      let disposed = false
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let nextReconnectDelayMs = reconnectInitialDelayMs

      const diagnosticEmit: InputListener = action => {
        reportNativeInputDiagnostic("emit", action)
        emit(action)
      }

      const connect = () => {
        if (disposed) return

        reportNativeInputDiagnostic("connect", { url: options.url })
        socket = new WebSocket(options.url)

        socket.addEventListener("open", () => {
          reportNativeInputDiagnostic("open", { url: options.url })
          nextReconnectDelayMs = reconnectInitialDelayMs
          socket?.send(encodeSubscription(subscribe))
        })

        socket.addEventListener("message", event => {
          try {
            const decoded = decodeNativeInputEvent(
              JSON.parse(String(event.data)),
            )
            if (decoded.kind === "action") {
              if (decoded.action === "system") {
                diagnosticEmit({ type: "system", source: "native" })
              }
              return
            }
            if (decoded.kind !== "input") return
            if (decoded.class !== "gamepad") return
            mapper.handle(decoded, diagnosticEmit)
          } catch (error) {
            logger.warn({ err: error }, "ignored malformed native input frame")
          }
        })

        socket.addEventListener("error", () => {
          reportNativeInputDiagnostic("error", { url: options.url })
          scheduleReconnect()
        })
        socket.addEventListener("close", () => {
          reportNativeInputDiagnostic("close", { url: options.url })
          mapper.reset()
          scheduleReconnect()
        })
      }

      const scheduleReconnect = () => {
        if (disposed || reconnectTimer) return

        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connect()
        }, nextReconnectDelayMs)
        nextReconnectDelayMs = Math.min(
          reconnectMaxDelayMs,
          nextReconnectDelayMs * reconnectFactor,
        )
      }

      connect()

      return () => {
        disposed = true
        if (reconnectTimer) clearTimeout(reconnectTimer)
        mapper.reset()
        socket?.close()
      }
    },
  }
}

function reportNativeInputDiagnostic(
  event: string,
  fields: Readonly<Record<string, unknown>>,
) {
  if (typeof fetch === "undefined") return

  fetch("/__korri/native-input-diagnostic", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, ...fields }),
  }).catch(() => {})
}

function encodeSubscription(
  classes: readonly NativeInputDeviceClass[],
): string {
  return JSON.stringify(
    encodeNativeInputSubscription(
      decodeNativeInputSubscription({ classes: [...classes] }),
    ),
  )
}
