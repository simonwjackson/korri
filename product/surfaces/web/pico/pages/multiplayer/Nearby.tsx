/**
 * pico surface. ATOMIC LAYER: page.
 * Nearby devices (static demo data).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../../ui/atoms/Badge"
import { Dim } from "../../ui/atoms/Dim"
import { Glyph } from "../../ui/atoms/Glyph"
import { Icon } from "../../ui/atoms/Icon"
import { Spinner } from "../../ui/atoms/Spinner"
import { Card } from "../../ui/molecules/Card"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const DEVICES: readonly {
  readonly id: string
  readonly name: string
  readonly icon: "pad" | "power" | "menu"
  readonly meta: string
  readonly proximity: "near" | "far"
}[] = [
  {
    id: "d1",
    name: "THOR-DECK",
    icon: "pad",
    meta: "this room · 7ms",
    proximity: "near",
  },
  {
    id: "d2",
    name: "DEN-RIG",
    icon: "power",
    meta: "LAN · 4ms",
    proximity: "near",
  },
  {
    id: "d3",
    name: '65" 4K TV',
    icon: "menu",
    meta: "cast target",
    proximity: "near",
  },
  {
    id: "d4",
    name: "OFFICE-NUC",
    icon: "power",
    meta: "LAN · 11ms",
    proximity: "far",
  },
]

export function Nearby() {
  return (
    <ScreenShell
      title="PICO ▸ NEARBY"
      hints={[
        { key: "a", label: "JOIN" },
        { key: "y", label: "RESCAN" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div
        className="pcMp-nearby-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpNearbyHead)}
      >
        <Spinner /> <Dim>found {DEVICES.length} nearby</Dim>
      </div>
      <div
        className="pcMp-nearby"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpNearby)}
      >
        {DEVICES.map((device, index) => (
          <Card
            key={device.id}
            className={`pcMp-dev ${index === 0 ? "sel" : ""} ${device.proximity === "far" ? "far" : ""}`}
          >
            <Glyph tone="info">
              <Icon name={device.icon} />
            </Glyph>
            <div
              className="pcMp-dev-name"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpDevName)}
            >
              {device.name}
            </div>
            <Dim>{device.meta}</Dim>
            {device.proximity === "near" ? (
              <Badge tone="good">NEAR</Badge>
            ) : null}
          </Card>
        ))}
      </div>
    </ScreenShell>
  )
}
