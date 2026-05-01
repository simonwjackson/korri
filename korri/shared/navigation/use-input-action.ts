import type { InputAction } from "@shared/input/types"
import { useEffect, useRef } from "react"
import { getInputBus } from "./start"

/**
 * Subscribe React code to the device-agnostic input bus.
 *
 * Components still stay navigation-library-free: they subscribe to semantic
 * actions (back/menu/options/confirm/direction), not keyboard events, gamepad
 * buttons, or LRUD internals.
 */
export function useInputAction<T extends InputAction["type"]>(
  type: T,
  handler: (action: Extract<InputAction, { type: T }>) => void,
): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    return getInputBus().onAction(type, action => handlerRef.current(action))
  }, [type])
}
