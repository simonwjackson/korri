import { picoHero } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { UpdatePanel } from "./UpdatePanel"

export default {
  render: () => <UpdatePanel target={picoHero} />,
} satisfies StorySpec
