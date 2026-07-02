/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The filter & sort controls: genre chips, a sort cycler, and boolean toggles.
 * Renders a fragment of sections. Leaf atoms (Chip/Opt/Dim/Row/Toggle) still come
 * from the kit barrel until they migrate.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Chip } from "../atoms/Chip"
import { Dim } from "../atoms/Dim"
import { Toggle } from "../atoms/Toggle"
import { Opt } from "../molecules/Opt"
import { Row } from "../molecules/Row"

export function FilterSortPanel() {
  return (
    <>
      <div
        className="pcLib-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibSection)}
      >
        <div
          className="pc-card-title"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCardTitle)}
        >
          GENRE
        </div>
        <div className="pc-wrap">
          <Chip>PLATFORMER</Chip>
          <Chip>RPG</Chip>
          <Chip>SHMUP</Chip>
          <Chip>PUZZLE</Chip>
          <Chip>ACTION</Chip>
        </div>
      </div>
      <div
        className="pcLib-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibSection)}
      >
        <div
          className="pc-card-title"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCardTitle)}
        >
          SORT
        </div>
        <Opt value="RECENT" />
        <div
          className="pcLib-sort-rest"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibSortRest)}
        >
          <Dim>A-Z</Dim>
          <Dim>PLAYTIME</Dim>
        </div>
      </div>
      <div
        className="pcLib-section"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLibSection)}
      >
        <div
          className="pc-card-title"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCardTitle)}
        >
          TOGGLES
        </div>
        <Row label="INSTALLED ONLY" trailing={<Toggle state="on" />} />
        <Row label="FAVORITES ONLY" trailing={<Toggle state="off" />} />
      </div>
    </>
  )
}
