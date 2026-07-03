import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  githubRepoParser,
} from "@platform/plugin/community-source"

export const KORRI_TINY_CRATE_PLUGIN_ID = "@korri:tiny-crate" as const

export const tinyCrateEntry = {
  id: "tiny-crate",
  title: "Tiny Crate",
  url: "https://github.com/HarmonyHoney/tiny_crate",
  platform: "source-port",
  description:
    "Unlicense Godot 3.6 source repository for Harmony Honey's crate-chucking puzzle platformer. A source-build/import path can be productized separately.",
  aliases: ["HarmonyHoney/tiny_crate", "tiny_crate"],
  searchText:
    "tiny crate harmonyhoney harmony honey github godot 3.6 unlicense puzzle platformer tiny_crate",
  nonFinalReason: "unsupported",
} as const satisfies CommunitySourcePluginEntry

export const tinyCratePlugin = createCommunitySourcePlugin({
  name: "tiny-crate",
  entry: tinyCrateEntry,
  parseUrl: githubRepoParser("HarmonyHoney", "tiny_crate", tinyCrateEntry.id),
})
