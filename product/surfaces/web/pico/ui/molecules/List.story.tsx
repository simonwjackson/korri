import type { StorySpec } from "../../story-spec"
import { List } from "./List"
import { Row } from "./Row"

export default {
  name: "List + Row",
  render: () => (
    <List>
      <Row
        label="Continue"
        meta="68% · City of Tears"
        trailing="▸"
        state="selected"
      />
      <Row label="Library" meta="142 games" />
      <Row label="Settings" />
    </List>
  ),
} satisfies StorySpec
