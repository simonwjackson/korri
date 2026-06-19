import {
  createCommunitySourcePlugin,
  exactUrlParser,
  type CommunitySourcePluginEntry,
} from "../community-source"

export const KORRI_MEGA_MAN_ROCK_N_ROLL_PLUGIN_ID =
  "@korri:mega-man-rock-n-roll" as const

const downloadUrl =
  "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip"

export const megaManRockNRollEntry = {
  id: "mega-man-rock-n-roll",
  title: "Mega Man Rock N Roll",
  url: downloadUrl,
  platform: "linux-x86_64",
  description:
    "Public Linux 1.3 ZIP for Dennis Engelhard's Mega Man Rock N Roll. This plugin exposes the stable direct artifact URL without auth or interstitial flow.",
  aliases: ["megaman-rocknroll", "mega-man-rocknroll"],
  searchText:
    "mega man rock n roll megaman rocknroll dennis engelhard linux 1.3 direct zip godot fangame",
  download: {
    url: downloadUrl,
    filename: "megaman_rocknroll_linux_1.3.zip",
    contentType: "application/zip",
  },
} as const satisfies CommunitySourcePluginEntry

export const megaManRockNRollPlugin = createCommunitySourcePlugin({
  name: "mega-man-rock-n-roll",
  entry: megaManRockNRollEntry,
  parseUrl: exactUrlParser(downloadUrl, megaManRockNRollEntry.id),
})
