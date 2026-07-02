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
      <div
        className="pcFil-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilSection)}
      >
        SYSTEMS
      </div>
      <div
        className="pcFil-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilList)}
      >
        {SYSTEMS.map((system, index) => (
          <div
            key={system}
            className={`pcFil-item ${index === 0 ? "on" : ""}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilItem)}
          >
            {system}
          </div>
        ))}
      </div>
      <div
        className="pcFil-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilSection)}
      >
        GENRE
      </div>
      <div
        className="pcFil-chips"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilChips)}
      >
        {["ACTION", "PUZZLE", "RPG", "RACING", "CO-OP"].map(genre => (
          <Chip key={genre}>{genre}</Chip>
        ))}
      </div>
      <div
        className="pcFil-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFilSection)}
      >
        SORT
      </div>
      <Opt value="RECENT" />
    </div>
  )
}
