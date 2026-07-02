/**
 * Home page part — the routed cartridge shelf, tagged pico.home so a mounted
 * device screen at "/" inherits its edges (battery / network / clock).
 */

import { picoGames } from "./fixtures"
import { PICO_DESIGN_PARTS } from "./pico-design-parts"
import type { StorySpec } from "./story-spec"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"

export default {
  name: "Home",
  note: "cartridge shelf",
  presentation: "surface",
  designPartId: PICO_DESIGN_PARTS.home.id,
  render: () => <VariantCartridgeShelf games={picoGames} />,
} satisfies StorySpec
