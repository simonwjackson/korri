import type { StorySpec } from "../../story-spec"
import { Dim } from "../atoms/Dim"
import { Card } from "./Card"

export default {
  render: () => (
    <Card title="STORAGE">
      <Dim>card body content</Dim>
    </Card>
  ),
} satisfies StorySpec
