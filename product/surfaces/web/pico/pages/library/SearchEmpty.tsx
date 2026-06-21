/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Search with no matches: the query line over a no-results hero. Composes
 * ScreenShell + SearchQuery + Hero (Hero still from the kit barrel).
 */

import { SearchQuery } from "../../ui/molecules/SearchQuery"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SearchEmpty() {
  return (
    <ScreenShell
      title="PICO ▸ SEARCH"
      hints={[
        { key: "a", label: "TYPE" },
        { key: "b", label: "CLEAR" },
      ]}
    >
      <SearchQuery text="ZXQWPLK" />
      <Hero
        glyph="○"
        glyphTone="info"
        title="NO RESULTS"
        message="nothin' matches “ZXQWPLK” — try fewer letters, or poke a different system?"
      />
    </ScreenShell>
  )
}
