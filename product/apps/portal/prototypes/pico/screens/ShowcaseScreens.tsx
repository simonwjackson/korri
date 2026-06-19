/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SHOWCASE — the "more pop" iteration. Art-forward, content-first
 * (NO system picker, NO A–Z list), leaning into janky retro motion: auto-
 * advancing coverflow, choppy steps() bobbing, glow-breathe, pop-in, palette
 * flicker. Built to compare against the flatter Library screens before the look
 * is rolled out wider. Composed from screens/kit.tsx; motion lives in
 * screens/showcase.css (namespace pcShow-). Intrinsic tokens still rule: type
 * via --pico-text-*, art bounded by min(<cqh>, calc(var(--pico-base) * N)).
 *
 * Data comes from PicoLibrary via atoms (never a fixture import) — the screen
 * reads `picoGamesAtom` / `picoShowcaseAtom` through `PicoData`.
 */
import {
  picoHeroAtom,
  picoShowcaseAtom,
} from "../data/pico-library-atoms"
import type { PicoGame } from "../fixtures"
import { PicoArtImage } from "../PicoArtImage"
import { PicoData } from "./PicoData"
import { PicoCart, PicoIcon, Screen } from "./kit"

/**
 * Spotlight Home was lifted to the atomic-design page layer
 * (pages/showcase/SpotlightHome) and decomposed into template / organisms /
 * molecules / atoms — the first vertical slice of the refactor. Re-exported here
 * so screen-catalog's `Showcase.SpotlightHomeScreen` keeps resolving while the
 * rest of the group still lives in this file.
 */
export { SpotlightHome as SpotlightHomeScreen } from "../pages/showcase/SpotlightHome"

/**
 * Single-game "jump back in" hero: the one game you last played, big and
 * cinematic. Full-bleed pixelized key art + logo + one CONTINUE — the most
 * content-first surface there is (no rails, no list, one decision).
 */
export function LastPlayedScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ CONTINUE">
      {game => <LastPlayedBody game={game} />}
    </PicoData>
  )
}

function LastPlayedBody({
  game,
}: {
  readonly game: PicoGame | undefined
}) {
  if (!game) {
    return (
      <Screen title="PICO ▸ CONTINUE" hints={[{ key: "b", label: "BACK" }]}>
        <div className="pcLast-empty">Nothing played yet.</div>
      </Screen>
    )
  }
  const backdrop = game.heroUrl ?? game.art
  const meta = [game.lastPlayedLabel, game.playtimeLabel]
    .filter(Boolean)
    .join(" · ")
  return (
    <Screen
      title="PICO ▸ CONTINUE"
      hints={[
        { key: "a", label: "CONTINUE" },
        { key: "y", label: "INFO" },
        { key: "b", label: "LIBRARY" },
      ]}
      className="pad-0"
    >
      <div className="pcLast">
        {backdrop ? (
          <PicoArtImage
            src={backdrop}
            ratio={16 / 9}
            scale={2.8}
            className="pcLast-bg"
          />
        ) : null}
        <div className="pcLast-inner">
          <div className="pcLast-kicker">▸ JUMP BACK IN</div>
          {game.logoUrl ? (
            <PicoArtImage
              src={game.logoUrl}
              fit="contain"
              scale={3}
              className="pcLast-logo"
            />
          ) : (
            <h1 className="pc-title pc-t3 pcLast-title">{game.title}</h1>
          )}
          {meta ? <div className="pcLast-meta">LAST PLAYED {meta}</div> : null}
          <span className="pcLast-cta">
            <PicoIcon name="play" /> CONTINUE
          </span>
        </div>
      </div>
    </Screen>
  )
}

/**
 * Content-first browse: curated, contextual shelves (Continue / Because you
 * played X / Fresh drops), each a strip of big art. The anti-pattern this
 * replaces is "choose a system, then an A–Z list".
 */
export function ForYouShelvesScreen() {
  return (
    <PicoData atom={picoShowcaseAtom} title="PICO ▸ FOR YOU">
      {({ games, recent }) => {
        const anchor =
          recent[0]?.title ?? games[0]?.title ?? "YOUR GAMES"
        const shelves = [
          { title: "CONTINUE", games: recent.slice(0, 6) },
          {
            title: `BECAUSE YOU PLAYED ${anchor.toUpperCase()}`,
            games: games.slice(2, 8),
          },
          { title: "FRESH DROPS", games: games.slice(8, 14) },
          { title: "PICK UP & PLAY", games: games.slice(1, 7) },
        ].filter(shelf => shelf.games.length > 0)

        return (
          <Screen
            title="PICO ▸ FOR YOU"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "INFO" },
              { key: "b", label: "BACK" },
            ]}
            className="pad-0"
          >
            <div className="pcShow-shelves">
              {shelves.map((shelf, row) => (
                <div className="pcShow-shelf" key={shelf.title}>
                  <div className="pcShow-shelf-title">{shelf.title}</div>
                  <div className="pcShow-shelf-row">
                    {shelf.games.map((game, col) => (
                      <div
                        key={game.id}
                        className={`pcShow-tile ${row === 0 && col === 0 ? "on" : ""}`}
                      >
                        <PicoCart game={game} showFav={false} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}
