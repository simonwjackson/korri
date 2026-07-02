/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The foreground-session boot stepper: an ordered list of steps with the active
 * one spinning, plus a progress bar.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Icon } from "../atoms/Icon"
import { Progress } from "../atoms/Progress"
import { Spinner } from "../atoms/Spinner"
import { Title } from "../atoms/Title"

export function BootStepper({ steps }: { readonly steps: readonly string[] }) {
  return (
    <div
      className="pcSes-boot"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.bootStepper)}
    >
      <Title size={1}>WAKING THE SESSION</Title>
      <ol
        className="pcSes-steps"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesSteps)}
      >
        {steps.map((step, index) => {
          const state = index < 2 ? "done" : index === 2 ? "active" : "pending"
          return (
            <li
              key={step}
              className={`pcSes-step ${state}`}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesStep)}
            >
              <span
                className="pcSes-step-mark"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesStepMark)}
              >
                {state === "done" ? (
                  <Icon name="check" />
                ) : state === "active" ? (
                  <Spinner />
                ) : (
                  "·"
                )}
              </span>
              <span
                className="pcSes-step-label"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesStepLabel)}
              >
                {step}
              </span>
            </li>
          )
        })}
      </ol>
      <div
        className="pcSes-boot-bar"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSesBootBar)}
      >
        <Progress pct={66} />
        <div className="pc-dim" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}>
          FOREGROUNDING · 2 / 4
        </div>
      </div>
    </div>
  )
}
