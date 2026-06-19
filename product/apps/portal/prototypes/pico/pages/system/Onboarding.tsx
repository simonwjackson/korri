/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. First-run welcome (static).
 */
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
      <div className="pcSys-logo pcSys-logo-sm">KORRI</div>
      <Title size={1}>LET'S SET UP</Title>
      <p className="pc-hero-msg">
        Three quick steps and you're playing. We never auto-launch — every game
        starts when you say so.
      </p>
      <div className="pcSys-steps">
        <span className="pcSys-step on">1 · LANGUAGE</span>
        <span className="pcSys-step on">2 · NETWORK</span>
        <span className="pcSys-step">3 · CONTROLLER</span>
      </div>
    </ScreenShell>
  )
}
