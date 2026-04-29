import { useState } from "react"
import { useFeatureGates } from "./FeatureGatesProvider"

export function FeatureGatesPanel() {
  const { canToggle, environment, gateNames, resolved, toggleGate } =
    useFeatureGates()
  const [open, setOpen] = useState(false)

  if (!canToggle) {
    return null
  }

  const enabledCount = gateNames.filter(name => resolved[name].enabled).length

  return (
    <div className="fixed right-4 bottom-4 z-50 text-sm">
      <button
        type="button"
        className="rounded-full border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        onClick={() => setOpen(current => !current)}
      >
        Gates{enabledCount > 0 ? ` (${enabledCount})` : ""}
      </button>

      {open && (
        <div className="mt-3 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="space-y-1">
            <h2 className="font-semibold text-slate-950">Feature gates</h2>
            <p className="text-xs text-slate-500">Environment: {environment}</p>
          </div>

          <div className="mt-4 space-y-3">
            {gateNames.length === 0 && (
              <p className="text-slate-500">No gates registered.</p>
            )}

            {gateNames.map(name => {
              const gate = resolved[name]

              return (
                <label
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <span className="min-w-0 font-mono text-xs text-slate-700">
                    {name}
                  </span>
                  <input
                    type="checkbox"
                    checked={gate.requested}
                    onChange={() => toggleGate(name)}
                  />
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
