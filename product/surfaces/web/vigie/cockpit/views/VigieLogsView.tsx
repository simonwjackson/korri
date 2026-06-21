import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { Input } from "@platform/react/primitives/components/ui/input"
import { useMemo, useState } from "react"
import { useVigieCockpit } from "../VigieCockpit.context"

// Logs — the last-resort tail promoted to a full page: faceted by source, with
// search. The natural plug-in point for a virtualized live-tail viewer later.

export function VigieLogsView() {
  const { log } = useVigieCockpit()
  const [source, setSource] = useState("all")
  const [query, setQuery] = useState("")

  const sources = useMemo(
    () => ["all", ...new Set(log.map(line => line.source))],
    [log],
  )

  const filtered = log.filter(line => {
    if (source !== "all" && line.source !== source) return false
    if (query && !line.message.toLowerCase().includes(query.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <main className="vigie-view">
      <Card
        className="flex h-full min-h-0 flex-col vigie-card"
        aria-label="Logs"
      >
        <CardHeader>
          <CardTitle className="vigie-section-title">Logs</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="vigie-log-toolbar">
            <div className="vigie-segment">
              {sources.map(name => (
                <button
                  key={name}
                  type="button"
                  className="vigie-segment-item capitalize"
                  data-active={name === source}
                  onClick={() => setSource(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <Input
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
              placeholder="Filter messages…"
              className="vigie-log-search"
            />
          </div>

          <ol className="vigie-log-lines vigie-log-lines--page">
            {filtered.map((line, index) => (
              <li
                key={`${line.ts}-${index}`}
                className="vigie-log-line"
                data-level={line.level}
              >
                <span className="vigie-log-ts">{line.ts}</span>
                <span className="vigie-log-source">{line.source}</span>
                <span className="vigie-log-message">{line.message}</span>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="vigie-empty">No matching log lines.</li>
            ) : null}
          </ol>
        </CardContent>
      </Card>
    </main>
  )
}
