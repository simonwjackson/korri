import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  normalizedHost,
  normalizedPath,
} from "@platform/plugin/community-source"

export const KORRI_TMNT_RESCUE_PALOOZA_PLUGIN_ID =
  "@korri:tmnt-rescue-palooza" as const

export const tmntRescuePaloozaEntry = {
  id: "tmnt-rescue-palooza",
  title: "Teenage Mutant Ninja Turtles: Rescue-Palooza!",
  url: "https://gamejolt.com/games/TMNT-Rescue-Palooza/39658",
  platform: "windows",
  description:
    "Game Jolt-hosted TMNT fangame by Merso X. Game Jolt download selection is provider-controlled and should be resolved by a Game Jolt-specific integration rather than scraped or guessed here.",
  aliases: ["gamejolt/39658", "TMNT-Rescue-Palooza", "39658"],
  searchText:
    "teenage mutant ninja turtles tmnt rescue palooza merso x gamejolt 39658 windows fangame",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const tmntRescuePaloozaPlugin = createCommunitySourcePlugin({
  name: "tmnt-rescue-palooza",
  entry: tmntRescuePaloozaEntry,
  parseUrl: url =>
    normalizedHost(url) === "gamejolt.com" &&
    /^\/games\/TMNT-Rescue-Palooza\/39658$/i.test(normalizedPath(url))
      ? tmntRescuePaloozaEntry.id
      : null,
})
