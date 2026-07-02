/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Quick-menu control center drawer: profile + brightness/volume/wifi/airplane +
 * a 2x2 action tile grid. Moved from screens/PanelsScreens.tsx.
 */
import { PicoIcon } from "../../PicoIcon"
import { PicoMascot } from "../../PicoMascot"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { BlockBar } from "../atoms/BlockBar"
import { Toggle } from "../atoms/Toggle"

export function ControlCenter() {
  return (
    <div
      className="pcCC"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.controlCenter)}
    >
      <div
        className="pcCC-profile"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCProfile)}
      >
        <PicoMascot state="happy" className="pcCC-pixl" />
        <div
          className="pcCC-who"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCWho)}
        >
          <b>PLAYER 1</b>
          <span>signed in</span>
        </div>
      </div>
      <div
        className="pcCC-row"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCRow)}
      >
        <span>BRIGHTNESS</span>
        <BlockBar level={7} max={10} />
      </div>
      <div
        className="pcCC-row"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCRow)}
      >
        <span>VOLUME</span>
        <BlockBar level={4} max={10} />
      </div>
      <div
        className="pcCC-row"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCRow)}
      >
        <span>WIFI</span>
        <Toggle state="on" />
      </div>
      <div
        className="pcCC-row"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCRow)}
      >
        <span>AIRPLANE</span>
        <Toggle state="off" />
      </div>
      <div
        className="pcCC-tiles"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCTiles)}
      >
        <div
          className="pcCC-tile"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCTile)}
        >
          <PicoIcon name="gear" />
          <span>SETTINGS</span>
        </div>
        <div
          className="pcCC-tile"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCTile)}
        >
          <PicoIcon name="moon" />
          <span>SLEEP</span>
        </div>
        <div
          className="pcCC-tile"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCTile)}
        >
          <PicoIcon name="restart" />
          <span>RESTART</span>
        </div>
        <div
          className="pcCC-tile"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcCCTile)}
        >
          <PicoIcon name="power" />
          <span>POWER</span>
        </div>
      </div>
    </div>
  )
}
