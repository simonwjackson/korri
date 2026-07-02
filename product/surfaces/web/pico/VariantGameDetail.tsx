/**
 * pico surface.
 * Variant D — Game Detail: the page you land on after selecting a game.
 * Art-directed by FORM FACTOR (not viewport px): on a tall/squarish handheld
 * it stacks art over metadata; on a wide lean-back panel it splits into a
 * hero on the left and metadata + actions on the right. The seam is a single
 * container aspect-ratio query (see .pcD-body in pico-prototype.css).
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoCartUnmarked } from "./PicoCartUnmarked"
import { PicoButtonBar, PicoStatusBarLive } from "./PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

export function VariantGameDetail({
  games,
  onPlay,
  onBack,
}: {
  readonly games: readonly PicoGame[]
  /** Launch the focused game (real host wires this to the launcher). */
  readonly onPlay?: () => void
  /** Leave the detail screen (real host wires this to navigation). */
  readonly onBack?: () => void
}) {
  const [index, setIndex] = useState(1)
  // Fixture browsing starts at index 1; a real host passes a single game, so
  // fall back to the first entry when the index is out of range.
  const game = games[index] ?? games[0]
  if (!game) return null
  const played = game.lastPlayedLabel !== null

  return (
    <div className="pcD" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcD)}>
      <PicoStatusBarLive label="PICO ▸ GAME" />
      <div
        className="pcD-body"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDBody)}
      >
        <div
          className="pcD-art"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDArt)}
        >
          <PicoCartUnmarked game={game} />
        </div>
        <div
          className="pcD-info"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDInfo)}
        >
          <h1>{game.title}</h1>
          <div
            className="pcD-tags"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDTags)}
          >
            {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
          </div>
          <p
            className="pcD-synopsis"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDSynopsis)}
          >
            A {game.genre.toLowerCase()} from {game.developer}. Jump straight
            back into your last save, or start fresh — your call.
          </p>
          <div
            className="pcD-stats"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDStats)}
          >
            <span>
              {played
                ? `LAST PLAYED ${(game.lastPlayedLabel ?? "").toUpperCase()}`
                : "NEVER PLAYED"}
            </span>
            {game.playtimeLabel ? (
              <span>{game.playtimeLabel} PLAYED</span>
            ) : null}
            {game.favorite ? (
              <span
                className="pcD-favtag"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDFavtag)}
              >
                ★ FAVORITE
              </span>
            ) : null}
          </div>
          <div
            className="pcD-actions"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDActions)}
          >
            <button
              type="button"
              className="pcD-btn primary"
              onClick={onPlay}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDBtn)}
            >
              ▶ {played ? "CONTINUE" : "PLAY"}
            </button>
            {played ? (
              <button
                type="button"
                className="pcD-btn"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDBtn)}
              >
                NEW GAME
              </button>
            ) : null}
            <button
              type="button"
              className="pcD-btn"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDBtn)}
            >
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
