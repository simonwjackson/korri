/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The "which core drives this game" chooser: a column of app cards, the first
 * pre-picked. Leaf atoms (Card/Chip/Badge) still come from the kit barrel until
 * they migrate.
 */
import type { PicoAppChoice } from "../../fixtures-extra"
import { Badge, Card, Chip } from "../../screens/kit"

export function AppChoiceList({
  choices,
}: {
  readonly choices: readonly PicoAppChoice[]
}) {
  return (
    <div className="pcDet-choices">
      {choices.map((choice, index) => (
        <Card
          key={choice.id}
          title={choice.name}
          className={`pcDet-choice ${index === 0 ? "sel" : ""}`}
        >
          <div className="pcDet-choice-meta">
            <Chip>{choice.runtime}</Chip>
            {index === 0 ? <Badge tone="accent">PICK</Badge> : null}
          </div>
          <span className="pc-dim">{choice.note}</span>
        </Card>
      ))}
    </div>
  )
}
