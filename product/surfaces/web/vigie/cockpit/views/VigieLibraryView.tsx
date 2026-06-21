import { Badge } from "@platform/react/primitives/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@platform/react/primitives/components/ui/card"
import { Input } from "@platform/react/primitives/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@platform/react/primitives/components/ui/table"
import { useMemo, useState } from "react"
import { useVigieCockpit } from "../VigieCockpit.context"

// Library — catalog snapshot with operator filters. Filtering is local page
// state; the Root only supplies the domain entries from live/fixture data.

export function VigieLibraryView() {
  const { library } = useVigieCockpit()
  const [query, setQuery] = useState("")
  const [system, setSystem] = useState("all")
  const [source, setSource] = useState("all")
  const [launchable, setLaunchable] = useState("all")

  const systems = useMemo(
    () => uniqueOptions(library.map(entry => entry.system)),
    [library],
  )
  const sources = useMemo(
    () => uniqueOptions(library.map(entry => entry.source)),
    [library],
  )

  const filtered = library.filter(entry => {
    if (system !== "all" && entry.system !== system) return false
    if (source !== "all" && entry.source !== source) return false
    if (launchable === "launchable" && !entry.launchable) return false
    if (launchable === "blocked" && entry.launchable) return false
    if (query.length > 0) {
      const haystack = [
        entry.title,
        entry.id,
        entry.system,
        entry.source,
        ...entry.collections,
      ]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(query.toLowerCase())) return false
    }
    return true
  })

  return (
    <main className="vigie-view">
      <Card
        className="flex h-full min-h-0 flex-col vigie-card"
        aria-label="Library"
      >
        <CardHeader>
          <CardTitle className="vigie-section-title">Library</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="vigie-library-toolbar">
            <Input
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
              placeholder="Filter games, ids, collections…"
              className="vigie-library-search"
            />
            <label className="vigie-filter-field">
              <span>System</span>
              <select
                value={system}
                onChange={event => setSystem(event.currentTarget.value)}
              >
                <option value="all">All</option>
                {systems.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="vigie-filter-field">
              <span>Source</span>
              <select
                value={source}
                onChange={event => setSource(event.currentTarget.value)}
              >
                <option value="all">All</option>
                {sources.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="vigie-filter-field">
              <span>Launch</span>
              <select
                value={launchable}
                onChange={event => setLaunchable(event.currentTarget.value)}
              >
                <option value="all">All</option>
                <option value="launchable">Launchable</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
          </div>

          <div className="vigie-library-summary">
            <span>{filtered.length} shown</span>
            <span>{library.length} total</span>
          </div>

          <div className="vigie-library-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Releases</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="vigie-library-game">
                        <strong>{entry.title}</strong>
                        <code>{entry.id}</code>
                        {entry.collections.length > 0 ? (
                          <span>{entry.collections.join(" · ")}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="uppercase">{entry.system}</TableCell>
                    <TableCell>{entry.source}</TableCell>
                    <TableCell>{entry.releaseCount}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="vigie-status-badge"
                        data-health={entry.launchable ? "nominal" : "caution"}
                      >
                        {entry.launchable ? "Launchable" : "Blocked"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="vigie-empty">
                      No library entries match those filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function uniqueOptions(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  )
}
