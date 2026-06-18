import type { PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { fexRuntimePlugin } from "./fex-runtime"
import { gamescopePlugin } from "./gamescope"
import { megaManArenaPlugin } from "./mega-man-arena"
import { neverballPlugin } from "./neverball"
import { pico8BbsPlugin } from "./pico8-bbs"
import { protonGeRuntimePlugin } from "./proton-ge-runtime"
import { protonRuntimePlugin } from "./proton-runtime"
import { psychoWaluigiPlugin } from "./psycho-waluigi"
import { srb2Plugin } from "./srb2"
import { superMario127Plugin } from "./super-mario-127"
import { superMarioBrosRemasteredPlugin } from "./super-mario-bros-remastered"
import { yoshisFabricationStationPlugin } from "./yoshis-fabrication-station"

export const firstPartyPlugins = [
  gamescopePlugin,
  fexRuntimePlugin,
  protonRuntimePlugin,
  protonGeRuntimePlugin,
  neverballPlugin,
  megaManArenaPlugin,
  srb2Plugin,
  pico8BbsPlugin,
  psychoWaluigiPlugin,
  superMarioBrosRemasteredPlugin,
  superMario127Plugin,
  yoshisFabricationStationPlugin,
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
): readonly PluginId[] => [...new Set(parseEnabledPluginIds(enabledPlugins))]
