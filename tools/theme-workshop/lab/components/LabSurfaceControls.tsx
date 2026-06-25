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
      {/* Key by surface id so the renderer REMOUNTS on a surface switch. Each
       * surface's useControls hook calls a different number of hooks (shift: 1,
       * pico: 3); reusing one instance across surfaces trips React's "rendered
       * more hooks than during the previous render". */}
      <WorkshopControls key={adapter.id} useControls={adapter.useControls} />
    </div>
  )
}
