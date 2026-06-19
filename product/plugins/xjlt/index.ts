import {
  createCommunitySourcePlugin,
  normalizedHost,
  normalizedPath,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_XJLT_PLUGIN_ID = "@korri:xjlt" as const

export const xjltEntry = {
  id: "xjlt",
  title: "Teenage Mutant Ninja Turtles X Justice League Turbo",
  url: "https://kamekaze.world/xjlt/",
  platform: "ikemen-go",
  description:
    "NewsTeam6's I.K.E.M.E.N. Go fighting game. The public page advertises Windows, macOS, and Linux builds but does not expose a stable direct artifact URL in markup, so the plugin records the acquisition claim without inventing a download URL.",
  aliases: ["kamekaze/xjlt", "kamekaze.world/xjlt"],
  searchText:
    "xjlt teenage mutant ninja turtles justice league turbo newsteam6 kamekaze ikemen go fighting",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const xjltPlugin = createCommunitySourcePlugin({
  name: "xjlt",
  entry: xjltEntry,
  parseUrl: url =>
    normalizedHost(url) === "kamekaze.world" && normalizedPath(url) === "/xjlt"
      ? xjltEntry.id
      : null,
})
