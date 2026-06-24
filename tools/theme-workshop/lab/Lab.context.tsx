import { createContext, useContext } from "react"
import type { DeviceConfig } from "../device-lab"
import type { DeviceSelection } from "./lab-route-state"
import type { LabSurfaceAdapter } from "./surface-registry"

export interface LabContextValue {
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
  readonly themeId: string
  readonly surfacePath: string
  readonly selection: DeviceSelection
  readonly devices: readonly DeviceConfig[]
  readonly selectedDevices: readonly DeviceConfig[]
  readonly setDevicesSegment: (devicesSegment: string) => void
  readonly setThemeId: (themeId: string) => void
  readonly setSurfacePath: (surfacePath: string) => void
}

export const LabContext = createContext<LabContextValue | null>(null)

export function useLab(): LabContextValue {
  const context = useContext(LabContext)
  if (!context) throw new Error("useLab must be used within a LabRoot")
  return context
}
