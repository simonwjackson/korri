/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: IN-GAME — the in-session overlays a console shows ON TOP of a
 * running game: a minimal HUD, save/load state slot grids, the streaming
 * (moonlight) live-stats overlay, a reconnecting hero, and a controller
 * input-remap panel. In-session overlays sit over a `.pc-gamebg` backdrop.
 * Composed from screens/kit.tsx; screen-specific layout in screens/ingame.css
 * (namespace pcIg-).
 */
import { picoHero, picoSaveSlots } from "../fixtures-extra"
import { Badge, Btn, Hero, Modal, Spinner, Stat, Title } from "./kit"

const REMAP_ACTIONS: readonly {
  readonly action: string
  readonly button: string
  readonly listening?: boolean
}[] = [
  { action: "UP", button: "D-PAD ↑" },
  { action: "DOWN", button: "D-PAD ↓" },
  { action: "A", button: "SOUTH ●" },
  { action: "B", button: "EAST ●", listening: true },
  { action: "X", button: "WEST ●" },
  { action: "Y", button: "NORTH ●" },
  { action: "L", button: "L1" },
  { action: "R", button: "R1" },
  { action: "START", button: "START +" },
  { action: "SELECT", button: "SELECT −" },
]

export function InGameHudScreen() {
  return (
    <div className="pc-root">
      <div className="pc-gamebg" />
      <div className="pcIg-hud">
        <div className="pcIg-hud-corner tl">
          <span className="pcIg-read">
            FPS <b>60</b>
          </span>
          <span className="pcIg-read">
            BAT <b>82%</b>
          </span>
        </div>
        <div className="pcIg-hud-corner tr">
          <span className="pcIg-read">
            TEMP <b>48°C</b>
          </span>
          <span className="pcIg-read">
            <b>14:32</b>
          </span>
        </div>
        <div className="pcIg-toast">
          <span className="pcIg-toast-ico">✓</span>
          SAVED
        </div>
      </div>
    </div>
  )
}

export function SaveSlotsScreen() {
  return (
    <Modal
      title="SAVE STATE"
      hints={[
        { key: "a", label: "SAVE" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcIg-slots">
        {picoSaveSlots.map((slot, index) => (
          <div
            key={slot.index}
            className={`pcIg-slot ${slot.empty ? "empty" : ""} ${
              index === 0 ? "sel" : ""
            }`}
          >
            <span className="pcIg-slot-no">{slot.index}</span>
            <span className="pcIg-slot-label">{slot.label}</span>
            <span className="pcIg-slot-stamp">
              {slot.empty ? "— empty —" : slot.stamp}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function LoadSlotsScreen() {
  return (
    <Modal
      title="LOAD STATE"
      hints={[
        { key: "a", label: "RESTORE" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcIg-slots load">
        {picoSaveSlots.map((slot, index) => (
          <div
            key={slot.index}
            className={`pcIg-slot ${slot.empty ? "empty" : ""} ${
              index === 0 ? "sel" : ""
            }`}
          >
            <span className="pcIg-slot-no">{slot.index}</span>
            <span className="pcIg-slot-label">{slot.label}</span>
            <span className="pcIg-slot-stamp">
              {slot.empty ? "— empty —" : slot.stamp}
            </span>
            {index === 0 && !slot.empty ? (
              <span className="pcIg-slot-restore">↺ RESTORE</span>
            ) : null}
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function StreamOverlayScreen() {
  return (
    <Modal
      title="STREAMING"
      hints={[
        { key: "a", label: "PAUSE" },
        { key: "b", label: "RESUME" },
        { key: "y", label: "QUIT" },
      ]}
    >
      <div className="pcIg-stream-head">
        <span className="pcIg-stream-name">{picoHero?.title ?? "SESSION"}</span>
        <Badge tone="info">STREAM</Badge>
      </div>

      <div className="pcIg-stream-stats">
        <Stat label="BITRATE" value="18 Mbps" />
        <Stat label="LATENCY" value="7 ms" />
        <Stat label="FPS" value="59" />
        <Stat label="CODEC" value="H.265" />
        <Stat label="RES" value="1080p" />
      </div>

      <div className="pcIg-quality">
        <span className="pcIg-quality-label">QUALITY</span>
        <span className="pcIg-quality-bar good">
          <i className="on" />
          <i className="on" />
          <i className="on" />
          <i className="on" />
          <i />
        </span>
        <span className="pcIg-quality-tag">GOOD</span>
      </div>

      <div className="pcIg-stream-ctl">
        <Btn kind="primary">⏸ PAUSE</Btn>
        <Btn>▶ RESUME</Btn>
        <Btn kind="danger">✕ QUIT</Btn>
      </div>
    </Modal>
  )
}

export function ReconnectingScreen() {
  return (
    <div className="pc-root">
      <div className="pc-gamebg" />
      <div className="pcIg-reconnect">
        <Hero
          glyph="⚠"
          glyphTone="info"
          title="RECONNECTING…"
          message="Stream connection lost. Trying to re-establish the link to the host."
          spinner
        >
          <div className="pcIg-attempt">ATTEMPT 2 OF 5</div>
          <div className="pcIg-quality">
            <span className="pcIg-quality-label">QUALITY</span>
            <span className="pcIg-quality-bar drop">
              <i className="on" />
              <i className="on" />
              <i />
              <i />
              <i />
            </span>
            <span className="pcIg-quality-tag">DROPPING</span>
          </div>
          <Btn kind="danger">✕ QUIT</Btn>
        </Hero>
      </div>
    </div>
  )
}

export function InputRemapScreen() {
  return (
    <Modal
      title="REMAP CONTROLLER"
      hints={[
        { key: "a", label: "REBIND" },
        { key: "y", label: "RESET" },
        { key: "b", label: "DONE" },
      ]}
    >
      <Title size={-1}>8BITDO PRO 2</Title>
      <div className="pcIg-remap">
        {REMAP_ACTIONS.map(row => (
          <div
            key={row.action}
            className={`pcIg-remap-row ${row.listening ? "listen" : ""}`}
          >
            <span className="pcIg-remap-act">{row.action}</span>
            <span className="pcIg-remap-arrow">→</span>
            <span className="pcIg-remap-btn">
              {row.listening ? (
                <>
                  press a button… <Spinner />
                </>
              ) : (
                row.button
              )}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
