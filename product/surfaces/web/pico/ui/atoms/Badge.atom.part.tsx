import type { StorySpec } from "../../story-spec"
import { Badge } from "./Badge"

export default {
  render: () => (
    <>
      <Badge tone="accent">NEW</Badge> <Badge tone="good">OK</Badge>{" "}
      <Badge tone="bad">FAIL</Badge> <Badge tone="info">INFO</Badge>
    </>
  ),
} satisfies StorySpec
