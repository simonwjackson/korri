/**
 * pico surface. ATOMIC LAYER: page.
 * Controller pairing (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Glyph } from "../../ui/atoms/Glyph"
import { Icon } from "../../ui/atoms/Icon"
import { Spinner } from "../../ui/atoms/Spinner"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Pairing() {
  return (
    <ScreenShell
      title="PICO ▸ PAIR"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div
        className="pcMd-pair"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdPair)}
      >
        <Glyph tone="accent">
          <Icon name="plus" />
        </Glyph>
        <Title size={1}>PAIR A CONTROLLER</Title>
        <div
          className="pcMd-code"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdCode)}
        >
          8-4-2-7
        </div>
        <div
          className="pcMd-pair-wait"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdPairWait)}
        >
          <Spinner />
          <span
            className="pc-sub"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}
          >
            listening for a new pad…
          </span>
        </div>
        <p
          className="pc-hero-msg"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcHeroMsg)}
        >
          hold SELECT + START to say hello
        </p>
      </div>
    </ScreenShell>
  )
}
