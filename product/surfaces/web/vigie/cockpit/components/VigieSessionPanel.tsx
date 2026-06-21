import { Badge } from "@platform/react/primitives/components/ui/badge"
import { Button } from "@platform/react/primitives/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { useVigieCockpit } from "../VigieCockpit.context"
import { VigieSessionPhaseLane } from "./VigieSessionPhaseLane"

const STATE_LABEL: Record<string, string> = {
  idle: "Idle",
  active: "Preparing",
  nominal: "Live",
  caution: "Degraded",
  critical: "Recovering",
}

// Tier 1 — the headline object on shadcn Card + Badge. The phase rail, readouts
// and status semantics stay custom (no shadcn equivalent); the container,
// header, status chip and actions are shadcn primitives.

export function VigieSessionPanel() {
  const { session, sessionCommandStatus, sessionCommandMessage, stopSession } =
    useVigieCockpit()
  const idle = session.health === "idle"
  const stopPending = sessionCommandStatus === "pending"
  const [title, subtitle] = splitHeadline(session.headline)

  return (
    <Card
      className="h-full vigie-card"
      data-idle={idle || undefined}
      aria-label="Session"
    >
      <CardHeader>
        <CardTitle className="vigie-section-title">Session</CardTitle>
        <CardAction>
          <Badge
            variant="outline"
            className="vigie-status-badge"
            data-health={session.health}
          >
            <span className="vigie-state-pulse" aria-hidden="true" />
            {STATE_LABEL[session.health] ?? "Unknown"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="vigie-session-head">
          <h2 className="vigie-session-title">{title}</h2>
          {subtitle ? (
            <p className="vigie-session-subtitle">{subtitle}</p>
          ) : null}
          <div className="vigie-session-ident">
            {session.requestId ? <code>{session.requestId}</code> : null}
            {session.gameId ? <code>{session.gameId}</code> : null}
          </div>
        </div>

        <VigieSessionPhaseLane />

        {session.note ? (
          <output className="vigie-session-note">{session.note}</output>
        ) : null}

        {sessionCommandMessage ? (
          <output className="vigie-session-note">
            {sessionCommandMessage}
          </output>
        ) : null}

        {session.stream.length > 0 ? (
          <dl className="vigie-readouts">
            {session.stream.map(readout => (
              <div
                key={readout.id}
                className="vigie-readout"
                data-accent={readout.accent ?? "none"}
              >
                <dt>{readout.label}</dt>
                <dd>{readout.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <footer className="vigie-actions">
          <Button size="sm" variant="secondary" disabled={idle}>
            Recover
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={idle || stopPending}
            onClick={stopSession}
          >
            {stopPending ? "Stopping…" : "Stop session"}
          </Button>
          <Button size="sm" variant="outline" disabled={!idle}>
            Launch…
          </Button>
        </footer>
      </CardContent>
    </Card>
  )
}

function splitHeadline(
  headline: string,
): readonly [string, string | undefined] {
  const parts = headline.split(" · ")
  if (parts.length >= 2) return [parts.slice(1).join(" · "), parts[0]]
  return [headline, undefined]
}
