import { useId, useMemo } from "react"
import {
  type KnownFrontmatterShape,
  partitionExtras,
  readKnown,
  STATUS_VALUES,
  type StatusValue,
  writeKnown,
} from "../../api/frontmatter"
import type { NodeKind } from "../../types"

/*
 * Structured form over the known frontmatter keys per node kind. Edits
 * call back with the merged frontmatter object; unknown keys round-trip
 * untouched. Per the plan, unknown keys are surfaced as YAML (read-only
 * for now) so the user knows they exist.
 */
export function FrontmatterForm({
  frontmatter,
  kind,
  onChange,
}: {
  frontmatter: Record<string, unknown>
  kind: NodeKind
  onChange: (next: Record<string, unknown>) => void
}) {
  const known = useMemo(() => readKnown(frontmatter), [frontmatter])
  const extras = useMemo(
    () => partitionExtras(frontmatter, kind),
    [frontmatter, kind],
  )

  const idField = useId()
  const titleField = useId()
  const statusField = useId()
  const jobsField = useId()

  const update = (patch: Partial<KnownFrontmatterShape>) => {
    const next = writeKnown(frontmatter, { ...known, ...patch }, kind)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={idField} className={LABEL_CLASS}>
          ID
        </label>
        <input
          id={idField}
          type="text"
          value={known.id}
          onChange={e => update({ id: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={titleField} className={LABEL_CLASS}>
          Title
        </label>
        <input
          id={titleField}
          type="text"
          value={known.title}
          onChange={e => update({ title: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={statusField} className={LABEL_CLASS}>
          Status
        </label>
        <select
          id={statusField}
          value={known.status}
          onChange={e => update({ status: e.target.value as StatusValue | "" })}
          className={INPUT_CLASS}
        >
          <option value="">—</option>
          {STATUS_VALUES.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {kind === "brief" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={jobsField} className={LABEL_CLASS}>
            Jobs
          </label>
          <input
            id={jobsField}
            type="text"
            value={known.jobs.join(", ")}
            onChange={e =>
              update({
                jobs: e.target.value
                  .split(",")
                  .map(s => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="comma-separated job IDs"
            className={INPUT_CLASS}
          />
        </div>
      )}

      {Object.keys(extras).length > 0 && (
        <details className="rounded-md border border-border bg-bg p-2">
          <summary className="cursor-pointer text-text-muted text-xs uppercase tracking-wide">
            Other frontmatter ({Object.keys(extras).length})
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-text-muted text-xs">
            {Object.entries(extras)
              .map(([k, v]) => `${k}: ${formatExtraValue(v)}`)
              .join("\n")}
          </pre>
        </details>
      )}
    </div>
  )
}

const INPUT_CLASS =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-sm text-text outline-none focus:border-accent placeholder:text-text-muted"

const LABEL_CLASS = "text-text-muted text-xs uppercase tracking-wide"

function formatExtraValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === "object") return JSON.stringify(value)
  return String(value)
}
