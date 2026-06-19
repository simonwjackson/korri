import { KORRI_ITCHIO_PLUGIN_ID } from "../itchio"
import {
  createCommunitySourcePlugin,
  itchioParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_GLOBEBA_PLUGIN_ID = "@korri:globeba" as const

export const globebaEntry = {
  id: "globeba",
  title: "Globeba",
  url: "https://team-bugulon.itch.io/globeba",
  platform: "itchio-html5-windows",
  description:
    "Free Team Bugulon Ludum Dare 55 action-adventure on itch.io with HTML5 and Windows releases. Download resolution is delegated to the first-party itch.io plugin.",
  aliases: ["team-bugulon/globeba"],
  searchText:
    "globeba team bugulon itch.io ludum dare 55 game maker adventure role playing windows html5",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const globebaPlugin = createCommunitySourcePlugin({
  name: "globeba",
  entry: globebaEntry,
  parseUrl: itchioParser("team-bugulon", "globeba", globebaEntry.id),
  requires: [
    {
      capability: "artifact.resolve-download",
      ref: { provider: KORRI_ITCHIO_PLUGIN_ID, id: "self" },
      reason: "itch.io download resolution remains owned by the shared itch.io plugin.",
    },
  ],
})
