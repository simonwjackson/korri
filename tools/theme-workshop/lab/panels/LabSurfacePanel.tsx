import { LabSurfaceSelect } from "../components/LabSurfaceSelect"

/** Chooses which product surface adapter the workspace is editing. */
export function LabSurfacePanel() {
  return (
    <div className="pt-surface-panel">
      <LabSurfaceSelect />
    </div>
  )
}
