/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Single-game "jump back in" hero: the one game you last played, big and
 * cinematic — the most content-first surface there is (no rails, no list, one
 * decision). Reads `picoHeroAtom`, handles the empty state, and composes
 * `ScreenShell` + `LastPlayedHero`.
 */
import { picoHeroAtom } from "../../data/pico-library-atoms"
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { LastPlayedHero } from "../../ui/organisms/LastPlayedHero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LastPlayed() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ CONTINUE">
      {game => <LastPlayedBody game={game} />}
    </PicoData>
  )
}

function LastPlayedBody({ game }: { readonly game: PicoGame | undefined }) {
  if (!game) {
    return (
      <ScreenShell
        title="PICO ▸ CONTINUE"
        hints={[{ key: "b", label: "BACK" }]}
      >
        <div
          className="pcLast-empty"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLastEmpty)}
        >
          Nothing played yet.
        </div>
      </ScreenShell>
    )
  }
  const backdrop = game.heroUrl ?? game.art
  const meta = [game.lastPlayedLabel, game.playtimeLabel]
    .filter(Boolean)
    .join(" · ")
  return (
    <ScreenShell
      title="PICO ▸ CONTINUE"
      hints={[
        { key: "a", label: "CONTINUE" },
        { key: "y", label: "INFO" },
        { key: "b", label: "LIBRARY" },
      ]}
      className="pad-0"
    >
      <div
        className="pcLast"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcLast)}
      >
        <LastPlayedHero game={game} backdrop={backdrop} meta={meta} />
      </div>
    </ScreenShell>
  )
}
