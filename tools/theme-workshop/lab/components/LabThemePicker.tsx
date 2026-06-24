import { labSurfaceAdapters, type LabSurfaceAdapter } from "../surface-registry"
import { useLab } from "../Lab.context"

export function LabThemePicker({
  adapters = labSurfaceAdapters(),
}: {
  readonly adapters?: readonly LabSurfaceAdapter[]
}) {
  const { themeId, setThemeId } = useLab()
  if (adapters.length <= 1) return null

  return (
    <label className="lab-route-control">
      <span>Theme</span>
      <select value={themeId} onChange={event => setThemeId(event.target.value)}>
        {adapters.map(adapter => (
          <option key={adapter.id} value={adapter.id}>
            {adapter.id}
          </option>
        ))}
      </select>
    </label>
  )
}
