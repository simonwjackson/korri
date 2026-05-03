import { CircleAlert, TriangleAlert } from "lucide-react"
import type { Diagnostic } from "../../../types"

/*
 * Stateless presentational list. Used inside Inspector to surface
 * diagnostics scoped to a node by path equality. Unit 7 reuses this
 * component in a top-level Diagnostics drawer.
 */
export function AppShellDiagnostics({
  diagnostics,
}: {
  diagnostics: readonly Diagnostic[]
}) {
  if (diagnostics.length === 0) {
    return (
      <p className="text-text-muted text-xs">No diagnostics for this node.</p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {diagnostics.map(diag => (
        <li
          key={`${diag.severity}-${diag.path ?? "global"}-${diag.message}`}
          className="flex items-start gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
        >
          <span
            className={
              diag.severity === "error"
                ? "mt-0.5 text-status-error"
                : "mt-0.5 text-status-warning"
            }
          >
            {diag.severity === "error" ? (
              <CircleAlert size={12} aria-hidden="true" />
            ) : (
              <TriangleAlert size={12} aria-hidden="true" />
            )}
          </span>
          <span className="text-text-muted text-xs">{diag.message}</span>
        </li>
      ))}
    </ul>
  )
}
