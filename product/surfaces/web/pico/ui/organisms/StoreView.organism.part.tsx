import { picoStoreItems } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { StoreView } from "./StoreView"

export default {
  render: () => <StoreView items={picoStoreItems} />,
} satisfies StorySpec
