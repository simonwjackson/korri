import { logger as defaultLogger } from "@shared/logger"
import { Effect } from "effect"
import type { DesktopInputStatus } from "./desktop-bridge-wire"
import { createNativeGamepadMapper } from "./native/gamepad-mapper"
import { decodeNativeInputEvent } from "./native/wire-schema"
import type { InputAction } from "./types"

export interface DesktopInputTarget {
  readonly title?: string
  readonly sendMessage: (payload: unknown) => void
  readonly onDomReady?: (handler: () => void) => void
}

export type DesktopInputLogger = Pick<typeof defaultLogger, "info" | "warn">

export interface DesktopInputBrokerCoreOptions {
  readonly inputdUrl: string
  readonly getTargets: () => readonly DesktopInputTarget[]
  readonly getActiveTarget: () => DesktopInputTarget | null | undefined
  readonly onActiveChange?: (listener: (active: boolean) => void) => () => void
  readonly reconnectDelayMs?: number
  readonly maxReconnectDelayMs?: number
  readonly reconnectJitterMs?: number
  readonly connectTimeoutMs?: number
  readonly nowMs?: () => number
  readonly random?: () => number
  readonly logger?: DesktopInputLogger
}

const SUBSCRIPTION = JSON.stringify({ classes: ["gamepad", "system"] })
const DEFAULT_RECONNECT_DELAY_MS = 1_000
const DEFAULT_MAX_RECONNECT_DELAY_MS = 10_000
const DEFAULT_RECONNECT_JITTER_MS = 250
const DEFAULT_CONNECT_TIMEOUT_MS = 3_000

type MutableStatus = DesktopInputStatus

export function createDesktopInputBrokerCore(
  options: DesktopInputBrokerCoreOptions,
) {
  return Effect.sync(() => {
    const controller = new DesktopInputBrokerCore(options)
    controller.start()
    return controller
  }).pipe(
    Effect.flatMap(controller =>
      Effect.never.pipe(Effect.ensuring(Effect.sync(() => controller.stop()))),
    ),
  )
}

class DesktopInputBrokerCore {
  private readonly reconnectDelayMs: number
  private readonly maxReconnectDelayMs: number
  private readonly reconnectJitterMs: number
  private readonly connectTimeoutMs: number
  private readonly nowMs: () => number
  private readonly random: () => number
  private readonly logger: DesktopInputLogger
  private readonly mapper = createNativeGamepadMapper()
  private readonly attachedTargets = new WeakSet<DesktopInputTarget>()
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
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeActiveChange: (() => void) | null = null
  private stopped = false
  private sequence = 0
  private reconnectAttempts = 0

  constructor(private readonly options: DesktopInputBrokerCoreOptions) {
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
    this.maxReconnectDelayMs =
      options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    this.reconnectJitterMs =
      options.reconnectJitterMs ?? DEFAULT_RECONNECT_JITTER_MS
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    this.nowMs = options.nowMs ?? Date.now
    this.random = options.random ?? Math.random
    this.logger = options.logger ?? defaultLogger
  }

  start() {
    this.unsubscribeActiveChange =
      this.options.onActiveChange?.(active => {
        this.setActive(active)
      }) ?? null
    this.status = {
      ...this.status,
      inputd: "connecting",
      active: Boolean(this.options.getActiveTarget()),
    }
    this.attachDomReadyHandlers()
    this.pushStatus()
    this.connect()
  }

  stop() {
    this.stopped = true
    this.unsubscribeActiveChange?.()
    this.unsubscribeActiveChange = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.reconnectTimer = null
    this.connectTimer = null
    this.socket?.close()
    this.socket = null
    this.mapper.reset()
  }

  private connect() {
    if (this.stopped) return

    this.status = { ...this.status, inputd: "connecting", lastError: null }
    this.pushStatus()

    let socket: WebSocket
    try {
      socket = new WebSocket(this.options.inputdUrl)
    } catch (error) {
      this.recordConnectionFailure(
        error,
        "desktop input broker invalid inputd URL",
      )
      return
    }
    this.socket = socket
    this.connectTimer = setTimeout(() => {
      if (this.stopped || this.socket !== socket) return
      this.status = {
        ...this.status,
        inputd: "error",
        lastError: "inputd websocket connect timeout",
      }
      this.pushStatus()
      socket.close()
    }, this.connectTimeoutMs)

    socket.addEventListener("open", () => {
      if (this.stopped || this.socket !== socket) return
      if (this.connectTimer) clearTimeout(this.connectTimer)
      this.connectTimer = null
      try {
        socket.send(SUBSCRIPTION)
      } catch (error) {
        this.recordConnectionFailure(
          error,
          "desktop input broker failed to subscribe to inputd",
        )
        socket.close()
        return
      }
      this.reconnectAttempts = 0
      this.status = { ...this.status, inputd: "connected", lastError: null }
      this.logger.info(
        { inputdUrl: this.options.inputdUrl },
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
      if (this.connectTimer) clearTimeout(this.connectTimer)
      this.connectTimer = null
      this.socket = null
      this.mapper.reset()
      this.status = { ...this.status, inputd: "disconnected" }
      this.pushStatus()
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect() {
    if (this.stopped) return
    const delay = this.nextReconnectDelayMs()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private nextReconnectDelayMs() {
    const base = Math.min(
      this.maxReconnectDelayMs,
      this.reconnectDelayMs * 2 ** this.reconnectAttempts,
    )
    this.reconnectAttempts += 1
    return base + Math.floor(this.random() * this.reconnectJitterMs)
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
      if (event.kind === "device-added" && event.device.class === "gamepad") {
        this.mapper.configureDevice(event.device)
      }
      if (event.kind === "device-removed") {
        this.mapper.reset()
      }
    } catch (error) {
      this.recordError(error, "desktop input broker ignored malformed event")
    }
  }

  private setActive(active: boolean) {
    if (this.status.active === active) return
    if (!active) this.mapper.reset()
    this.status = { ...this.status, active }
    this.pushStatus({ refreshActive: false })
  }

  private refreshActiveState() {
    this.setActive(Boolean(this.options.getActiveTarget()))
  }

  private forwardAction(action: InputAction) {
    const target = this.options.getActiveTarget()
    const active = Boolean(target)
    if (this.status.active !== active) {
      this.setActive(active)
    }

    if (!target) {
      this.mapper.reset()
      this.status = {
        ...this.status,
        active: false,
        droppedActions: this.status.droppedActions + 1,
      }
      this.pushStatus({ refreshActive: false })
      return
    }

    const normalizedAction = normalizeAction(action)

    try {
      target.sendMessage({
        kind: "korri.input.action",
        sequence: ++this.sequence,
        timestamp: this.nowMs(),
        action: normalizedAction,
      })
      this.status = {
        ...this.status,
        active: true,
        emittedActions: this.status.emittedActions + 1,
      }
    } catch (error) {
      this.status = {
        ...this.status,
        active: true,
        pushFailures: this.status.pushFailures + 1,
        lastError: error instanceof Error ? error.message : String(error),
      }
      this.logger.warn(
        { err: error },
        "desktop input broker failed to push action",
      )
    }

    this.pushStatus({ refreshActive: false })
  }

  private pushStatus(options: { readonly refreshActive?: boolean } = {}) {
    this.attachDomReadyHandlers()
    if (options.refreshActive !== false) this.refreshActiveState()
    for (const target of this.options.getTargets()) {
      try {
        target.sendMessage({
          kind: "korri.input.status" as const,
          status: this.status,
        })
      } catch (error) {
        this.status = {
          ...this.status,
          pushFailures: this.status.pushFailures + 1,
          lastError: error instanceof Error ? error.message : String(error),
        }
        this.logger.warn(
          { err: error, windowTitle: target.title },
          "desktop input broker failed to push status",
        )
      }
    }
  }

  private attachDomReadyHandlers() {
    for (const target of this.options.getTargets()) {
      if (this.attachedTargets.has(target)) continue
      target.onDomReady?.(() => this.pushStatus())
      this.attachedTargets.add(target)
    }
  }

  private recordConnectionFailure(error: unknown, message: string) {
    this.status = {
      ...this.status,
      inputd: "error",
      lastError: error instanceof Error ? error.message : String(error),
    }
    this.logger.warn({ err: error }, message)
    this.pushStatus()
    this.scheduleReconnect()
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
