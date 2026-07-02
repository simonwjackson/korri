/**
 * pico surface.
 * Variant C — Icon Grid: a console "home OS" desktop of cartridge icons
 * with a selection box, plus a bottom tray showing the focused game.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoCart } from "./PicoCart"
import { PicoCartUnmarked } from "./PicoCartUnmarked"
import { PicoStatusBarLive } from "./PicoStatusBar"

export function VariantIconGrid({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const [selected, setSelected] = useState(0)
  const sel = games[selected]
  const grid = games.slice(0, 20)
  if (!sel) return null

  return (
    <div className="pcC">
      <PicoStatusBarLive label="PICO ▸ HOME" />
      <div className="pcC-grid">
        {grid.map((game, i) => (
          <button
            type="button"
            key={game.id}
            className={`pcC-cell ${i === selected ? "sel" : ""}`}
            onClick={() => setSelected(i)}
            style={cellReset}
          >
            <PicoCart game={game} />
            <span className="pcC-name">{game.title}</span>
          </button>
        ))}
      </div>
      <div className="pcC-tray">
        <PicoCartUnmarked game={sel} />
        <div>
          <h1 className="pico-title-display">{sel.title}</h1>
          <div className="pcC-traysub">
            {sel.genre.toUpperCase()} ·{" "}
            {sel.lastPlayedLabel ? `LAST ${sel.lastPlayedLabel}` : "NEW"}
          </div>
        </div>
        <span className="pcC-play">▶ PLAY</span>
      </div>
    </div>
  )
}

const cellReset: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  font: "inherit",
  padding: 0,
}
