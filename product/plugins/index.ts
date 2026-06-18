import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import type { PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  type PluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import type {
  KorriSessionLifecycleHook,
  KorriSessionLifecycleHookFactory,
  KorriSessionLifecycleHookFactoryOptions,
} from "@platform/plugin/session-lifecycle"
import { fixtureAcquisitionPlugins } from "./acquisition-fixtures"
import { fexRuntimePlugin } from "./fex-runtime"
import { gamescopePlugin } from "./gamescope"
import { createGamescopeSessionLifecycleHook } from "./gamescope/src/session/lifecycle-hook"
import { levelShareSquarePlugin } from "./levelsharesquare"
import { megaManArenaPlugin } from "./mega-man-arena"
import { megaManMakerPlugin } from "./mega-man-maker"
import { midasMachinePlugin } from "./midas-machine"
import { neverballPlugin } from "./neverball"
import { pico8Plugin } from "./pico8"
import { portmasterPlugin } from "./portmaster"
import { protonGeRuntimePlugin } from "./proton-ge-runtime"
import { protonRuntimePlugin } from "./proton-runtime"
import { psychoWaluigiPlugin } from "./psycho-waluigi"
import {
  retroarchPlugin,
  retroarchReadableLaunchIntegration,
} from "./retroarch"
import { ryubingPlugin, ryubingReadableLaunchIntegration } from "./ryubing"
import { smbxGamePlugin } from "./smbxgame"
import { smwCentralPlugin } from "./smwcentral"
import { srb2Plugin } from "./srb2"
import {
  createSteamSessionLifecycleHook,
  steamPlugin,
  steamReadableLaunchIntegration,
} from "./steam"
import { superMario127Plugin } from "./super-mario-127"
import { superMarioBrosRemasteredPlugin } from "./super-mario-bros-remastered"
import { yoshisFabricationStationPlugin } from "./yoshis-fabrication-station"

export const firstPartyLaunchIntegrations = [
  retroarchReadableLaunchIntegration,
  ryubingReadableLaunchIntegration,
  steamReadableLaunchIntegration,
]

export function firstPartyLaunchIntegrationsForRegistry(
  registry: Pick<PluginRegistry, "enabledPluginIds">,
): readonly ReadableLaunchIntegration[] {
  return firstPartyLaunchIntegrations.filter(
    integration =>
      integration.providerId === undefined ||
      registry.enabledPluginIds.has(integration.providerId),
  )
}

export const firstPartySessionLifecycleHookFactories = [
  {
    pluginId: gamescopePlugin.id,
    create: createGamescopeSessionLifecycleHook,
  },
  {
    pluginId: steamPlugin.id,
    create: () => createSteamSessionLifecycleHook(),
  },
] satisfies readonly KorriSessionLifecycleHookFactory[]

export function firstPartySessionLifecycleHooksForRegistry(
  registry: Pick<PluginRegistry, "enabledPluginIds">,
  options: KorriSessionLifecycleHookFactoryOptions = {},
): readonly KorriSessionLifecycleHook[] {
  return firstPartySessionLifecycleHookFactories
    .filter(factory => registry.enabledPluginIds.has(factory.pluginId))
    .map(factory => factory.create(options))
}

export const firstPartyPlugins = [
  retroarchPlugin,
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
  smbxGamePlugin,
  smwCentralPlugin,
  steamPlugin,
  pico8Plugin,
  portmasterPlugin,
  psychoWaluigiPlugin,
  ryubingPlugin,
  superMarioBrosRemasteredPlugin,
  superMario127Plugin,
  yoshisFabricationStationPlugin,
  ...fixtureAcquisitionPlugins,
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
