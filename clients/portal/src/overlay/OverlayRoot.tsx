import type {
  SurfaceHost,
  SurfaceInputAction,
} from "@contracts/surface/korri-surface"
import { ShiftSurface } from "@korri/shift"
import { useEffect, useMemo, useSyncExternalStore } from "react"
import type { InputBus } from "../input/bus"
import type { OverlayController } from "./overlay-controller"

export interface OverlayRootProps {
  readonly bus: InputBus
  readonly controller: OverlayController
}

/** Dedicated portal composition: one controller-backed model, one treaty host,
 * and the normal ShiftSurface entry. The portal never reaches into Shift's sheet. */
export function OverlayRoot({ bus, controller }: OverlayRootProps) {
  const model = useSyncExternalStore(
    controller.subscribe,
    controller.model,
    controller.model,
  )

  useEffect(() => {
    void controller.refresh()
    return () => controller.destroy()
  }, [controller])

  const host = useMemo<SurfaceHost>(
    () => ({
      input: {
        on: (action: SurfaceInputAction, handler: () => void) =>
          bus.onAction(action, handler),
      },
      launchGame: () => {},
      runAction: () => {},
      changeSetting: () => {},
      dismissSettingsProblem: () => {},
      gameActions: () => [],
      runGameAction: () => {},
      invokeGameplayControl: (controlId, value) => {
        void controller.invoke(controlId, value)
      },
      dismissGameplayOverlay: controller.dismiss,
      retry: () => {
        void controller.refresh()
      },
      dismiss: controller.dismiss,
      reload: () => {
        void controller.refresh()
      },
    }),
    [bus, controller],
  )

  return <ShiftSurface model={model} host={host} />
}
