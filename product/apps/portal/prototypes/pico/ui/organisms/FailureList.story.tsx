import { PICO_FAILURE_KINDS } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { FailureList } from "./FailureList"

export default {
  surface: true, // pc-fill list that fills its container
  render: () => <FailureList failures={PICO_FAILURE_KINDS} />,
} satisfies StorySpec
