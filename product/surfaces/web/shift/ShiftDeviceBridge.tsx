import { useAtomSet } from "@effect/atom-react"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import type { KorriPlatformBridge } from "@platform/surface/bridge"
import { useEffect } from "react"

/**
 * Presents live Korrid-owned device facts to Shift's atom registry. The visual
 * surface remains a pure reader: it consumes `deviceStateAtom` just like the lab
 * does, and no status-bar component probes Linux, browser, or daemon APIs.
 */
export function ShiftDeviceBridge({
  device,
}: {
  readonly device?: KorriPlatformBridge["device"]
}) {
  const setDeviceState = useAtomSet(deviceStateAtom)

  useEffect(() => {
    if (!device) return undefined
    return device.subscribe(setDeviceState)
  }, [device, setDeviceState])

  return null
}
