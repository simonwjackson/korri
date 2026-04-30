import { CircleAlert, X } from "lucide-react"
import { useAppShell } from "../AppShell.context"

/*
 * Renders only when the last regenerate attempt failed. Shows the exit
 * code plus a collapsible <details> with stderr (and stdout if non-
 * empty), and a dismiss button that returns the regenerate hook to
 * idle. Sits in row-start-2 of the AppShell grid; an empty row 2
 * collapses to 0 height when no banner is rendered.
 */
export function AppShellRegenerateBanner() {
  const { regenerate } = useAppShell()
  if (regenerate.status !== "error") return null
  const last = regenerate.lastResult
  const message = regenerate.errorMessage ?? "Regenerate failed."
  const exitCode = last?.exitCode ?? -1
  const stderr = last?.stderr.trim() ?? ""
  const stdout = last?.stdout.trim() ?? ""

  return (
    <section
      role="alert"
      className="col-span-3 row-start-2 flex flex-col gap-2 border-status-error/40 border-b bg-status-error/10 px-4 py-2"
    >
      <div className="flex items-start gap-2">
        <CircleAlert
          size={14}
          aria-hidden="true"
          className="mt-0.5 text-status-error"
        />
        <div className="flex flex-1 flex-col gap-1 text-sm">
          <p className="text-status-error">
            <span className="font-semibold">Regenerate failed</span>
            <span className="ml-2 font-mono text-text-muted text-xs">
              exit {exitCode}
            </span>
          </p>
          <p className="text-text-muted text-xs">{message}</p>
        </div>
        <button
          type="button"
          onClick={regenerate.clearError}
          aria-label="Dismiss regenerate failure"
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>

      {(stderr.length > 0 || stdout.length > 0) && (
        <details className="ml-6 rounded-md border border-border bg-bg">
          <summary className="cursor-pointer px-2 py-1.5 text-text-muted text-xs uppercase tracking-wide">
            Generator output
          </summary>
          {stderr.length > 0 && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-border border-t px-3 py-2 font-mono text-status-error text-xs">
              {stderr}
            </pre>
          )}
          {stdout.length > 0 && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-border border-t px-3 py-2 font-mono text-text-muted text-xs">
              {stdout}
            </pre>
          )}
        </details>
      )}
    </section>
  )
}
