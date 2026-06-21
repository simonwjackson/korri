import { picoAppChoices } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { AppChoiceList } from "./AppChoiceList"

export default {
  render: () => <AppChoiceList choices={picoAppChoices} />,
} satisfies StorySpec
