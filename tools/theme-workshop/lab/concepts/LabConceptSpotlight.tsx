import { Slash, Sparkles } from "lucide-react"
import { LabConceptCount } from "./LabConceptCount"
import { LabConceptMic } from "./LabConceptMic"
import { LabConceptMockPart } from "./LabConceptMockPart"
import { LAB_CONCEPT_TARGET } from "./lab-concept-model"
import type { LabConceptSession } from "./lab-concept-session"

/** Spotlight — the part becomes the stage. Generating drops the takes onto the
 * canvas as loose objects to keep working with; the ask dock stays put below so
 * you can keep going. No accept/deny. */
export function LabConceptSpotlight({
  session,
}: {
  readonly session: LabConceptSession
}) {
  const hero = session.variants[0]
  return (
    <div className="lab-cstage-part-slot">
      <div className="lab-cspot">
        <div className="lab-cspot-tag">
          {LAB_CONCEPT_TARGET.layer} · {LAB_CONCEPT_TARGET.name}
        </div>

        {session.generated ? (
          <div className="lab-cspot-landed">
            {session.variants.map(variant => (
              <div key={variant.id} className="lab-cspot-tile">
                <span className="lab-cspot-scale">
                  <LabConceptMockPart variant={variant} />
                </span>
                <span className="lab-cspot-tile-name">{variant.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="lab-cspot-hero">
            <LabConceptMockPart variant={hero} />
          </div>
        )}

        <div className="lab-cspot-dock">
          <input
            className={`lab-cspot-textline${
              session.listening ? " is-voice" : ""
            }`}
            value={session.listening ? session.transcript : session.prompt}
            readOnly={session.listening}
            placeholder="Describe a direction…"
            aria-label="Design intent for Status Bar"
            onChange={event => session.onPrompt(event.target.value)}
          />
          <div className="lab-cspot-controls">
            <button
              type="button"
              className="lab-cspot-slash"
              aria-label="Commands"
            >
              <Slash size={15} aria-hidden />
            </button>
            <LabConceptCount count={session.count} onCount={session.onCount} />
            <div className="lab-cspot-voice">
              <LabConceptMic
                listening={session.listening}
                onToggle={session.onMicToggle}
              />
              <button
                type="button"
                className="lab-cspot-go"
                aria-label={`Generate ${session.count} takes`}
                onClick={session.onGenerate}
              >
                <Sparkles size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
