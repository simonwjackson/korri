import {
  Command,
  Loader2,
  Network,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useAppShell } from "../AppShell.context"

/*
 * Top bar — brand mark, generated-at timestamp, and (placeholder)
 * regenerate / palette buttons. Reads status + generatedAt from the
 * AppShell context so the header reflects the current load. Buttons
 * become functional in Units 7 (regenerate) and 8 (palette).
 */
export function AppShellTopBar() {
  const { status, map, error } = useAppShell()

  return (
    <header className="col-span-3 row-start-1 flex items-center gap-3 border-border border-b bg-surface px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-elevated text-accent">
          <Network size={14} aria-hidden="true" />
        </span>
        <span className="font-semibold text-sm tracking-tight">
          Feature Map Explorer
        </span>
      </div>

      <TopBarStatus status={status} map={map} error={error} />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-text-muted text-xs disabled:opacity-60"
          aria-label="Open command palette"
        >
          <Command size={12} aria-hidden="true" />
          <span>K</span>
        </button>
        <button
          type="button"
          disabled
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-text-muted text-xs disabled:opacity-60"
        >
          <RefreshCw size={12} aria-hidden="true" />
          <span>Regenerate</span>
        </button>
      </div>
    </header>
  )
}

function TopBarStatus({
  status,
  map,
  error,
}: {
  status: "loading" | "ready" | "missing" | "error"
  map: { generatedAt?: string } | null
  error: string | null
}) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-text-muted text-xs">
        <Loader2 size={12} aria-hidden="true" className="animate-spin" />
        Loading map…
      </span>
    )
  }
  if (status === "missing") {
    return (
      <span className="flex items-center gap-1.5 text-status-warning text-xs">
        <TriangleAlert size={12} aria-hidden="true" />
        Map not generated
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-status-error text-xs">
        <TriangleAlert size={12} aria-hidden="true" />
        {error ?? "Failed to load map"}
      </span>
    )
  }
  return (
    <time className="text-text-muted text-xs">
      Generated · {formatTimestamp(map?.generatedAt)}
    </time>
  )
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "—"
  try {
    const date = new Date(iso)
    return date.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    })
  } catch {
    return iso
  }
}
