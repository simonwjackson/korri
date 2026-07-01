import type { ReactNode } from "react"
/** A panel shown inside the lab's control overlay. */
export type LabChromePanel = {
  readonly id: string
  readonly label: string
  readonly render: () => ReactNode
  /** Optional control rendered alongside the tabs for this panel. */
  readonly action?: ReactNode
}
