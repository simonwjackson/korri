import {
  createCommunitySourcePlugin,
  githubRepoParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_SHIPWRIGHT_PLUGIN_ID = "@korri:shipwright" as const

export const shipwrightEntry = {
  id: "shipwright",
  title: "Ship of Harkinian",
  url: "https://github.com/HarbourMasters/Shipwright",
  platform: "source-port",
  description:
    "HarbourMasters' Shipwright / Ship of Harkinian source repository. A playable setup requires user-supplied original game data, so this plugin does not expose a direct game download.",
  aliases: ["HarbourMasters/Shipwright", "ship-of-harkinian", "soh"],
  searchText:
    "shipwright ship of harkinian harbourmasters github source port ocarina of time soh",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const shipwrightPlugin = createCommunitySourcePlugin({
  name: "shipwright",
  entry: shipwrightEntry,
  parseUrl: githubRepoParser("HarbourMasters", "Shipwright", shipwrightEntry.id),
})
