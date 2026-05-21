import type { DesktopInputStatus } from "@shared/input/desktop-bridge-wire"
import { createNativeGamepadMapper } from "@shared/input/native/gamepad-mapper"
import { decodeNativeInputEvent } from "@shared/input/native/wire-schema"
import type { InputAction } from "@shared/input/types"
import { logger as defaultLogger } from "@shared/logger"
import { Effect } from "effect"

type DesktopInputWindow = {
  readonly title?: string
  readonly webview: {
    readonly sendMessageToWebviewViaExecute: (payload: unknown) => void
    readonly on?: (event: "dom-ready", handler: () => void) => void
  }
}

type DesktopInputLogger = Pick<typeof defaultLogger, "info" | "warn">

export interface DesktopInputBrokerOptions {
  readonly inputdUrl?: string
  readonly getWindows: () => readonly DesktopInputWindow[]
  readonly getActiveWindow: () => DesktopInputWindow | null | undefined
  readonly reconnectDelayMs?: number
  readonly nowMs?: () => number
  readonly logger?: DesktopInputLogger
}

const DEFAULT_INPUTD_URL = "ws://127.0.0.1:3002"
const SUBSCRIPTION = JSON.stringify({ classes: ["gamepad", "system"] })

type MutableStatus = DesktopInputStatus

export function createDesktopInputBroker(options: DesktopInputBrokerOptions) {
  return Effect.sync(() => {
    const controller = new DesktopInputBroker(options)
    controller.start()
    return controller
  }).pipe(
    Effect.flatMap(controller =>
      Effect.never.pipe(Effect.ensuring(Effect.sync(() => controller.stop()))),
    ),
  )
}

class DesktopInputBroker {
  private readonly inputdUrl: string
  private readonly reconnectDelayMs: number
  private readonly nowMs: () => number
  private readonly logger: DesktopInputLogger
  private readonly mapper = createNativeGamepadMapper()
  private readonly attachedWindows = new WeakSet<DesktopInputWindow>()
  private status: MutableStatus = {
    inputd: "disabled",
    active: false,
    decodedFrames: 0,
    emittedActions: 0,
    droppedActions: 0,
    pushFailures: 0,
    lastError: null,
  }
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private sequence = 0

  constructor(private readonly options: DesktopInputBrokerOptions) {
    this.inputdUrl = options.inputdUrl ?? DEFAULT_INPUTD_URL
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000
    this.nowMs = options.nowMs ?? Date.now
    this.logger = options.logger ?? defaultLogger
  }

  start() {
    this.status = { ...this.status, inputd: "connecting" }
    this.attachDomReadyHandlers()
    this.pushStatus()
    this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.mapper.reset()
  }

  private connect() {
    if (this.stopped) return

    this.status = { ...this.status, inputd: "connecting", lastError: null }
    this.pushStatus()

    const socket = new WebSocket(this.inputdUrl)
    this.socket = socket

    socket.addEventListener("open", () => {
      if (this.stopped || this.socket !== socket) return
      socket.send(SUBSCRIPTION)
      this.status = { ...this.status, inputd: "connected", lastError: null }
      this.logger.info(
        { inputdUrl: this.inputdUrl },
        "desktop input broker connected",
      )
      this.pushStatus()
    })

    socket.addEventListener("message", event => {
      if (this.stopped || this.socket !== socket) return
      this.handleMessage(event.data)
    })

    socket.addEventListener("error", () => {
      if (this.stopped || this.socket !== socket) return
      this.status = {
        ...this.status,
        inputd: "error",
        lastError: "inputd websocket error",
      }
      this.pushStatus()
    })

    socket.addEventListener("close", () => {
      if (this.stopped || this.socket !== socket) return
      this.socket = null
      this.mapper.reset()
      this.status = { ...this.status, inputd: "disconnected" }
      this.pushStatus()
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        this.reconnectDelayMs,
      )
    })
  }

  private handleMessage(data: unknown) {
    let raw: unknown
    try {
      raw = typeof data === "string" ? JSON.parse(data) : data
    } catch (error) {
      this.recordError(error, "desktop input broker ignored malformed JSON")
      return
    }

    try {
      const event = decodeNativeInputEvent(raw)
      if (event.kind === "input" && event.class === "gamepad") {
        this.status = {
          ...this.status,
          decodedFrames: this.status.decodedFrames + 1,
        }
        this.mapper.handle(event, action => this.forwardAction(action))
        this.pushStatus()
        return
      }
      if (event.kind === "action" && event.action === "system") {
        this.forwardAction({ type: "system", source: "native" })
      }
      if (event.kind === "device-removed") {
        this.mapper.reset()
      }
    } catch (error) {
      this.recordError(error, "desktop input broker ignored malformed event")
    }
  }

  private forwardAction(action: InputAction) {
    const target = this.options.getActiveWindow()
    const active = Boolean(target)
    this.status = { ...this.status, active }

    if (!target) {
      this.mapper.reset()
      this.status = {
        ...this.status,
        droppedActions: this.status.droppedActions + 1,
      }
      this.pushStatus()
      return
    }

    try {
      target.webview.sendMessageToWebviewViaExecute({
        kind: "korri.input.action",
        sequence: ++this.sequence,
        timestamp: this.nowMs(),
        action: normalizeAction(action),
      })
      this.status = {
        ...this.status,
        emittedActions: this.status.emittedActions + 1,
      }
    } catch (error) {
      this.status = {
        ...this.status,
        pushFailures: this.status.pushFailures + 1,
        lastError: error instanceof Error ? error.message : String(error),
      }
      this.logger.warn(
        { err: error },
        "desktop input broker failed to push action",
      )
    }

    this.pushStatus()
  }

  private pushStatus() {
    this.attachDomReadyHandlers()
    const active = Boolean(this.options.getActiveWindow())
    this.status = { ...this.status, active }
    const payload = {
      kind: "korri.input.status" as const,
      status: this.status,
    }
    for (const window of this.options.getWindows()) {
      try {
        window.webview.sendMessageToWebviewViaExecute(payload)
      } catch (error) {
        this.status = {
          ...this.status,
          pushFailures: this.status.pushFailures + 1,
          lastError: error instanceof Error ? error.message : String(error),
        }
        this.logger.warn(
          { err: error, windowTitle: window.title },
          "desktop input broker failed to push status",
        )
      }
    }
  }

  private attachDomReadyHandlers() {
    for (const window of this.options.getWindows()) {
      if (this.attachedWindows.has(window)) continue
      window.webview.on?.("dom-ready", () => this.pushStatus())
      this.attachedWindows.add(window)
    }
  }

  private recordError(error: unknown, message: string) {
    this.status = {
      ...this.status,
      lastError: error instanceof Error ? error.message : String(error),
    }
    this.logger.warn({ err: error }, message)
    this.pushStatus()
  }
}

function normalizeAction(action: InputAction) {
  return "source" in action && action.source
    ? action
    : { ...action, source: "native" as const }
}
