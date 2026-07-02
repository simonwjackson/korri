/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Meet Pixl: the mascot at rest plus its mood set. Static (no data).
 */
import { PicoMascot } from "../../PicoMascot"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Sub } from "../../ui/atoms/Sub"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const MOODS = [
  { state: "idle" as const, label: "IDLE" },
  { state: "happy" as const, label: "HAPPY" },
  { state: "sleep" as const, label: "SLEEPY" },
  { state: "peek" as const, label: "WINK" },
]

export function Mascot() {
  return (
    <ScreenShell
      title="PICO ▸ PALS"
      hints={[
        { key: "a", label: "PET" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <PicoMascot state="happy" className="pcMascot-xl" />
      <Title size={2}>MEET PIXL</Title>
      <Sub>your console's little buddy</Sub>
      <p
        className="pc-hero-msg"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcHeroMsg)}
      >
        Pixl lives in the status bar — blinking, bobbing, dozing off when you
        idle, and perking up when something good happens.
      </p>
      <div
        className="pcPer-moods"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerMoods)}
      >
        {MOODS.map(mood => (
          <div
            className="pcPer-mood"
            key={mood.label}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerMood)}
          >
            <PicoMascot state={mood.state} className="pcMascot-lg" />
            <span
              className="pcPer-mood-label"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcPerMoodLabel)}
            >
              {mood.label}
            </span>
          </div>
        ))}
      </div>
    </ScreenShell>
  )
}
