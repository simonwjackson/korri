/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Filters & collections drawer: systems list + genre chips + sort cycler. Moved
 * from screens/PanelsScreens.tsx.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Chip } from "../atoms/Chip"
import { Opt } from "../molecules/Opt"

const SYSTEMS: readonly string[] = [
  "ALL GAMES",
  "FAVORITES",
  "SUPER NES",
  "NES",
  "GAME BOY ADV",
  "PORTMASTER",
]

export function FiltersPanel() {
  return (
    <div
      className="pcFil"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.filtersPanel)}
    >
      <div className="pcFil-section">SYSTEMS</div>
      <div className="pcFil-list">
        {SYSTEMS.map((system, index) => (
          <div key={system} className={`pcFil-item ${index === 0 ? "on" : ""}`}>
            {system}
          </div>
        ))}
      </div>
      <div className="pcFil-section">GENRE</div>
      <div className="pcFil-chips">
        {["ACTION", "PUZZLE", "RPG", "RACING", "CO-OP"].map(genre => (
          <Chip key={genre}>{genre}</Chip>
        ))}
      </div>
      <div className="pcFil-section">SORT</div>
      <Opt value="RECENT" />
    </div>
  )
}
