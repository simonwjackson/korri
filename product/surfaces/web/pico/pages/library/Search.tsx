/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Search with the on-screen keyboard + live results. Reads `picoGamesAtom`,
 * composes ScreenShell + SearchQuery + OnScreenKeyboard + SearchResults.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoData } from "../../screens/PicoData"
import { SearchQuery } from "../../ui/molecules/SearchQuery"
import { OnScreenKeyboard } from "../../ui/organisms/OnScreenKeyboard"
import { SearchResults } from "../../ui/organisms/SearchResults"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Search() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ SEARCH">
      {games => (
        <ScreenShell
          title="PICO ▸ SEARCH"
          hints={[
            { key: "a", label: "TYPE" },
            { key: "y", label: "DELETE" },
          ]}
        >
          <SearchQuery text="METRO" />
          <OnScreenKeyboard />
          <SearchResults games={games.slice(0, 3)} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
