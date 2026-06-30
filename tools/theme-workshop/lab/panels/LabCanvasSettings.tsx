import type { LabPlacementPattern } from "../model/lab-canvas-placement"
import {
  setLabPlacementPattern,
  useLabPlacementPattern,
} from "../model/lab-placement-store"

type PatternChoice = {
  readonly id: LabPlacementPattern
  readonly label: string
  readonly description: string
}

const CHOICES: readonly PatternChoice[] = [
  {
    id: "spiral",
    label: "Spiral",
    description:
      "Parts ring outward from the centre of the cluster, staying compact.",
  },
  {
    id: "grid",
    label: "Grid",
    description:
      "Parts fill a tidy three-column block, wrapping into the first free slot.",
  },
]

/**
 * Compose-board placement preference. Chooses where a freshly placed part lands
 * and how the Tidy command repacks the board. Persisted across sessions.
 */
export function LabCanvasSettings() {
  const pattern = useLabPlacementPattern()

  return (
    <div className="lab-canvas-settings">
      <p className="lab-canvas-settings-hint">
        Where a part lands when you place it on the Compose board. Tidy repacks
        using the same pattern.
      </p>
      <fieldset className="lab-canvas-settings-group">
        <legend className="lab-canvas-settings-legend">Placement</legend>
        {CHOICES.map(choice => (
          <label
            key={choice.id}
            className={`lab-canvas-settings-choice${pattern === choice.id ? " is-on" : ""}`}
          >
            <input
              type="radio"
              name="lab-placement-pattern"
              value={choice.id}
              checked={pattern === choice.id}
              onChange={() => setLabPlacementPattern(choice.id)}
            />
            <span className="lab-canvas-settings-choice-text">
              <span className="lab-canvas-settings-choice-label">
                {choice.label}
              </span>
              <span className="lab-canvas-settings-choice-desc">
                {choice.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
