import { createContext, useContext } from "react"
import type { DeviceConfig } from "../device-lab"
import type { DeviceSelection } from "./lab-route-state"
import type { LabCalibrationController } from "./model/lab-calibration-state"
import type { LabSurfaceAdapter, LabSurfaceScreen } from "./surface-registry"

export interface LabContextValue {
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
  readonly themeId: string
  readonly surfacePath: string
  readonly screens: readonly LabSurfaceScreen[]
  readonly selection: DeviceSelection
  readonly devices: readonly DeviceConfig[]
  readonly selectedDevices: readonly DeviceConfig[]
  readonly pxPerMm: number
  readonly knobValues: Readonly<Record<string, number>>
  readonly calibration: LabCalibrationController
  readonly setDevicesSegment: (devicesSegment: string) => void
  readonly setThemeId: (themeId: string) => void
  readonly setSurfacePath: (surfacePath: string) => void
  /** When true (default) a frame's navigation mirrors to every frame (one
   * screen everywhere). When false each frame owns its own route, so devices
   * can sit in different spaces side by side. Optional so harness doubles that
   * predate the toggle keep working — consumers default to synced. */
  readonly synced?: boolean
  readonly setSynced?: (synced: boolean) => void
}

export const LabContext = createContext<LabContextValue | null>(null)

export function useLab(): LabContextValue {
  const context = useContext(LabContext)
  if (!context) throw new Error("useLab must be used within a LabRoot")
  return context
}
