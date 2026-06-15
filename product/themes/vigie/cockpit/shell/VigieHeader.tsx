import { Separator } from "@platform/react/primitives/components/ui/separator"
import { SidebarTrigger } from "@platform/react/primitives/components/ui/sidebar"
import { Search } from "lucide-react"
import { VigieScenarioScrubber } from "../components/VigieScenarioScrubber"
import { useVigieCockpit } from "../VigieCockpit.context"
import { VIGIE_NAV } from "./vigie-nav"

// Header on shadcn-admin's pattern: sidebar trigger + breadcrumb, with the
// dev-only state preview and a command-palette affordance on the right.

export function VigieHeader() {
  const { device, section } = useVigieCockpit()
  const sectionLabel =
    VIGIE_NAV.find(item => item.id === section)?.label ?? "Overview"

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-5">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <span className="text-muted-foreground">{device.name}</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-medium">{sectionLabel}</span>
      </nav>

      <div className="ms-auto flex items-center gap-3">
        <VigieScenarioScrubber />
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span>Search</span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-(length:--vigie-text-2xs)">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  )
}
