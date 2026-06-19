/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Install progress: a checklist of steps (fetch/verify/unpack/prepare-runtime/
 * register) with the active one marked, plus a progress bar.
 */
import { Card, Progress, Spinner, Sub } from "../../screens/kit"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"

export function InstallProgress({ runtime }: { readonly runtime: string }) {
  const steps: readonly { readonly label: string; readonly state: string }[] = [
    { label: "FETCH", state: "done" },
    { label: "VERIFY", state: "done" },
    { label: "UNPACK", state: "done" },
    { label: `PREPARE ${runtime} RUNTIME`, state: "active" },
    { label: "REGISTER", state: "pending" },
  ]
  return (
    <div className="pcAcq-progress">
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
