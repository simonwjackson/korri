import {
  type CommunitySourcePluginEntry,
  createCommunitySourcePlugin,
  itchioParser,
} from "../community-source"
import { KORRI_ITCHIO_PLUGIN_ID } from "../itchio"

export const KORRI_DOME_ROMANTIK_PLUGIN_ID = "@korri:dome-romantik" as const

export const domeRomantikEntry = {
  id: "dome-romantik",
  title: "Dome Romantik",
  url: "https://bippinbits.itch.io/dome-romantik",
  platform: "itchio-html5-windows-linux",
  description:
    "Free Ludum Dare 48 jam version of Dome Keeper by bippinbits and Cameron Paxton on itch.io, with HTML5, Windows, and Linux releases. Download resolution remains delegated to the first-party itch.io plugin.",
  aliases: ["bippinbits/dome-romantik"],
  searchText:
    "dome romantik bippinbits cameron paxton dome keeper ludum dare 48 itch.io godot linux windows html5",
  nonFinalReason: "requires-user-action",
} as const satisfies CommunitySourcePluginEntry

export const domeRomantikPlugin = createCommunitySourcePlugin({
  name: "dome-romantik",
  entry: domeRomantikEntry,
  parseUrl: itchioParser("bippinbits", "dome-romantik", domeRomantikEntry.id),
  requires: [
    {
      capability: "artifact.resolve-download",
      ref: { provider: KORRI_ITCHIO_PLUGIN_ID, id: "self" },
      reason:
        "itch.io download resolution remains owned by the shared itch.io plugin.",
    },
  ],
})
