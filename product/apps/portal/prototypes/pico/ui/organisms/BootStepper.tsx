/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * The foreground-session boot stepper: an ordered list of steps with the active
 * one spinning, plus a progress bar.
 */
import { Progress, Spinner } from "../../screens/kit"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"

export function BootStepper({ steps }: { readonly steps: readonly string[] }) {
  return (
    <div className="pcSes-boot">
      <Title size={1}>WAKING THE SESSION</Title>
      <ol className="pcSes-steps">
        {steps.map((step, index) => {
          const state =
            index < 2 ? "done" : index === 2 ? "active" : "pending"
          return (
            <li key={step} className={`pcSes-step ${state}`}>
              <span className="pcSes-step-mark">
                {state === "done" ? (
                  <Icon name="check" />
                ) : state === "active" ? (
                  <Spinner />
                ) : (
                  "·"
                )}
              </span>
              <span className="pcSes-step-label">{step}</span>
            </li>
          )
        })}
      </ol>
      <div className="pcSes-boot-bar">
        <Progress pct={66} />
        <div className="pc-dim">FOREGROUNDING · 2 / 4</div>
      </div>
    </div>
  )
}
