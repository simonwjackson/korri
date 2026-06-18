import type { PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { fexRuntimePlugin } from "./fex-runtime"
import { gamescopePlugin, KORRI_GAMESCOPE_PLUGIN_ID } from "./gamescope"
import { megaManArenaPlugin } from "./mega-man-arena"
import { neverballPlugin } from "./neverball"
import { protonGeRuntimePlugin } from "./proton-ge-runtime"
import { protonRuntimePlugin } from "./proton-runtime"
import { srb2Plugin } from "./srb2"

export const firstPartyPlugins = [
  gamescopePlugin,
  fexRuntimePlugin,
  protonRuntimePlugin,
  protonGeRuntimePlugin,
  neverballPlugin,
  megaManArenaPlugin,
  srb2Plugin,
] as const

export function createFirstPartyPluginRegistryFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return createPluginRegistry(firstPartyPlugins, {
    enabledPluginIds: enabledFirstPartyPluginIds(env.KORRI_ENABLED_PLUGINS),
  })
}

const enabledFirstPartyPluginIds = (
  enabledPlugins: string | undefined,
): readonly PluginId[] => [
  ...new Set([
    KORRI_GAMESCOPE_PLUGIN_ID,
    ...parseEnabledPluginIds(enabledPlugins),
  ]),
]
