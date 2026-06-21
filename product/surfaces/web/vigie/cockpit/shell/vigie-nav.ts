import {
  Activity,
  Cpu,
  Gamepad2,
  LayoutDashboard,
  Library,
  ScrollText,
} from "lucide-react"
import type { ComponentType } from "react"

export interface VigieNavItem {
  readonly id: string
  readonly label: string
  readonly icon: ComponentType<{ className?: string }>
}

// Observability tools for the active device. Overview is wired; the rest are
// the staged "plethora of tools" surface from the fleet brief.
export const VIGIE_NAV: readonly VigieNavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "sessions", label: "Sessions", icon: Activity },
  { id: "library", label: "Library", icon: Library },
  { id: "telemetry", label: "Telemetry", icon: Cpu },
  { id: "inputs", label: "Inputs", icon: Gamepad2 },
  { id: "logs", label: "Logs", icon: ScrollText },
]
