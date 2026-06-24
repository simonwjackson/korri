/**
 * Shift page — Game Detail.
 *
 * The screen you land on after selecting a game. A port of pico's Variant D
 * (Game Detail) into Shift's visual identity: it keeps pico's information
 * architecture (status strip / art + info body / button-hint bar) and its
 * art-direction seam — stacked on a tall handheld, split hero | info on a
 * wide lean-back panel — but renders it with Shift's intrinsic token scale,
 * rounded surfaces, and lavender accent. The seam is a single container
 * aspect-ratio query (see [data-shift-detail] .shift-detail-body in shift.css),
 * so it is driven by the device's true shape, not viewport breakpoints.
 *
 * Data-shape note: takes a flat view model rather than a platform playable so
 * the page stays decoupled from library wiring; the device-lab config maps the
 * game fixtures into it (mirrors pico's VariantGameDetail taking PicoGame[]).
 */
import { type CSSProperties, useState } from "react"

export interface ShiftGameDetailView {
  readonly id: string
  readonly title: string
  readonly artUrl: string
  readonly genre?: string
  readonly developer?: string
  readonly lastPlayedLabel?: string
  readonly playtimeLabel?: string
  readonly favorite?: boolean
}

export interface ShiftGameDetailScreenProps {
  readonly games: readonly ShiftGameDetailView[]
  /** Which entry to open on first render. Defaults to the first game. */
  readonly initialIndex?: number
  readonly onPlay?: (game: ShiftGameDetailView) => void
}

export function ShiftGameDetailScreen({
  games,
  initialIndex = 0,
  onPlay,
}: ShiftGameDetailScreenProps) {
  const [index, setIndex] = useState(initialIndex)
  const game = games[index]
  if (!game) return null
  const played = Boolean(game.lastPlayedLabel)
  const tags = [game.genre, game.developer].filter(Boolean).join(" · ")

  return (
    <div data-shift-detail className="intrinsic">
      <div className="shift-detail-statusbar">Library ▸ Game</div>

      <div className="shift-detail-body">
        <div className="shift-detail-art">
          <img src={game.artUrl} alt="" loading="lazy" />
        </div>
        <div className="shift-detail-info">
          <h1 className="shift-detail-title">{game.title}</h1>
          {tags ? <div className="shift-detail-tags">{tags}</div> : null}
          <p className="shift-detail-synopsis">
            A {(game.genre ?? "game").toLowerCase()} from{" "}
            {game.developer ?? "an independent studio"}. Jump straight back into
            your last save, or start fresh — your call.
          </p>
          <div className="shift-detail-stats">
            <span>
              {played ? `Last played ${game.lastPlayedLabel}` : "Never played"}
            </span>
            {game.playtimeLabel ? (
              <span>{game.playtimeLabel} played</span>
            ) : null}
            {game.favorite ? (
              <span className="shift-detail-fav">★ Favorite</span>
            ) : null}
          </div>
          <div className="shift-detail-actions">
            <button
              type="button"
              className="shift-detail-btn primary"
              onClick={() => onPlay?.(game)}
            >
              ▶ {played ? "Continue" : "Play"}
            </button>
            {played ? (
              <button type="button" className="shift-detail-btn">
                New Game
              </button>
            ) : null}
            <button type="button" className="shift-detail-btn">
              ★ Favorite
            </button>
          </div>
        </div>
      </div>

      <div className="shift-detail-buttonbar">
        <DetailHint glyph="A" label={played ? "Continue" : "Play"} />
        <DetailHint glyph="Y" label="Favorite" />
        <DetailHint glyph="B" label="Back" />
      </div>

      {/* dev-only steppers so the prototype is explorable without a gamepad */}
      <button
        type="button"
        aria-label="previous game"
        onClick={() => setIndex((index - 1 + games.length) % games.length)}
        style={stepStyle("left")}
      />
      <button
        type="button"
        aria-label="next game"
        onClick={() => setIndex((index + 1) % games.length)}
        style={stepStyle("right")}
      />
    </div>
  )
}

function DetailHint({
  glyph,
  label,
}: {
  readonly glyph: string
  readonly label: string
}) {
  return (
    <span className="shift-detail-hint">
      <span className="shift-detail-hint-glyph" aria-hidden>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  )
}

function stepStyle(side: "left" | "right"): CSSProperties {
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
