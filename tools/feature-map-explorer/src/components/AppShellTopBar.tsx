import { Command, Network, RefreshCw } from "lucide-react"

/*
 * TopBar sits in the first grid row, spanning all three columns. For Unit 2
 * the regenerate button and timestamp are visual placeholders; Unit 7 wires
 * them to the dev API.
 */
export function AppShellTopBar() {
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

      <time className="text-text-muted text-xs">Generated · never</time>

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
