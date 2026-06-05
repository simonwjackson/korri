/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Variant B — Menu List + Preview: scrollable bordered list on the left,
 * selected game's cartridge + metadata preview on the right. Classic
 * JRPG / file-select density, text-forward, good for big libraries.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoButtonBar, PicoStatusBar } from "./PicoStatusBar"
import { PicoCart } from "./PicoCart"

export function VariantMenuList({
  games,
}: {
  readonly games: readonly PicoGame[]
}) {
  const [selected, setSelected] = useState(1)
  const sel = games[selected]
  // Window the list around the cursor so it reads like a scrolling menu.
  const start = Math.min(
    Math.max(0, selected - 5),
    Math.max(0, games.length - 13),
  )
  const window = games.slice(start, start + 13)
  if (!sel) return null

  return (
    <div className="pcB">
      <PicoStatusBar label="PICO ▸ ALL GAMES" />
      <div className="pcB-body">
        <div className="pcB-list">
          {window.map(game => {
            const isSel = game.id === sel.id
            return (
              <button
                type="button"
                key={game.id}
                className={`pcB-row ${isSel ? "sel" : ""}`}
                onClick={() => setSelected(games.indexOf(game))}
                style={rowReset}
              >
                <span className="pcB-cursor">▶</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {game.title}
                </span>
                {game.favorite ? <span className="pcB-star">★</span> : null}
              </button>
            )
          })}
        </div>
        <div className="pcB-preview">
          <PicoCart game={sel} />
          <h1>{sel.title}</h1>
          <div className="pcB-tags">
            <span className="pcB-tag">{sel.genre.toUpperCase()}</span>
            <span className="pcB-tag">{sel.developer.toUpperCase()}</span>
          </div>
          <div className="pcB-statline">
            <span>
              LAST
              <b>{sel.lastPlayedLabel ?? "—"}</b>
            </span>
            <span>
              PLAYED
              <b>{sel.playtimeLabel ?? "—"}</b>
            </span>
            <span>
              FAV
              <b>{sel.favorite ? "YES" : "NO"}</b>
            </span>
          </div>
        </div>
      </div>
      <PicoButtonBar
        hints={[
          { key: "a", label: "LAUNCH" },
          { key: "y", label: "SORT" },
          { key: "b", label: "BACK" },
        ]}
      />
    </div>
  )
}

const rowReset: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
}
