/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Now-playing session dock: players + save slots + perf stats + resume/quit.
 * Moved from screens/PanelsScreens.tsx.
 */
import type { PicoPlayer } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Stat } from "../atoms/Stat"
import { Player } from "../molecules/Player"

const NOW_PLAYERS: readonly PicoPlayer[] = [
  { id: "p1", name: "YOU", seat: 1, status: "host", controller: "HANDHELD" },
  {
    id: "p2",
    name: "PIXELPETE",
    seat: 2,
    status: "ready",
    controller: "GAMEPAD",
  },
]

export function SessionDock() {
  return (
    <div
      className="pcNow-dock"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sessionDock)}
    >
      <div className="pcNow-sect">PLAYERS</div>
      <div className="pcNow-players">
        {NOW_PLAYERS.map(player => (
          <Player key={player.id} player={player} rep="tag" />
        ))}
      </div>
      <div className="pcNow-sect">SAVE</div>
      <div className="pcNow-saves">
        {["CITY OF TEARS", "BOSS RUSH", "AUTO"].map((slot, index) => (
          <div key={slot} className={`pcNow-save ${index === 0 ? "on" : ""}`}>
            {slot}
          </div>
        ))}
      </div>
      <div className="pcNow-sect">PERF</div>
      <div className="pcNow-stats">
        <Stat label="fps" value="60" />
        <Stat label="°c" value="62" />
        <Stat label="batt" value="82%" />
      </div>
      <div className="pcNow-actions">
        <Btn kind="primary">RESUME</Btn>
        <Btn kind="danger">QUIT</Btn>
      </div>
    </div>
  )
}
