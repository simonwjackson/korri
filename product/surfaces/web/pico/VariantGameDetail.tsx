/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Variant D — Game Detail: the page you land on after selecting a game.
 * Art-directed by FORM FACTOR (not viewport px): on a tall/squarish handheld
 * it stacks art over metadata; on a wide lean-back panel it splits into a
 * hero on the left and metadata + actions on the right. The seam is a single
 * container aspect-ratio query (see .pcD-body in pico-prototype.css).
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoCartUnmarked } from "./PicoCartUnmarked"
import { PicoButtonBar, PicoStatusBar } from "./PicoStatusBar"

export function VariantGameDetail({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const [index, setIndex] = useState(1)
  const game = games[index]
  if (!game) return null
  const played = game.lastPlayedLabel !== null

  return (
    <div className="pcD">
      <PicoStatusBar label="PICO ▸ GAME" />
      <div className="pcD-body">
        <div className="pcD-art">
          <PicoCartUnmarked game={game} />
        </div>
        <div className="pcD-info">
          <h1>{game.title}</h1>
          <div className="pcD-tags">
            {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
          </div>
          <p className="pcD-synopsis">
            A {game.genre.toLowerCase()} from {game.developer}. Jump straight
            back into your last save, or start fresh — your call.
          </p>
          <div className="pcD-stats">
            <span>
              {played
                ? `LAST PLAYED ${(game.lastPlayedLabel ?? "").toUpperCase()}`
                : "NEVER PLAYED"}
            </span>
            {game.playtimeLabel ? (
              <span>{game.playtimeLabel} PLAYED</span>
            ) : null}
            {game.favorite ? (
              <span className="pcD-favtag">★ FAVORITE</span>
            ) : null}
          </div>
          <div className="pcD-actions">
            <button type="button" className="pcD-btn primary">
              ▶ {played ? "CONTINUE" : "PLAY"}
            </button>
            {played ? (
              <button type="button" className="pcD-btn">
                NEW GAME
              </button>
            ) : null}
            <button type="button" className="pcD-btn">
              ★ FAVORITE
            </button>
          </div>
        </div>
      </div>
      <PicoButtonBar
        hints={[
          { key: "a", label: played ? "CONTINUE" : "PLAY" },
          { key: "y", label: "FAVORITE" },
          { key: "b", label: "BACK" },
        ]}
      />
      {/* dev-only steppers so the prototype is explorable without a gamepad */}
      <button
        type="button"
        aria-label="previous game"
        onClick={() => setIndex((index - 1 + games.length) % games.length)}
        style={hiddenStep("left")}
      />
      <button
        type="button"
        aria-label="next game"
        onClick={() => setIndex((index + 1) % games.length)}
        style={hiddenStep("right")}
      />
    </div>
  )
}

function hiddenStep(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    height: "42%",
    [side]: 0,
    width: 56,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    zIndex: 30,
  }
}
