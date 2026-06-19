/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The filter & sort controls: genre chips, a sort cycler, and boolean toggles.
 * Renders a fragment of sections. Leaf atoms (Chip/Opt/Dim/Row/Toggle) still come
 * from the kit barrel until they migrate.
 */
import { Chip, Dim, Opt, Row, Toggle } from "../../screens/kit"

export function FilterSortPanel() {
  return (
    <>
      <div className="pcLib-section">
        <div className="pc-card-title">GENRE</div>
        <div className="pc-wrap">
          <Chip>PLATFORMER</Chip>
          <Chip>RPG</Chip>
          <Chip>SHMUP</Chip>
          <Chip>PUZZLE</Chip>
          <Chip>ACTION</Chip>
        </div>
      </div>
      <div className="pcLib-section">
        <div className="pc-card-title">SORT</div>
        <Opt value="RECENT" />
        <div className="pcLib-sort-rest">
          <Dim>A-Z</Dim>
          <Dim>PLAYTIME</Dim>
        </div>
      </div>
      <div className="pcLib-section">
        <div className="pc-card-title">TOGGLES</div>
        <Row label="INSTALLED ONLY" trailing={<Toggle on={true} />} />
        <Row label="FAVORITES ONLY" trailing={<Toggle on={false} />} />
      </div>
    </>
  )
}
