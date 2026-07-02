/**
 * pico surface.
 * Variant E — In-Game: the pause / quick-menu overlay shown DURING a session.
 * A session may be local (emulated core) or streamed (remote host), so the
 * SRC badge toggles between the two and the live-stats strip swaps to match.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoButtonBar } from "./PicoStatusBar"

const MENU = [
  "RESUME",
  "SAVE STATE",
  "LOAD STATE",
  "RESTART",
  "SETTINGS",
  "QUIT",
] as const

export function VariantInGame({ game }: { readonly game: PicoGame }) {
  const [sel, setSel] = useState(0)
  const [streamed, setStreamed] = useState(true)

  return (
    <div className="pcE">
      <div className="pcE-game" aria-hidden="true" />
      <div className="pcE-pause">
        <div className="pcE-panel">
          <div className="pcE-head">
            <span className="pcE-title">{game.title}</span>
            <button
              type="button"
              className={`pcE-src ${streamed ? "stream" : "local"}`}
              onClick={() => setStreamed(s => !s)}
            >
              {streamed ? "STREAM" : "LOCAL"}
            </button>
          </div>

          <div className="pcE-stats">
            {streamed ? (
              <>
                <span className="pcE-stat">
                  HOST <b>ODIN-PC</b>
                </span>
                <span className="pcE-stat">
                  PING <b>14ms</b>
                </span>
                <span className="pcE-stat">
                  RATE <b>18Mbps</b>
                </span>
                <span className="pcE-stat">
                  FPS <b>59</b>
                </span>
              </>
            ) : (
              <>
                <span className="pcE-stat">
                  CORE <b>snes9x</b>
                </span>
                <span className="pcE-stat">
                  FPS <b>60</b>
                </span>
                <span className="pcE-stat">
                  BAT <b>82%</b>
                </span>
              </>
            )}
          </div>

          <div className="pcE-menu">
            {MENU.map((label, i) => {
              const slot = label === "SAVE STATE" || label === "LOAD STATE"
              return (
                <button
                  type="button"
                  key={label}
                  className={`pcE-mi ${i === sel ? "sel" : ""}`}
                  onClick={() => setSel(i)}
                >
                  <span>{label}</span>
                  {slot ? <span className="pcE-slot">SLOT 1</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <PicoButtonBar
        hints={[
          { key: "a", label: "SELECT" },
          { key: "b", label: "RESUME" },
          { key: "y", label: "SAVE" },
        ]}
      />
    </div>
  )
}
