/**
 * pico surface.
 * Variant E — In-Game: the pause / quick-menu overlay shown DURING a session.
 * A session may be local (emulated core) or streamed (remote host), so the
 * SRC badge toggles between the two and the live-stats strip swaps to match.
 */
import { useState } from "react"
import type { PicoGame } from "./fixtures"
import { PicoButtonBar } from "./PicoStatusBar"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "./pico-design-parts"

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
    <div className="pcE" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcE)}>
      <div
        className="pcE-game"
        aria-hidden="true"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEGame)}
      />
      <div
        className="pcE-pause"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEPause)}
      >
        <div
          className="pcE-panel"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEPanel)}
        >
          <div
            className="pcE-head"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEHead)}
          >
            <span
              className="pcE-title"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcETitle)}
            >
              {game.title}
            </span>
            <button
              type="button"
              className={`pcE-src ${streamed ? "stream" : "local"}`}
              onClick={() => setStreamed(s => !s)}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcESrc)}
            >
              {streamed ? "STREAM" : "LOCAL"}
            </button>
          </div>

          <div
            className="pcE-stats"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStats)}
          >
            {streamed ? (
              <>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  HOST <b>ODIN-PC</b>
                </span>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  PING <b>14ms</b>
                </span>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  RATE <b>18Mbps</b>
                </span>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  FPS <b>59</b>
                </span>
              </>
            ) : (
              <>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  CORE <b>snes9x</b>
                </span>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  FPS <b>60</b>
                </span>
                <span
                  className="pcE-stat"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEStat)}
                >
                  BAT <b>82%</b>
                </span>
              </>
            )}
          </div>

          <div
            className="pcE-menu"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEMenu)}
          >
            {MENU.map((label, i) => {
              const slot = label === "SAVE STATE" || label === "LOAD STATE"
              return (
                <button
                  type="button"
                  key={label}
                  className={`pcE-mi ${i === sel ? "sel" : ""}`}
                  onClick={() => setSel(i)}
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcEMi)}
                >
                  <span>{label}</span>
                  {slot ? (
                    <span
                      className="pcE-slot"
                      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcESlot)}
                    >
                      SLOT 1
                    </span>
                  ) : null}
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
