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
import { useVigieCockpit } from "../VigieCockpit.context"

// Recent launches as a shadcn data table. No persistence yet — fixtures stand
// in for a future session history store.

export function VigieSessionHistory() {
  const { sessionHistory } = useVigieCockpit()

  return (
    <Card className="vigie-card" aria-label="Recent sessions">
      <CardHeader>
        <CardTitle className="vigie-section-title">Recent sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Game</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Request</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessionHistory.map(entry => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.game}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal capitalize">
                    {entry.mode}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="vigie-outcome capitalize"
                    data-outcome={entry.outcome}
                  >
                    {entry.outcome}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {entry.duration}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {entry.requestId}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {entry.when}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
