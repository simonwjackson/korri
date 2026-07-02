/**
 * pico surface. ATOMIC LAYER: page. Storage (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../../ui/atoms/Btn"
import { Progress } from "../../ui/atoms/Progress"
import { Card } from "../../ui/molecules/Card"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function StorageSettings() {
  return (
    <ScreenShell
      title="PICO ▸ STORAGE"
      hints={[
        { key: "a", label: "MANAGE" },
        { key: "y", label: "CLEAR" },
        { key: "b", label: "BACK" },
      ]}
    >
      <Card title="DEVICE STORAGE — WHERE YOUR CARTS LIVE">
        <Progress pct={41} />
        <div
          className="pcSet-usage"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetUsage)}
        >
          <span
            className="pcSet-used"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetUsed)}
          >
            26 GB USED
          </span>
          <span
            className="pcSet-free"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetFree)}
          >
            64 GB TOTAL
          </span>
        </div>
      </Card>
      <div
        className="pcSet-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetList)}
      >
        <div
          className="pcSet-row sel"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetRow)}
        >
          <span
            className="pcSet-swatch games"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetSwatch)}
          />
          <span
            className="pcSet-label"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
          >
            Games
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            18.4 GB
          </span>
        </div>
        <div
          className="pcSet-row"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetRow)}
        >
          <span
            className="pcSet-swatch saves"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetSwatch)}
          />
          <span
            className="pcSet-label"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
          >
            Saves
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            2.1 GB
          </span>
        </div>
        <div
          className="pcSet-row"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetRow)}
        >
          <span
            className="pcSet-swatch system"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetSwatch)}
          />
          <span
            className="pcSet-label"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
          >
            System
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            5.5 GB
          </span>
        </div>
        <div
          className="pcSet-row"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetRow)}
        >
          <span
            className="pcSet-swatch free"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetSwatch)}
          />
          <span
            className="pcSet-label"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
          >
            Free
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            38.0 GB
          </span>
        </div>
      </div>
      <div
        className="pcSet-actions"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetActions)}
      >
        <Btn kind="primary">▸ MANAGE</Btn>
        <Btn>CLEAR CACHE · 1.2 GB</Btn>
      </div>
    </ScreenShell>
  )
}
