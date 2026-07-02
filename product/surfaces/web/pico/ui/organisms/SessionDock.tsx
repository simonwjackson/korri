/**
 * pico surface. ATOMIC LAYER: organism.
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
      <div
        className="pcNow-sect"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowSect)}
      >
        PLAYERS
      </div>
      <div
        className="pcNow-players"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowPlayers)}
      >
        {NOW_PLAYERS.map(player => (
          <Player key={player.id} player={player} rep="tag" />
        ))}
      </div>
      <div
        className="pcNow-sect"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowSect)}
      >
        SAVE
      </div>
      <div
        className="pcNow-saves"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowSaves)}
      >
        {["CITY OF TEARS", "BOSS RUSH", "AUTO"].map((slot, index) => (
          <div
            key={slot}
            className={`pcNow-save ${index === 0 ? "on" : ""}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowSave)}
          >
            {slot}
          </div>
        ))}
      </div>
      <div
        className="pcNow-sect"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowSect)}
      >
        PERF
      </div>
      <div
        className="pcNow-stats"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowStats)}
      >
        <Stat label="fps" value="60" />
        <Stat label="°c" value="62" />
        <Stat label="batt" value="82%" />
      </div>
      <div
        className="pcNow-actions"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcNowActions)}
      >
        <Btn kind="primary">RESUME</Btn>
        <Btn kind="danger">QUIT</Btn>
      </div>
    </div>
  )
}
