import {
  getSpatialNavigationSnapshot,
  subscribeSpatialNavigation,
} from "@platform/browser/navigation/start"
import type { InputAction } from "@platform/input/types"
import { useEffect, useRef, useSyncExternalStore } from "react"

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
  const handle = useSyncExternalStore(
    subscribeSpatialNavigation,
    getSpatialNavigationSnapshot,
    () => null,
  )

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!handle) return
    return handle.bus.onAction(type, action => handlerRef.current(action))
  }, [handle, type])
}
