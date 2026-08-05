import type { BridgeInputEvent } from "@contracts/bridge/korri-native-bridge"
import type { InputAction, InputAdapter } from "./types"

/**
 * Korri native adapter: receives semantic input events pushed by the Android
 * shell (see contracts/bridge/korri-native-bridge.ts) and re-emits them on
 * the input bus. The shell owns all hardware truth; by the time an event
 * reaches this adapter it is already semantic.
 *
 * The shell calls `window.__korriInput(json)`. This adapter registers that
 * global on start and removes it on dispose.
 */

const GLOBAL_NAME = "__korriInput"

const directions = new Set(["up", "down", "left", "right"])
const simpleTypes = new Set(["confirm", "back", "menu", "options", "system"])

/** Parse a wire event, returning null for anything malformed. */
export function parseBridgeInputEvent(json: string): InputAction | null {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const event = value as Partial<BridgeInputEvent>

  if (event.type === "direction") {
    if (typeof event.direction !== "string") return null
    if (!directions.has(event.direction)) return null
    if (event.repeat !== undefined && typeof event.repeat !== "boolean") return null
    return {
      type: "direction",
      direction: event.direction,
      ...(event.repeat === true ? { repeat: true } : {}),
      source: "gamepad",
    }
  }
  if (typeof event.type === "string" && simpleTypes.has(event.type)) {
    return {
      type: event.type as "confirm" | "back" | "menu" | "options" | "system",
      source: "gamepad",
    }
  }
  return null
}

export function createKorriNativeAdapter(): InputAdapter {
  return {
    name: "korri-native",
    start(emit) {
      const host = window as unknown as Record<string, unknown>
      host[GLOBAL_NAME] = (json: string) => {
        const action = parseBridgeInputEvent(json)
        if (action) emit(action)
      }
      return () => {
        delete host[GLOBAL_NAME]
      }
    },
  }
}
