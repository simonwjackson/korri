import {
  createCommunitySourcePlugin,
  githubRepoParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_SRB2KART_PLUGIN_ID = "@korri:srb2kart" as const

export const srb2KartEntry = {
  id: "srb2kart",
  title: "Sonic Robo Blast 2 Kart",
  url: "https://github.com/STJr/Kart-Public",
  platform: "source-port",
  description:
    "GPL-2.0 SRB2 Kart public source repository. This plugin records the source acquisition candidate while leaving build/productization to the SRB2Kart runtime/package path.",
  aliases: ["STJr/Kart-Public", "kart-public", "srb2-kart"],
  searchText:
    "srb2 kart srb2kart sonic robo blast 2 kart stjr kart-public github source gpl",
  nonFinalReason: "unsupported",
} as const satisfies CommunitySourcePluginEntry

export const srb2KartPlugin = createCommunitySourcePlugin({
  name: "srb2kart",
  entry: srb2KartEntry,
  parseUrl: githubRepoParser("STJr", "Kart-Public", srb2KartEntry.id),
})
