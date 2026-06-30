import type { ReactNode } from "react"
import type { LabCanvasView } from "../model/lab-canvas-state"

/** A panel shown inside the lab's control overlay. */
export type LabChromePanel = {
  readonly id: string
  readonly label: string
  readonly render: () => ReactNode
  /** Optional control rendered alongside the tabs for this panel. */
  readonly action?: ReactNode
}

/** A canvas view choice (Device / Compose) shown in the overlay. */
export type LabChromeView = {
  readonly id: LabCanvasView
  readonly label: string
}
