import type { PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { fexRuntimePlugin } from "./fex-runtime"
import { gamescopePlugin } from "./gamescope"
import { levelShareSquarePlugin } from "./levelsharesquare"
import { megaManArenaPlugin } from "./mega-man-arena"
import { megaManMakerPlugin } from "./mega-man-maker"
import { midasMachinePlugin } from "./midas-machine"
import { neverballPlugin } from "./neverball"
import { pico8BbsPlugin } from "./pico8-bbs"
import { protonGeRuntimePlugin } from "./proton-ge-runtime"
import { protonRuntimePlugin } from "./proton-runtime"
import { psychoWaluigiPlugin } from "./psycho-waluigi"
import { ryubingPlugin, ryubingReadableLaunchIntegration } from "./ryubing"
import { srb2Plugin } from "./srb2"
import { superMario127Plugin } from "./super-mario-127"
import { superMarioBrosRemasteredPlugin } from "./super-mario-bros-remastered"
import { yoshisFabricationStationPlugin } from "./yoshis-fabrication-station"

export const firstPartyLaunchIntegrations = [ryubingReadableLaunchIntegration]

export const firstPartyPlugins = [
  gamescopePlugin,
  fexRuntimePlugin,
  protonRuntimePlugin,
  protonGeRuntimePlugin,
  neverballPlugin,
  megaManArenaPlugin,
  megaManMakerPlugin,
  midasMachinePlugin,
  levelShareSquarePlugin,
  srb2Plugin,
  pico8BbsPlugin,
  psychoWaluigiPlugin,
  ryubingPlugin,
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
