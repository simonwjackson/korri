/**
 * pico surface. ATOMIC LAYER: page.
 * Cloud save conflict (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Title } from "../../ui/atoms/Title"
import { Card } from "../../ui/molecules/Card"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function CloudSaveConflict() {
  return (
    <ScreenShell
      tone="alert"
      title="PICO ▸ SYNC"
      hints={[
        { key: "a", label: "KEEP LOCAL" },
        { key: "y", label: "KEEP CLOUD" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <div
        className="pcFut-conf-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfHead)}
      >
        <Title size={0}>SAVE CONFLICT</Title>
        <p
          className="pcFut-conf-note"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfNote)}
        >
          Two saves, one truth — which do we keep? The other gets tidied away.
        </p>
      </div>
      <div
        className="pcFut-conf-grid"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfGrid)}
      >
        <Card title="THIS DEVICE" className="pcFut-conf-card">
          <Badge tone="info">LOCAL</Badge>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              SAVED
            </span>
            <b>2m ago</b>
          </div>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              PLAYTIME
            </span>
            <b>12h 40m</b>
          </div>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              SPOT
            </span>
            <b>WORLD 3-2</b>
          </div>
          <Btn kind="primary" state="selected">
            KEEP LOCAL
          </Btn>
        </Card>
        <Card title="CLOUD" className="pcFut-conf-card">
          <Badge tone="accent">CLOUD</Badge>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              SAVED
            </span>
            <b>3h ago</b>
          </div>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              PLAYTIME
            </span>
            <b>13h 05m</b>
          </div>
          <div
            className="pcFut-conf-line"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutConfLine)}
          >
            <span
              className="pc-dim"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
            >
              SPOT
            </span>
            <b>BOSS RUSH</b>
          </div>
          <Btn>KEEP CLOUD</Btn>
        </Card>
      </div>
    </ScreenShell>
  )
}
