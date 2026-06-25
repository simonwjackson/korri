import type { StorySpec } from "../../story-spec"
import { QualityBar } from "./QualityBar"

export default {
  render: () => (
    <>
      <QualityBar level={4} tone="good" tag="GOOD" />
      <QualityBar level={2} tone="drop" tag="DROPPING" />
    </>
  ),
} satisfies StorySpec
