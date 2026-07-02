/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The minimal in-game HUD: corner readouts (fps/battery/temp/clock) and a
 * transient "saved" toast.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Icon } from "../atoms/Icon"

export function HudOverlay() {
  return (
    <div
      className="pcIg-hud"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.hudOverlay)}
    >
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
        <span className="pcIg-toast-ico">
          <Icon name="check" />
        </span>
        SAVED &amp; SOUND
      </div>
    </div>
  )
}
