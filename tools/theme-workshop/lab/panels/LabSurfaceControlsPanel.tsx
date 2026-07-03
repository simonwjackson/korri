import { WorkshopControls } from "../../WorkshopControls"
import { useLab } from "../Lab.context"

export function LabSurfaceControlsPanel() {
  const { adapter } = useLab()
  if (!adapter.useControls)
    return <div className="lab-panel-hint">No surface-specific controls.</div>
  return <WorkshopControls key={adapter.id} useControls={adapter.useControls} />
}
