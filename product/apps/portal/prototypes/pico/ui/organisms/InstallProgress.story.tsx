import { PICO_RUNTIMES } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { InstallProgress } from "./InstallProgress"

export default {
  render: () => <InstallProgress runtime={PICO_RUNTIMES[0]} />,
} satisfies StorySpec
