import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { useVigieCockpit } from "../VigieCockpit.context"
import { VigieStatusDot } from "./VigieStatusDot"

// Tier 3 — subsystem observability on shadcn Card. sessiond / inputd /
// InputPlumber health rows; depth comes later.

export function VigieSubsystemPanel() {
  const { subsystems } = useVigieCockpit()

  return (
    <Card className="vigie-card" aria-label="Subsystems">
      <CardHeader>
        <CardTitle className="vigie-section-title">Subsystems</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="vigie-subsystem-list">
          {subsystems.map(subsystem => (
            <li key={subsystem.id} className="vigie-subsystem">
              <VigieStatusDot
                status={subsystem.status}
                label={subsystem.label}
              />
              <span className="vigie-subsystem-detail">{subsystem.detail}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
