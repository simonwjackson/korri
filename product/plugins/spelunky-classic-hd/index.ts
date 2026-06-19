import {
  createCommunitySourcePlugin,
  githubRepoParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_SPELUNKY_CLASSIC_HD_PLUGIN_ID =
  "@korri:spelunky-classic-hd" as const

export const spelunkyClassicHdEntry = {
  id: "spelunky-classic-hd",
  title: "Spelunky Classic HD",
  url: "https://github.com/JanTrueno/SpelunkyClassicHD",
  platform: "source-port",
  description:
    "JanTrueno's GameMaker LTS modernization of Derek Yu's Spelunky Classic. The public GitHub source is cataloged; build/import automation can be layered on separately.",
  aliases: ["JanTrueno/SpelunkyClassicHD"],
  searchText:
    "spelunky classic hd jantrueno github game maker lts derek yu source",
  nonFinalReason: "unsupported",
} as const satisfies CommunitySourcePluginEntry

export const spelunkyClassicHdPlugin = createCommunitySourcePlugin({
  name: "spelunky-classic-hd",
  entry: spelunkyClassicHdEntry,
  parseUrl: githubRepoParser(
    "JanTrueno",
    "SpelunkyClassicHD",
    spelunkyClassicHdEntry.id,
  ),
})
