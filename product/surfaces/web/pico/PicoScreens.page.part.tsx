import type { Story } from "@simonwjackson/caliper"
import { picoConfig } from "./config"

export const rootProps = picoConfig.rootProps
export const classNames = picoConfig.classNames

// The routed device pages have dedicated design-part parts (PicoHome /
// PicoGameDetail carry pico.home / pico.game-detail); keep them out of the
// bridge so the parts tree shows one entry per page, not two.
const DEDICATED_PAGE_PARTS = new Set(["lib-shelf", "det-detail"])

export const PicoPageStories = (picoConfig.screens ?? [])
  .filter(screen => !DEDICATED_PAGE_PARTS.has(screen.id))
  .map(screen => ({
    id: `pico-page-${screen.id}`,
    layer: "page" as const,
    name: screen.name,
    note: screen.group,
    surface: true,
    render: screen.render,
  })) satisfies readonly Story[]
