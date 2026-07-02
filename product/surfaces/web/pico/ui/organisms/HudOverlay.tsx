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
      <div
        className="pcIg-hud-corner tl"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgHudCorner)}
      >
        <span
          className="pcIg-read"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgRead)}
        >
          FPS <b>60</b>
        </span>
        <span
          className="pcIg-read"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgRead)}
        >
          BAT <b>82%</b>
        </span>
      </div>
      <div
        className="pcIg-hud-corner tr"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgHudCorner)}
      >
        <span
          className="pcIg-read"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgRead)}
        >
          TEMP <b>48°C</b>
        </span>
        <span
          className="pcIg-read"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgRead)}
        >
          <b>14:32</b>
        </span>
      </div>
      <div
        className="pcIg-toast"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgToast)}
      >
        <span
          className="pcIg-toast-ico"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcIgToastIco)}
        >
          <Icon name="check" />
        </span>
        SAVED &amp; SOUND
      </div>
    </div>
  )
}
