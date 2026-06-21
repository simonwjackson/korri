import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  githubRepoParser,
} from "../community-source"

export const KORRI_SONIC_3_AIR_PLUGIN_ID = "@korri:sonic-3-air" as const

export const sonic3AirEntry = {
  id: "sonic-3-air",
  title: "Sonic 3 A.I.R.",
  url: "https://github.com/Eukaryot/sonic3air",
  platform: "source-port",
  description:
    "GPL-3.0 Sonic 3 A.I.R. / Oxygen Engine source repository. Launchable installation requires the user's Sonic 3 & Knuckles data, so the plugin does not expose a direct game download.",
  aliases: ["Eukaryot/sonic3air", "sonic3air"],
  searchText:
    "sonic 3 air angel island revisited oxygen engine eukaryot github source port sonic3air",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const sonic3AirPlugin = createCommunitySourcePlugin({
  name: "sonic-3-air",
  entry: sonic3AirEntry,
  parseUrl: githubRepoParser("Eukaryot", "sonic3air", sonic3AirEntry.id),
})
