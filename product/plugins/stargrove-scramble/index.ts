import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  itchioParser,
} from "@platform/plugin/community-source"
import { KORRI_ITCHIO_PLUGIN_ID } from "../itchio"

export const KORRI_STARGROVE_SCRAMBLE_PLUGIN_ID =
  "@korri:stargrove-scramble" as const

export const stargroveScrambleEntry = {
  id: "stargrove-scramble",
  title: "Stargrove Scramble",
  url: "https://team-bugulon.itch.io/stargrove-scramble",
  platform: "itchio-html5-windows",
  description:
    "Free Team Bugulon GameMaker platformer on itch.io with HTML5 and Windows releases. Download resolution is delegated to the first-party itch.io plugin so public/authenticated itch flows stay centralized.",
  aliases: ["team-bugulon/stargrove-scramble"],
  searchText:
    "stargrove scramble team bugulon itch.io itch platformer gamemaker eggs windows html5",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const stargroveScramblePlugin = createCommunitySourcePlugin({
  name: "stargrove-scramble",
  entry: stargroveScrambleEntry,
  parseUrl: itchioParser(
    "team-bugulon",
    "stargrove-scramble",
    stargroveScrambleEntry.id,
  ),
  requires: [
    {
      capability: "artifact.resolve-download",
      ref: { provider: KORRI_ITCHIO_PLUGIN_ID, id: "self" },
      reason:
        "itch.io download resolution remains owned by the shared itch.io plugin.",
    },
  ],
})
