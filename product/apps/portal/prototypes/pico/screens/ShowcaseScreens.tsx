/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SHOWCASE — the "more pop" iteration. Art-forward, content-first
 * (NO system picker, NO A–Z list), leaning into janky retro motion: auto-
 * advancing coverflow, choppy steps() bobbing, glow-breathe, pop-in, palette
 * flicker. Built to compare against the flatter Library screens before the look
 * is rolled out wider. Composed from screens/kit.tsx; motion lives in
 * screens/showcase.css (namespace pcShow-). Intrinsic tokens still rule: type
 * via --pico-text-*, art bounded by min(<cqh>, calc(var(--pico-base) * N)).
 */
import { useEffect, useState } from "react"
import { picoGames, picoRecent } from "../fixtures"
import { PicoCart, Screen } from "./kit"

/**
 * Content-first home: one big featured game that auto-rotates, with a live
 * coverflow strip underneath. Art is the hero; text is a kicker + title + one
 * tag line. No list, no taxonomy.
 */
export function SpotlightHomeScreen() {
  const games = picoGames.slice(0, 8)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (games.length === 0) return
    const timer = setInterval(() => {
      setIndex(value => (value + 1) % games.length)
    }, 2600)
    return () => clearInterval(timer)
  }, [games.length])

  const hero = games[index] ?? picoGames[0]
  if (!hero) return null
  const played = hero.lastPlayedLabel !== null

  return (
    <Screen
      title="PICO ▸ SPOTLIGHT"
      hints={[
        { key: "a", label: played ? "CONTINUE" : "PLAY" },
        { key: "y", label: "INFO" },
        { key: "b", label: "BACK" },
      ]}
      className="pad-0"
    >
      <div className="pcShow-spot">
        <div className="pcShow-spot-bg" />
        {/* key remounts the hero each rotation so the pop-in re-fires */}
        <div className="pcShow-spot-hero" key={hero.id}>
          <div className="pcShow-spot-art">
            <PicoCart game={hero} showFav={false} />
          </div>
          <div className="pcShow-spot-info">
            <div className="pcShow-kicker">▸ FEATURED</div>
            <h1 className="pc-title pc-t2 pcShow-spot-title">{hero.title}</h1>
            <div className="pcShow-spot-tags">
              {hero.genre.toUpperCase()} · {hero.developer.toUpperCase()}
            </div>
            <span className="pcShow-play">▶ {played ? "CONTINUE" : "PLAY"}</span>
          </div>
        </div>
        <div className="pcShow-rail">
          {games.map((game, idx) => (
            <div
              key={game.id}
              className={`pcShow-rail-cart ${idx === index ? "on" : ""}`}
            >
              <PicoCart game={game} showFav={false} />
            </div>
          ))}
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
  const anchor = picoRecent[0]?.title ?? picoGames[0]?.title ?? "YOUR GAMES"
  const shelves = [
    { title: "CONTINUE", games: picoRecent.slice(0, 6) },
    { title: `BECAUSE YOU PLAYED ${anchor.toUpperCase()}`, games: picoGames.slice(2, 8) },
    { title: "FRESH DROPS", games: picoGames.slice(8, 14) },
    { title: "PICK UP & PLAY", games: picoGames.slice(1, 7) },
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
}
