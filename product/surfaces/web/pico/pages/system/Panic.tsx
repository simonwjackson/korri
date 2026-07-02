/**
 * pico surface. ATOMIC LAYER: page. Panic / fatal error (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { Card } from "../../ui/molecules/Card"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Panic() {
  return (
    <ScreenShell
      tone="alert"
      hints={[{ key: "a", label: "RESTART" }]}
      className="center"
    >
      <Hero
        glyph={<Icon name="close" />}
        glyphTone="bad"
        title="SOMETHING BROKE"
        message="The session manager hit a fatal error and had to stop. Your saves are safe."
      >
        <Card title="DIAGNOSTIC" className="pcSys-panic-card">
          <code
            className="pcSys-code"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSysCode)}
          >
            sessiond: teardown failed (stage=teardown)
            <br />
            code 0x5F · korri-portal 2.4.1
          </code>
        </Card>
        <Btn kind="primary">
          <Icon name="restart" /> RESTART KORRI
        </Btn>
        <Btn>COPY REPORT</Btn>
      </Hero>
    </ScreenShell>
  )
}
