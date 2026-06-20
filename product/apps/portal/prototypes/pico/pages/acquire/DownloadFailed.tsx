/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Download failure (static).
 */
import { PicoIcon } from "../../PicoIcon"
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DownloadFailed() {
  return (
    <ScreenShell
      tone="alert"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "CANCEL" },
      ]}
      className="center"
    >
      <Hero
        glyph="⚠"
        glyphTone="bad"
        title="DOWNLOAD FAILED"
        message="the download tripped on the way home. we tossed the half-finished bits — check your connection and retry?"
      >
        <Badge tone="bad">NETWORK</Badge>
        <Btn kind="primary" sel>
          <PicoIcon name="restart" /> RETRY
        </Btn>
        <Btn>CANCEL</Btn>
      </Hero>
    </ScreenShell>
  )
}
