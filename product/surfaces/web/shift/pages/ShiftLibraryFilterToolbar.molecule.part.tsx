/**
 * Filter Toolbar molecule catalog entry — the standing filter/sort bar,
 * rendered from the real genre facets of the dev library.
 */
import { SHIFT_LIBRARY_GAMES } from "../config"
import { SHIFT_DESIGN_PARTS } from "../shift-design-parts"
import { ShiftPartFrame } from "../ui/ShiftPartFrame"
import { ShiftLibraryFilterToolbar } from "./ShiftLibraryFilterToolbar"
import { deriveShiftLibraryGenres } from "./shift-library-query"

const facets = deriveShiftLibraryGenres(SHIFT_LIBRARY_GAMES)

export default {
  designPartId: SHIFT_DESIGN_PARTS.filterToolbar.id,
  name: "Filter Toolbar",
  note: "Filter Bar",
  render: () => (
    <ShiftPartFrame height={100}>
      <ShiftLibraryFilterToolbar
        favoriteOnly={false}
        onToggleFavorite={() => undefined}
        facets={facets}
        selectedGenres={[]}
        onToggleGenre={() => undefined}
        sort="recent"
        onCycleSort={() => undefined}
      />
    </ShiftPartFrame>
  ),
}
