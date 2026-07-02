/**
 * pico surface. ATOMIC LAYER: page. First-run welcome (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Onboarding() {
  return (
    <ScreenShell
      title="WELCOME"
      hints={[
        { key: "a", label: "NEXT" },
        { key: "b", label: "SKIP" },
      ]}
      className="center"
    >
      <div
        className="pcSys-logo pcSys-logo-sm"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysLogo)}
      >
        KORRI
      </div>
      <Title size={1}>LET'S SET UP</Title>
      <p
        className="pc-hero-msg"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcHeroMsg)}
      >
        Three quick steps and you're playing. We never auto-launch — every game
        starts when you say so.
      </p>
      <div
        className="pcSys-steps"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysSteps)}
      >
        <span
          className="pcSys-step on"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysStep)}
        >
          1 · LANGUAGE
        </span>
        <span
          className="pcSys-step on"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysStep)}
        >
          2 · NETWORK
        </span>
        <span
          className="pcSys-step"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysStep)}
        >
          3 · CONTROLLER
        </span>
      </div>
    </ScreenShell>
  )
}
