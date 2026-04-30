import { Command } from "cmdk"
import type { LucideIcon } from "lucide-react"
import {
  FileText,
  Layers,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Workflow,
} from "lucide-react"
import { type ReactNode, useMemo } from "react"
import type { FeatureMap, NodeKind, SelectedNode } from "../../types"
import { useAppShell } from "../AppShell/AppShell.context"

/*
 * cmd+k command palette. Surfaces:
 *   - every node in the map by title + ID + kind
 *   - the Regenerate action (when not already running)
 *   - Toggle theme (dark <-> light)
 *   - Toggle navigation rail / inspector panels
 *
 * Palette open/close lives on the AppShell context so the global
 * hotkey listener and the TopBar Cmd+K button share one source of
 * truth. cmdk owns focus trap + keyboard navigation inside the
 * dialog; the host layer (AppShellPaletteHost) handles the overlay.
 */
export function CommandPalette() {
  const {
    map,
    setSelected,
    paletteOpen,
    setPaletteOpen,
    regenerate,
    theme,
    toggleTheme,
    toggleLeftRail,
    toggleInspector,
    leftRailOpen,
    inspectorOpen,
  } = useAppShell()

  const nodes = useMemo(() => collectNodes(map), [map])

  const close = () => setPaletteOpen(false)
  const choose = (run: () => void) => {
    run()
    close()
  }

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      label="Command palette"
      loop
      // cmdk renders into a Radix Dialog: overlay handles outside-
      // click + focus trap + Escape. We style the rendered wrappers
      // via these attributes so visuals match the rest of the shell.
      overlayClassName="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm"
      contentClassName="-translate-x-1/2 fixed top-24 left-1/2 z-50 w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
    >
      <Command.Input
        placeholder="Jump to node, regenerate, toggle…"
        className="h-11 w-full border-border border-b bg-bg px-4 text-sm text-text outline-none placeholder:text-text-muted"
        autoFocus
      />
      <Command.List className="max-h-80 overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-text-muted text-sm">
          No matches.
        </Command.Empty>

        <Command.Group
          heading="Actions"
          className="text-text-muted text-xs uppercase tracking-wide"
        >
          <PaletteItem
            icon={RefreshCw}
            label="Regenerate feature map"
            shortcut={regenerate.status === "running" ? "running…" : undefined}
            disabled={regenerate.status === "running"}
            onSelect={() =>
              choose(() => {
                void regenerate.run()
              })
            }
          />
          <PaletteItem
            icon={theme === "dark" ? Sun : Moon}
            label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onSelect={() => choose(toggleTheme)}
          />
          <PaletteItem
            icon={Layers}
            label={`${leftRailOpen ? "Hide" : "Show"} navigation rail`}
            onSelect={() => choose(toggleLeftRail)}
          />
          <PaletteItem
            icon={Layers}
            label={`${inspectorOpen ? "Hide" : "Show"} inspector`}
            onSelect={() => choose(toggleInspector)}
          />
        </Command.Group>

        {nodes.map(group => (
          <Command.Group
            key={group.kind}
            heading={KIND_HEADINGS[group.kind]}
            className="text-text-muted text-xs uppercase tracking-wide"
          >
            {group.items.map(item => (
              <PaletteItem
                key={`${item.kind}-${item.id}`}
                icon={KIND_ICONS[item.kind]}
                label={item.title}
                hint={item.hint ?? undefined}
                // cmdk's fuzzy match needs the value to include
                // the searchable text — title, id, kind, and hint
                // (e.g., feature path) all need to be discoverable.
                value={`${item.kind} ${item.id} ${item.title} ${item.hint ?? ""}`}
                onSelect={() =>
                  choose(() => setSelected({ kind: item.kind, id: item.id }))
                }
              />
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}

function PaletteItem({
  icon: Icon,
  label,
  hint,
  shortcut,
  disabled = false,
  value,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  shortcut?: string
  disabled?: boolean
  value?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      disabled={disabled}
      className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-text aria-selected:bg-surface-elevated aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
    >
      <Icon size={14} aria-hidden="true" className="text-text-muted" />
      <span className="flex-1 truncate normal-case">{label}</span>
      {hint && (
        <span className="font-mono text-text-muted text-xs">{hint}</span>
      )}
      {shortcut && <span className="text-text-muted text-xs">{shortcut}</span>}
    </Command.Item>
  )
}

type PaletteNodeItem = SelectedNode & {
  title: string
  hint: string | null
}

const KIND_HEADINGS: Record<NodeKind, string> = {
  job: "Jobs",
  brief: "Briefs",
  feature: "Features",
  bdd: "BDD",
}

const KIND_ICONS: Record<NodeKind, LucideIcon> = {
  job: Sparkles,
  brief: FileText,
  feature: Workflow,
  bdd: FileText,
}

function collectNodes(
  map: FeatureMap | null,
): Array<{ kind: NodeKind; items: PaletteNodeItem[] }> {
  if (!map) return []
  return [
    {
      kind: "job",
      items: map.jobs.map(j => ({
        kind: "job",
        id: j.id,
        title: j.title,
        hint: j.id,
      })),
    },
    {
      kind: "brief",
      items: map.briefs.map(b => ({
        kind: "brief",
        id: b.id,
        title: b.title,
        hint: b.id,
      })),
    },
    {
      kind: "feature",
      items: map.features.map(f => ({
        kind: "feature",
        id: f.id,
        title: f.id,
        hint: f.path,
      })),
    },
    {
      kind: "bdd",
      items: map.bdd.map(b => ({
        kind: "bdd",
        id: b.id,
        title: b.name,
        hint: b.path,
      })),
    },
  ].filter(group => group.items.length > 0) as Array<{
    kind: NodeKind
    items: PaletteNodeItem[]
  }>
}

// Render with a single ReactNode-typed export so consumer trees can
// keep "compose siblings" without importing the named subtree.
export type CommandPaletteHost = ReactNode
