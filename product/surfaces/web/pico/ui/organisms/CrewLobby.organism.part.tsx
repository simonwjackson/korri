import { picoPlayers } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { CrewLobby } from "./CrewLobby"

export default {
  presentation: "surface", // full lobby stage with seat slots
  render: () => <CrewLobby players={picoPlayers} />,
} satisfies StorySpec
