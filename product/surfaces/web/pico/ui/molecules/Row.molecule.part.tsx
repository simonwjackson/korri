import type { StorySpec } from "../../story-spec"
import { Icon } from "../atoms/Icon"
import { Row } from "./Row"

export default {
  render: () => (
    <Row
      icon={<Icon name="play" />}
      label="Continue"
      meta="68% · City of Tears"
      trailing="▸"
      state="selected"
    />
  ),
} satisfies StorySpec
