import type { Story } from "@tools/theme-workshop"
import { picoConfig } from "./config"

export const rootProps = picoConfig.rootProps
export const classNames = picoConfig.classNames

export const PicoPageStories = (picoConfig.screens ?? []).map(screen => ({
  id: `pico-page-${screen.id}`,
  layer: "page" as const,
  name: screen.name,
  note: screen.group,
  surface: true,
  render: screen.render,
})) satisfies readonly Story[]
