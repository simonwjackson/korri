import { useVigieCockpit } from "../VigieCockpit.context"

// The unified launch→run→cool spine as a horizontal lane. Completed phases are
// checked, the active phase is highlighted with its substate, a failed phase is
// marked. History and current position are glanceable without reading a log.

export function VigieSessionPhaseLane() {
  const { session } = useVigieCockpit()

  return (
    <ol className="vigie-lane" aria-label="Session phases">
      {session.phases.map(phase => (
        <li
          key={phase.id}
          className="vigie-lane-step"
          data-status={phase.status}
        >
          <span className="vigie-lane-marker" aria-hidden="true">
            {phase.status === "done"
              ? "✓"
              : phase.status === "failed"
                ? "✕"
                : phase.status === "active"
                  ? "●"
                  : "○"}
          </span>
          <span className="vigie-lane-label">{phase.label}</span>
          {phase.substate ? (
            <span className="vigie-lane-substate">{phase.substate}</span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
