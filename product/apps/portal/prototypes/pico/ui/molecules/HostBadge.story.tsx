import type { StorySpec } from "../../story-spec"
import { HostBadge } from "./HostBadge"

export default {
  render: () => (
    <>
      <HostBadge status="online" /> <HostBadge status="busy" />{" "}
      <HostBadge status="paired" /> <HostBadge status="offline" />
    </>
  ),
} satisfies StorySpec
