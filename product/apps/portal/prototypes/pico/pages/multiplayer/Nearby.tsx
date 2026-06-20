/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Nearby devices (static demo data).
 */
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
  readonly near: boolean
}[] = [
  {
    id: "d1",
    name: "THOR-DECK",
    icon: "pad",
    meta: "this room · 7ms",
    near: true,
  },
  { id: "d2", name: "DEN-RIG", icon: "power", meta: "LAN · 4ms", near: true },
  {
    id: "d3",
    name: '65" 4K TV',
    icon: "menu",
    meta: "cast target",
    near: true,
  },
  {
    id: "d4",
    name: "OFFICE-NUC",
    icon: "power",
    meta: "LAN · 11ms",
    near: false,
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
      <div className="pcMp-nearby-head">
        <Spinner /> <Dim>found {DEVICES.length} nearby</Dim>
      </div>
      <div className="pcMp-nearby">
        {DEVICES.map((device, index) => (
          <Card
            key={device.id}
            className={`pcMp-dev ${index === 0 ? "sel" : ""} ${device.near ? "" : "far"}`}
          >
            <Glyph tone="info">
              <Icon name={device.icon} />
            </Glyph>
            <div className="pcMp-dev-name">{device.name}</div>
            <Dim>{device.meta}</Dim>
            {device.near ? <Badge tone="good">NEAR</Badge> : null}
          </Card>
        ))}
      </div>
    </ScreenShell>
  )
}
