import {
  Command,
  Loader2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useAppShell } from "../AppShell.context"

/*
 * Top bar — brand mark, generated-at timestamp, and the live
 * Regenerate action (Unit 7). Palette button is a placeholder until
 * Unit 8.
 */
export function AppShellTopBar() {
  const {
    status,
    map,
    error,
    leftRailOpen,
    inspectorOpen,
    toggleLeftRail,
    toggleInspector,
    regenerate,
  } = useAppShell()

  const regenStatus = regenerate.status
  const isRunning = regenStatus === "running"
  const hasError = regenStatus === "error"
  const buttonLabel = isRunning
    ? "Regenerating…"
    : hasError
      ? "Regenerate failed"
      : "Regenerate"

  return (
    <header className="col-span-3 row-start-1 flex items-center gap-2 border-border border-b bg-surface px-3">
      <PanelToggle
        open={leftRailOpen}
        onClick={toggleLeftRail}
        side="left"
        label="Toggle navigation rail"
      />

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
          onClick={() => {
            void regenerate.run()
          }}
          disabled={isRunning}
          aria-busy={isRunning}
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs disabled:opacity-70 ${
            hasError
              ? "border-status-error bg-surface text-status-error hover:bg-surface-elevated"
              : "border-border bg-surface text-text hover:bg-surface-elevated"
          }`}
        >
          {isRunning ? (
            <Loader2
              size={12}
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <RefreshCw size={12} aria-hidden="true" />
          )}
          <span>{buttonLabel}</span>
        </button>

        <PanelToggle
          open={inspectorOpen}
          onClick={toggleInspector}
          side="right"
          label="Toggle inspector"
        />
      </div>
    </header>
  )
}

function PanelToggle({
  open,
  onClick,
  side,
  label,
}: {
  open: boolean
  onClick: () => void
  side: "left" | "right"
  label: string
}) {
  const Icon =
    side === "left"
      ? open
        ? PanelLeftClose
        : PanelLeftOpen
      : open
        ? PanelRightClose
        : PanelRightOpen
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:bg-surface-elevated hover:text-text"
    >
      <Icon size={14} aria-hidden="true" />
    </button>
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
