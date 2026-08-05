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

function parsePortalMessage(json: string): GameplayOverlayToPortalMessage | null {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || !("type" in value)) return null
  const message = value as Partial<GameplayOverlayToPortalMessage>
  if (message.type === "config") {
    const payload = message.payload
    if (
      typeof payload !== "object" || payload === null ||
      !("korridPort" in payload) || typeof payload.korridPort !== "number" ||
      !("korridCapability" in payload) || typeof payload.korridCapability !== "string" ||
      !("launchId" in payload) || typeof payload.launchId !== "string"
    ) return null
    return message as GameplayOverlayToPortalMessage
  }
  if (message.type === "input") {
    const parsed = parseBridgeInputEvent(JSON.stringify(message.payload))
    return parsed ? message as GameplayOverlayToPortalMessage : null
  }
  if (message.type === "instruction-result") {
    if (
      typeof message.requestId !== "string" ||
      typeof message.outcome !== "object" || message.outcome === null ||
      !("_tag" in message.outcome) ||
      !["Executed", "Unavailable", "Rejected"].includes(message.outcome._tag)
    ) return null
    return message as GameplayOverlayToPortalMessage
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

/** Purpose-built message connection; it cannot express any full-shell operation. */
export function createNativeOverlayConnection(
  surface: KorriOverlayMessageSurface,
  bus: InputBus,
): NativeOverlayConnection {
  let requestSequence = 0
  const pending = new Map<
    string,
    (outcome: GameplayOverlayInstructionResult) => void
  >()

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
        pending.set(requestId, resolve)
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
          const resolve = pending.get(message.requestId)
          if (resolve) {
            pending.delete(message.requestId)
            resolve(message.outcome)
          }
        }
      }
      window[GAMEPLAY_OVERLAY_RECEIVER] = receiver
      post(surface, { type: "ready" })
      return () => {
        if (window[GAMEPLAY_OVERLAY_RECEIVER] === receiver) {
          delete window[GAMEPLAY_OVERLAY_RECEIVER]
        }
        for (const resolve of pending.values()) {
          resolve({
            _tag: "Unavailable",
            message: "The gameplay overlay closed before the action completed.",
          })
        }
        pending.clear()
      }
    },
  }
}
