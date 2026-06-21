import { PICO_SYSTEMS } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { SystemGrid } from "./SystemGrid"

export default {
  render: () => <SystemGrid systems={PICO_SYSTEMS} />,
} satisfies StorySpec
