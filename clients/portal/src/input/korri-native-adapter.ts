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
  if (event.source !== "gamepad") return null

  if (event.type === "direction") {
    const keys = Object.keys(value).sort().join(",")
    if (keys !== "direction,source,type" &&
        keys !== "direction,repeat,source,type" &&
        keys !== "direction,gestureId,releaseExpected,source,type" &&
        keys !== "direction,gestureId,releaseExpected,repeat,source,type") {
      return null
    }
    if (typeof event.direction !== "string") return null
    if (!directions.has(event.direction)) return null
    if (event.repeat !== undefined && typeof event.repeat !== "boolean") return null
    if (event.releaseExpected !== undefined && event.releaseExpected !== true) return null
    if (event.gestureId !== undefined &&
        (!Number.isSafeInteger(event.gestureId) || event.gestureId <= 0)) return null
    if (event.gestureId !== undefined && event.releaseExpected !== true) return null
    if (event.releaseExpected === true && event.gestureId === undefined) return null
    if (event.releaseExpected === true && event.gestureId !== undefined) {
      return {
        type: "direction",
        direction: event.direction,
        ...(event.repeat === true ? { repeat: true } : {}),
        releaseExpected: true,
        gestureId: event.gestureId,
        source: "gamepad",
      }
    }
    return {
      type: "direction",
      direction: event.direction,
      ...(event.repeat === true ? { repeat: true } : {}),
      source: "gamepad",
    }
  }
  if (event.type === "direction-end") {
    if (Object.keys(value).sort().join(",") !== "direction,gestureId,source,type") return null
    if (typeof event.direction !== "string" || !directions.has(event.direction)) return null
    const gestureId = event.gestureId
    if (typeof gestureId !== "number" || !Number.isSafeInteger(gestureId) || gestureId <= 0) return null
    return {
      type: "direction-end",
      direction: event.direction,
      gestureId,
      source: "gamepad",
    }
  }
  if (typeof event.type === "string" && simpleTypes.has(event.type)) {
    if (Object.keys(value).sort().join(",") !== "source,type") return null
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
