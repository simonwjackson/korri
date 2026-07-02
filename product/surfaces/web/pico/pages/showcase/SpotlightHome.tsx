/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Content-first home: one big featured game that auto-rotates, with a live
 * coverflow strip underneath. Art is the hero; text is a kicker + title + one
 * tag line. No list, no taxonomy.
 *
 * As a page it owns only data + state: it reads `picoGamesAtom` through
 * `PicoData`, drives the rotation, and composes a template (`ScreenShell`) with
 * organisms (`SpotlightHero`, `CoverflowRail`). All markup/styling lives in
 * those lower layers — the first vertical slice of the atomic-design refactor.
 */
import { useEffect, useState } from "react"
import { picoGamesAtom } from "../../data/pico-library-atoms"
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { CoverflowRail } from "../../ui/organisms/CoverflowRail"
import { SpotlightHero } from "../../ui/organisms/SpotlightHero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function SpotlightHome() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ SPOTLIGHT">
      {games => <SpotlightHomeBody allGames={games} />}
    </PicoData>
  )
}

function SpotlightHomeBody({
  allGames,
}: {
  readonly allGames: readonly PicoGame[]
}) {
  const games = allGames.slice(0, 8)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (games.length === 0) return
    const timer = setInterval(() => {
      setIndex(value => (value + 1) % games.length)
    }, 2600)
    return () => clearInterval(timer)
  }, [games.length])

  const hero = games[index] ?? allGames[0]
  if (!hero) return null
  const playState = hero.lastPlayedLabel !== null ? "continue" : "start"

  return (
    <ScreenShell
      title="PICO ▸ SPOTLIGHT"
      hints={[
        { key: "a", label: playState === "continue" ? "CONTINUE" : "PLAY" },
        { key: "y", label: "INFO" },
        { key: "b", label: "BACK" },
      ]}
      className="pad-0"
    >
      <div
        className="pcShow-spot"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcShowSpot)}
      >
        <SpotlightHero hero={hero} playState={playState} />
        <CoverflowRail games={games} activeIndex={index} />
      </div>
    </ScreenShell>
  )
}
