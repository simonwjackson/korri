import type { StorySpec } from "../../story-spec"
import { Title } from "./Title"

export default {
  note: "size -1 / 0 / 1",
  render: () => (
    <>
      <Title size={-1}>SMALL</Title>
      <Title size={0}>BASE</Title>
      <Title size={1}>BIG</Title>
    </>
  ),
} satisfies StorySpec
