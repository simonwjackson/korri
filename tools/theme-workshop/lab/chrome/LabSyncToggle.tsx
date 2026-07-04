import { useLab } from "../Lab.context"

/**
 * Route-sync toggle for the workspace control cluster. Synced (default) mirrors
 * one route to every frame — the completed multi-device "one screen everywhere"
 * behavior. Un-synced lets each frame own its own route, so devices can sit in
 * different spaces side by side for comparison.
 */
export function LabSyncToggle() {
  const { synced = true, setSynced } = useLab()
  return (
    <div className="pt-seg pt-seg-sm">
      <button
        type="button"
        aria-label="Sync frames"
        aria-pressed={synced}
        className={`pt-seg-btn${synced ? " is-on" : ""}`}
        onClick={() => setSynced?.(!synced)}
      >
        {synced ? "Synced" : "Un-synced"}
      </button>
    </div>
  )
}
