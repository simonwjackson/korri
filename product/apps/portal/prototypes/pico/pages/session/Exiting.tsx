/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Exiting / teardown (static).
 */
import { Badge } from "../../ui/atoms/Badge"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Exiting() {
  return (
    <ScreenShell
      title="PICO ▸ SESSION"
      hints={[{ key: "b", label: "FORCE QUIT" }]}
      className="center"
    >
      <Hero
        title="EXITING…"
        message="Saving your spot and packing things away. VerifyingReady → IdleReady. The host frees up in just a sec."
        spinner
      >
        <Badge tone="info">VERIFYING READY</Badge>
      </Hero>
    </ScreenShell>
  )
}
