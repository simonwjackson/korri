/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Variant A — Cartridge Shelf: one hero cartridge, neighbours peeking,
 * big title + stats underneath. Horizontal coverflow, one game at a time.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoCart } from "./PicoCart"
import { PicoButtonBar, PicoStatusBar } from "./PicoStatusBar"

export function VariantCartridgeShelf({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const [index, setIndex] = useState(2)
  const hero = games[index]
  const prev = games[(index - 1 + games.length) % games.length]
  const next = games[(index + 1) % games.length]
  const next2 = games[(index + 2) % games.length]
  if (!hero || !prev || !next || !next2) return null

  return (
    <div className="pcA">
      <PicoStatusBar label="PICO ▸ LIBRARY" />
      <div className="pcA-stage">
        <div className="pcA-dots">
          {games.slice(0, 12).map((game, i) => (
            <b className={i === index ? "on" : ""} key={game.id} />
          ))}
        </div>
        <div className="pcA-carts">
          <PicoCart game={prev} className="pcA-cart side" showFav={false} />
          <PicoCart game={hero} className="pcA-cart hero" />
          <PicoCart game={next} className="pcA-cart side" showFav={false} />
          <PicoCart game={next2} className="pcA-cart side" showFav={false} />
        </div>
        <div className="pcA-meta">
          <h1>{hero.title}</h1>
          <div className="pcA-stats">
            {hero.lastPlayedLabel
              ? `LAST PLAYED ${hero.lastPlayedLabel.toUpperCase()}`
              : "NEVER PLAYED"}
            {hero.playtimeLabel ? ` · ${hero.playtimeLabel} PLAYED` : ""}
          </div>
        </div>
        {/* dev-only stepper so the prototype is explorable without a gamepad */}
        <button
          type="button"
          aria-label="previous"
          onClick={() => setIndex((index - 1 + games.length) % games.length)}
          style={hiddenStep("left")}
        />
        <button
          type="button"
          aria-label="next"
          onClick={() => setIndex((index + 1) % games.length)}
          style={hiddenStep("right")}
        />
      </div>
      <PicoButtonBar
        hints={[
          { key: "a", label: "PLAY" },
          { key: "y", label: "FAVORITE" },
          { key: "b", label: "BACK" },
        ]}
      />
    </div>
  )
}

function hiddenStep(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 30,
    [side]: 0,
    width: 80,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    zIndex: 30,
  }
}
