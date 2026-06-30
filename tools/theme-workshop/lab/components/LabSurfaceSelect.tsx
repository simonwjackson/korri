import { useLab } from "../Lab.context"
import { labSurfaceAdapters } from "../surface-registry"

/**
 * Top-bar surface (theme) switcher. Extracted so the desktop top bar and the
 * compact chrome designs share one control instead of duplicating the markup.
 */
export function LabSurfaceSelect() {
  const { adapter, setThemeId } = useLab()
  return (
    <label className="pt-surface-select">
      Surface
      <select
        value={adapter.id}
        onChange={event => setThemeId(event.currentTarget.value)}
      >
        {labSurfaceAdapters().map(candidate => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.id}
          </option>
        ))}
      </select>
    </label>
  )
}
