import { Badge } from "@platform/react/primitives/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@platform/react/primitives/components/ui/table"
import { Gamepad2, Keyboard, Mouse, Pointer } from "lucide-react"
import type { InputDeviceClass } from "../VigieCockpit.context"
import { useVigieCockpit } from "../VigieCockpit.context"

const CLASS_ICON = {
  gamepad: Gamepad2,
  keyboard: Keyboard,
  mouse: Mouse,
  touch: Pointer,
} satisfies Record<InputDeviceClass, typeof Gamepad2>

const STATUS_HEALTH: Record<string, string> = {
  connected: "nominal",
  reconnecting: "caution",
  disconnected: "critical",
}

// Connected input devices as seen by inputd / InputPlumber.

export function VigieInputDevices() {
  const { inputDevices } = useVigieCockpit()

  return (
    <Card className="h-full vigie-card" aria-label="Input devices">
      <CardHeader>
        <CardTitle className="vigie-section-title">Devices</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Node</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inputDevices.map(device => {
              const Icon = CLASS_ICON[device.deviceClass]
              return (
                <TableRow key={device.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="size-4 text-muted-foreground" />
                      {device.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="vigie-status-badge capitalize"
                      data-health={STATUS_HEALTH[device.status] ?? "idle"}
                    >
                      {device.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {device.driver}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {device.id}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
