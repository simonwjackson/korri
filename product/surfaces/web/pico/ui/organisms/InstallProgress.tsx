/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Install progress: a checklist of steps (fetch/verify/unpack/prepare-runtime/
 * register) with the active one marked, plus a progress bar.
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Icon } from "../atoms/Icon"
import { Progress } from "../atoms/Progress"
import { Spinner } from "../atoms/Spinner"
import { Sub } from "../atoms/Sub"
import { Title } from "../atoms/Title"
import { Card } from "../molecules/Card"

export function InstallProgress({ runtime }: { readonly runtime: string }) {
  const steps: readonly { readonly label: string; readonly state: string }[] = [
    { label: "FETCH", state: "done" },
    { label: "VERIFY", state: "done" },
    { label: "UNPACK", state: "done" },
    { label: `PREPARE ${runtime} RUNTIME`, state: "active" },
    { label: "REGISTER", state: "pending" },
  ]
  return (
    <div
      className="pcAcq-progress"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.installProgress)}
    >
      <Spinner />
      <Title size={1}>INSTALLING</Title>
      <Sub>WARMING UP THE {runtime} RUNTIME</Sub>
      <Card title="STEPS" className="pcAcq-checklist">
        {steps.map(step => (
          <div key={step.label} className={`pcAcq-step ${step.state}`}>
            <span className="pcAcq-step-mark">
              {step.state === "done" ? (
                <Icon name="check" />
              ) : step.state === "active" ? (
                "▸"
              ) : (
                "·"
              )}
            </span>
            <span className="pcAcq-step-label">{step.label}</span>
          </div>
        ))}
      </Card>
      <Progress pct={74} />
    </div>
  )
}
