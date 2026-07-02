/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A settings row: a label on the left and a control (toggle / cycler / bar /
 * info) supplied as children. Shared by the display/network/labs/system panes.
 */
import type { ReactNode } from "react"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function SettingRow({
  label,
  state = "default",
  children,
}: {
  readonly label: string
  readonly state?: "default" | "selected"
  readonly children?: ReactNode
}) {
  return (
    <div
      className={`pcSet-row ${state === "selected" ? "sel" : ""}`}
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.settingRow)}
    >
      <span className="pcSet-label">{label}</span>
      {children}
    </div>
  )
}
