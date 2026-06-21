import type { StorySpec } from "../../story-spec"
import { type Collection, CollectionList } from "./CollectionList"

const collections: readonly Collection[] = [
  { name: "FAVORITES", count: 12 },
  { name: "RECENTLY ADDED", count: 24 },
  { name: "CO-OP NIGHT", count: 8 },
  { name: "SPEEDRUN", count: 15 },
  { name: "HIDDEN GEMS", count: 6 },
]

export default {
  render: () => <CollectionList collections={collections} />,
} satisfies StorySpec
