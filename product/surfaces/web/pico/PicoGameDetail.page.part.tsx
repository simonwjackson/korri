/**
 * Game Detail page part — the routed detail screen, tagged pico.game-detail so
 * a mounted device screen at "/game/$id" inherits its edges.
 */

import { picoGames } from "./fixtures"
import { PICO_DESIGN_PARTS } from "./pico-design-parts"
import type { StorySpec } from "./story-spec"
import { VariantGameDetail } from "./VariantGameDetail"

export default {
  name: "Game Detail",
  note: "detail screen",
  presentation: "surface",
  designPartId: PICO_DESIGN_PARTS.gameDetail.id,
  render: () => <VariantGameDetail games={picoGames} />,
} satisfies StorySpec
