/**
 * pico surface. ATOMIC LAYER: page.
 * Connection negotiation stepper (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Progress } from "../../ui/atoms/Progress"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const CONNECT_STEPS: readonly string[] = [
  "HANDSHAKE",
  "CODEC",
  "VIDEO",
  "INPUT",
]

export function Connecting() {
  return (
    <ScreenShell
      title="PICO ▸ CONNECT"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div
        className="pcMd-connect"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdConnect)}
      >
        <Title size={1}>CONNECTING…</Title>
        <div className="pc-sub" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.sub)}>
          DEN-RIG · 192.168.1.10
        </div>
        <div
          className="pcMd-steps"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdSteps)}
        >
          {CONNECT_STEPS.map((step, index) => (
            <span
              key={step}
              className={`pcMd-step ${index < 2 ? "done" : ""} ${index === 2 ? "active" : ""}`}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMdStep)}
            >
              {step}
            </span>
          ))}
        </div>
        <Progress pct={58} />
        <div className="pc-dim" {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}>
          haggling over 1080p60 H.265…
        </div>
      </div>
    </ScreenShell>
  )
}
