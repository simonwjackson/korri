/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Connection negotiation stepper (static).
 */
import { Progress } from "../../screens/kit"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const CONNECT_STEPS: readonly string[] = ["HANDSHAKE", "CODEC", "VIDEO", "INPUT"]

export function Connecting() {
  return (
    <ScreenShell
      title="PICO ▸ CONNECT"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcMd-connect">
        <Title size={1}>CONNECTING…</Title>
        <div className="pc-sub">DEN-RIG · 192.168.1.10</div>
        <div className="pcMd-steps">
          {CONNECT_STEPS.map((step, index) => (
            <span
              key={step}
              className={`pcMd-step ${index < 2 ? "done" : ""} ${index === 2 ? "active" : ""}`}
            >
              {step}
            </span>
          ))}
        </div>
        <Progress pct={58} />
        <div className="pc-dim">haggling over 1080p60 H.265…</div>
      </div>
    </ScreenShell>
  )
}
