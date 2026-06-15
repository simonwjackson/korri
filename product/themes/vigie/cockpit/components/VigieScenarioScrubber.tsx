import { useVigieCockpit } from "../VigieCockpit.context"

// Spike-only affordance: step the session through every interim state so the
// IA can be evaluated against Idle / Preparing / Streaming / Recovering. This
// stands in for live state until the cockpit is wired to sessiond.

export function VigieScenarioScrubber() {
  const { scenarios, activeScenarioId, selectScenario } = useVigieCockpit()
  const tag =
    scenarios.length === 1 && scenarios[0]?.id === "live" ? "Live" : "Preview"

  return (
    <div className="vigie-scrubber">
      <span className="vigie-scrubber-tag">{tag}</span>
      <div className="vigie-segment">
        {scenarios.map(scenario => (
          <button
            key={scenario.id}
            type="button"
            className="vigie-segment-item"
            data-active={scenario.id === activeScenarioId}
            onClick={() => selectScenario(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>
    </div>
  )
}
