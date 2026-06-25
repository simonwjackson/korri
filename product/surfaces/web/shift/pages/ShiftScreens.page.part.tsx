import type { Story } from "@tools/theme-workshop"
import { shiftConfig } from "../config"

export const ShiftPageStories = (shiftConfig.screens ?? []).map(screen => ({
  id: `shift-page-${screen.id}`,
  layer: "page" as const,
  name: screen.name,
  note: screen.group,
  surface: true,
  render: screen.render,
})) satisfies readonly Story[]
