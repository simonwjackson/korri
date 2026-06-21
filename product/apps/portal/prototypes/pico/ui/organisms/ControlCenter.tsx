/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Quick-menu control center drawer: profile + brightness/volume/wifi/airplane +
 * a 2x2 action tile grid. Moved from screens/PanelsScreens.tsx.
 */
import { PicoIcon } from "../../PicoIcon"
import { PicoMascot } from "../../PicoMascot"
import { BlockBar } from "../atoms/BlockBar"
import { Toggle } from "../atoms/Toggle"

export function ControlCenter() {
  return (
    <div className="pcCC">
      <div className="pcCC-profile">
        <PicoMascot state="happy" className="pcCC-pixl" />
        <div className="pcCC-who">
          <b>PLAYER 1</b>
          <span>signed in</span>
        </div>
      </div>
      <div className="pcCC-row">
        <span>BRIGHTNESS</span>
        <BlockBar level={7} max={10} />
      </div>
      <div className="pcCC-row">
        <span>VOLUME</span>
        <BlockBar level={4} max={10} />
      </div>
      <div className="pcCC-row">
        <span>WIFI</span>
        <Toggle state="on" />
      </div>
      <div className="pcCC-row">
        <span>AIRPLANE</span>
        <Toggle state="off" />
      </div>
      <div className="pcCC-tiles">
        <div className="pcCC-tile">
          <PicoIcon name="gear" />
          <span>SETTINGS</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="moon" />
          <span>SLEEP</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="restart" />
          <span>RESTART</span>
        </div>
        <div className="pcCC-tile">
          <PicoIcon name="power" />
          <span>POWER</span>
        </div>
      </div>
    </div>
  )
}
