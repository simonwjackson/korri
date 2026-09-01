import type {
  GameplayOverlayConfig,
  GameplayOverlayInstructionResult,
  GameplayOverlayToNativeMessage,
  GameplayOverlayToPortalMessage,
  KorriOverlayMessageSurface,
} from "@contracts/bridge/korri-native-bridge"
import { GAMEPLAY_OVERLAY_RECEIVER } from "@contracts/bridge/korri-native-bridge"
import type { InputBus } from "../input/bus"
import { parseBridgeInputEvent } from "../input/korri-native-adapter"
import type { OverlayPlatform } from "./overlay-controller"

declare global {
  interface Window {
    KorriOverlay?: KorriOverlayMessageSurface
    __korriOverlayMessage?: (messageJson: string) => void
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length &&
    [...keys].sort().every((key, index) => actual[index] === key)
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function parsePortalMessage(json: string): GameplayOverlayToPortalMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  const message = record(parsed)
  if (!message || typeof message.type !== "string") return null
  if (message.type === "config") {
    const payload = record(message.payload)
    if (
      !exactKeys(message, ["type", "payload"]) || !payload ||
      !exactKeys(payload, ["korridPort", "korridCapability", "launchId"]) ||
      !Number.isInteger(payload.korridPort) || (payload.korridPort as number) <= 0 ||
      !nonempty(payload.korridCapability) || !nonempty(payload.launchId)
    ) return null
    return {
      type: "config",
      payload: {
        korridPort: payload.korridPort as number,
        korridCapability: payload.korridCapability,
        launchId: payload.launchId,
      },
    }
  }
  if (message.type === "input") {
    if (!exactKeys(message, ["type", "payload"])) return null
    const input = parseBridgeInputEvent(JSON.stringify(message.payload))
    if (!input) return null
    if (input.type === "direction") {
      if (input.releaseExpected === true) {
        return {
          type: "input",
          payload: {
            type: "direction",
            direction: input.direction,
            ...(input.repeat === true ? { repeat: true } : {}),
            releaseExpected: true,
            gestureId: input.gestureId,
            source: "gamepad",
          },
        }
      }
      return {
        type: "input",
        payload: {
          type: "direction",
          direction: input.direction,
          ...(input.repeat === true ? { repeat: true } : {}),
          source: "gamepad",
        },
      }
    }
    if (input.type === "direction-end") {
      if (input.gestureId === undefined) return null
      return {
        type: "input",
        payload: {
          type: "direction-end",
          direction: input.direction,
          gestureId: input.gestureId,
          source: "gamepad",
        },
      }
    }
    return { type: "input", payload: { type: input.type, source: "gamepad" } }
  }
  if (message.type === "instruction-result") {
    const outcome = record(message.outcome)
    if (
      !exactKeys(message, ["type", "requestId", "outcome"]) ||
      !nonempty(message.requestId) || !outcome || typeof outcome._tag !== "string"
    ) return null
    if (outcome._tag === "Executed" && exactKeys(outcome, ["_tag"])) {
      return { type: "instruction-result", requestId: message.requestId, outcome: {
        _tag: "Executed",
      } }
    }
    if (
      (outcome._tag === "Unavailable" || outcome._tag === "Rejected") &&
      exactKeys(outcome, ["_tag", "message"]) && nonempty(outcome.message)
    ) {
      return {
        type: "instruction-result",
        requestId: message.requestId,
        outcome: { _tag: outcome._tag, message: outcome.message },
      }
    }
  }
  return null
}

function post(
  surface: KorriOverlayMessageSurface,
  message: GameplayOverlayToNativeMessage,
) {
  surface.postMessage(JSON.stringify(message))
}

export interface NativeOverlayConnection {
  readonly platform: OverlayPlatform
  start(onConfig: (config: GameplayOverlayConfig) => void): () => void
}

export interface NativeOverlayConnectionOptions {
  readonly instructionTimeoutMs?: number
}

const INSTRUCTION_TIMEOUT_MS = 5_000

/** Purpose-built message connection; it cannot express any full-shell operation. */
export function createNativeOverlayConnection(
  surface: KorriOverlayMessageSurface,
  bus: InputBus,
  options: NativeOverlayConnectionOptions = {},
): NativeOverlayConnection {
  let requestSequence = 0
  const instructionTimeoutMs = options.instructionTimeoutMs ?? INSTRUCTION_TIMEOUT_MS
  const pending = new Map<string, {
    readonly resolve: (outcome: GameplayOverlayInstructionResult) => void
    readonly timer: ReturnType<typeof setTimeout>
  }>()

  const platform: OverlayPlatform = {
    dismiss() {
      post(surface, { type: "dismiss" })
    },
    requestAuthorityRefresh() {
      post(surface, { type: "refresh-authority" })
    },
    executeProtectedInstruction(instruction) {
      requestSequence += 1
      const requestId = `instruction-${requestSequence}`
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          if (!pending.delete(requestId)) return
          resolve({
            _tag: "Unavailable",
            message: "The gameplay action timed out.",
          })
        }, instructionTimeoutMs)
        pending.set(requestId, { resolve, timer })
        post(surface, {
          type: "execute-protected-instruction",
          requestId,
          instruction,
        })
      })
    },
  }

  return {
    platform,
    start(onConfig) {
      const receiver = (messageJson: string) => {
        const message = parsePortalMessage(messageJson)
        if (!message) return
        if (message.type === "config") {
          onConfig(message.payload)
        } else if (message.type === "input") {
          const action = parseBridgeInputEvent(JSON.stringify(message.payload))
          if (action) bus.emit(action)
        } else {
          const request = pending.get(message.requestId)
          if (request) {
            pending.delete(message.requestId)
            clearTimeout(request.timer)
            request.resolve(message.outcome)
          }
        }
      }
      window[GAMEPLAY_OVERLAY_RECEIVER] = receiver
      post(surface, { type: "ready" })
      return () => {
        if (window[GAMEPLAY_OVERLAY_RECEIVER] === receiver) {
          delete window[GAMEPLAY_OVERLAY_RECEIVER]
        }
        for (const request of pending.values()) {
          clearTimeout(request.timer)
          request.resolve({
            _tag: "Unavailable",
            message: "The gameplay overlay closed before the action completed.",
          })
        }
        pending.clear()
      }
    },
  }
}
