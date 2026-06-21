import { picoHosts } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { HostScanList } from "./HostScanList"

export default {
  render: () => <HostScanList hosts={picoHosts} />,
} satisfies StorySpec
