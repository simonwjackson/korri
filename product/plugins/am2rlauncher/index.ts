import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  githubRepoParser,
} from "../community-source"

export const KORRI_AM2RLAUNCHER_PLUGIN_ID = "@korri:am2rlauncher" as const

export const am2rLauncherEntry = {
  id: "am2rlauncher",
  title: "AM2RLauncher",
  url: "https://github.com/AM2R-Community-Developers/AM2RLauncher",
  platform: "launcher",
  description:
    "GPL-3.0 AM2R community launcher repository. The plugin catalogs the launcher and acquisition source while keeping original AM2R game payload handling separate from source-code acquisition.",
  aliases: ["AM2R-Community-Developers/AM2RLauncher", "am2r"],
  searchText:
    "am2r launcher am2rlauncher another metroid 2 remake community developers github launcher acquisition catalog",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const am2rLauncherPlugin = createCommunitySourcePlugin({
  name: "am2rlauncher",
  entry: am2rLauncherEntry,
  parseUrl: githubRepoParser(
    "AM2R-Community-Developers",
    "AM2RLauncher",
    am2rLauncherEntry.id,
  ),
})
