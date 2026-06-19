import {
  createCommunitySourcePlugin,
  githubRepoParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_SONIC_TIME_TWISTED_PLUGIN_ID =
  "@korri:sonic-time-twisted" as const

export const sonicTimeTwistedEntry = {
  id: "sonic-time-twisted",
  title: "Sonic Time Twisted",
  url: "https://github.com/overbound/SonicTimeTwisted",
  platform: "source-port",
  description:
    "GPL-3.0 GameMaker source repository for Overbound's Sonic Time Twisted. Build/import automation is deferred to a dedicated runtime or package plugin.",
  aliases: ["overbound/SonicTimeTwisted", "sonic-time-twisted"],
  searchText:
    "sonic time twisted overbound github game maker source gpl fangame",
  nonFinalReason: "unsupported",
} as const satisfies CommunitySourcePluginEntry

export const sonicTimeTwistedPlugin = createCommunitySourcePlugin({
  name: "sonic-time-twisted",
  entry: sonicTimeTwistedEntry,
  parseUrl: githubRepoParser(
    "overbound",
    "SonicTimeTwisted",
    sonicTimeTwistedEntry.id,
  ),
})
