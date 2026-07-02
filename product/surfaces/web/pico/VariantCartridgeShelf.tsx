/**
 * pico surface.
 * Variant A — Cartridge Shelf: one hero cartridge, neighbours peeking,
 * big title + stats underneath. Horizontal coverflow, one game at a time.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoCart } from "./PicoCart"
import { PicoCartUnmarked } from "./PicoCartUnmarked"
import { PicoButtonBar, PicoStatusBarLive } from "./PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

export function VariantCartridgeShelf({
  games,
  onSelect,
}: {
  readonly games: readonly PicoGame[]
  /** Activate the focused hero (real host wires this to navigation). */
  readonly onSelect?: (game: PicoGame) => void
}) {
  const [index, setIndex] = useState(2)
  const hero = games[index]
  const prev = games[(index - 1 + games.length) % games.length]
  const next = games[(index + 1) % games.length]
  const next2 = games[(index + 2) % games.length]
  if (!hero || !prev || !next || !next2) return null

  return (
    <div className="pcA" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcA)}>
      <PicoStatusBarLive label="PICO ▸ LIBRARY" />
      <div
        className="pcA-stage"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcAStage)}
      >
        <div
          className="pcA-dots"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcADots)}
        >
          {games.slice(0, 12).map((game, i) => (
            <b className={i === index ? "on" : ""} key={game.id} />
          ))}
        </div>
        <div
          className="pcA-carts"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcACarts)}
        >
          <PicoCartUnmarked game={prev} className="pcA-cart side" />
          <PicoCart game={hero} className="pcA-cart hero" />
          <PicoCartUnmarked game={next} className="pcA-cart side" />
          <PicoCartUnmarked game={next2} className="pcA-cart side" />
        </div>
        <div
          className="pcA-meta"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcAMeta)}
        >
          <h1>{hero.title}</h1>
          <div
            className="pcA-stats"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcAStats)}
          >
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
        {onSelect ? (
          <button
            type="button"
            aria-label={`open ${hero.title}`}
            onClick={() => onSelect(hero)}
            style={heroHit()}
          />
        ) : null}
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

/** Centered activation target over the focused hero cart. */
function heroHit(): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 30,
    left: 80,
    right: 80,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    zIndex: 20,
  }
}
