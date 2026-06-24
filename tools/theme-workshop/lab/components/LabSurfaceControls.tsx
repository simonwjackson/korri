import { WorkshopControls } from "../../WorkshopControls"
import { useLab } from "../Lab.context"

/**
 * Renders a surface's own live controls (declared by the adapter as
 * WorkshopControl[]) with the workshop's neutral chrome. Surface-specific knobs
 * — e.g. pico's PICO-8 granularity/palette/sound — drive a cross-root settings
 * store, so changes here reach the mounted surface in its own React root.
 */
export function LabSurfaceControls() {
  const { adapter } = useLab()
  if (!adapter.useControls) return null

  return (
    <div
      className="lab-surface-controls"
      aria-label="Surface-specific controls"
    >
      <WorkshopControls useControls={adapter.useControls} />
    </div>
  )
}
