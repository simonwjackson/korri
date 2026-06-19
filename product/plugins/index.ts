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
import { box64RuntimePlugin } from "./box64-runtime"
import { fexRuntimePlugin } from "./fex-runtime"
import { gamescopePlugin } from "./gamescope"
import { createGamescopeSessionLifecycleHook } from "./gamescope/src/session/lifecycle-hook"
import {
  threeDSenPlugin,
  threeDSenReadableLaunchIntegration,
} from "./3dsen"
import { am2rLauncherPlugin } from "./am2rlauncher"
import { communityCatalogPlugin } from "./community-catalog"
import { domeRomantikPlugin } from "./dome-romantik"
import { globebaPlugin } from "./globeba"
import { itchioPlugin } from "./itchio"
import { levelShareSquarePlugin } from "./levelsharesquare"
import { megaManArenaPlugin } from "./mega-man-arena"
import { megaManMakerPlugin } from "./mega-man-maker"
import { megaManRockNRollPlugin } from "./mega-man-rock-n-roll"
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
import { shipwrightPlugin } from "./shipwright"
import { smbxGamePlugin } from "./smbxgame"
import { smbWonderland1987Plugin } from "./smb-wonderland-1987"
import { smwCentralPlugin } from "./smwcentral"
import { sonic3AirPlugin } from "./sonic-3-air"
import { sonicTimeTwistedPlugin } from "./sonic-time-twisted"
import { spelunkyClassicHdPlugin } from "./spelunky-classic-hd"
import { srb2Plugin } from "./srb2"
import { srb2KartPlugin } from "./srb2kart"
import { stargroveScramblePlugin } from "./stargrove-scramble"
import {
  createSteamLogObserverDaemon,
  createSteamSessionLifecycleHook,
  steamPlugin,
  steamReadableLaunchIntegration,
} from "./steam"
import { superMario127Plugin } from "./super-mario-127"
import { superMarioBrosRemasteredPlugin } from "./super-mario-bros-remastered"
import { tinyCratePlugin } from "./tiny-crate"
import { tmntRescuePaloozaPlugin } from "./tmnt-rescue-palooza"
import { turnipPlugin } from "./turnip"
import { xjltPlugin } from "./xjlt"
import { yoshisFabricationStationPlugin } from "./yoshis-fabrication-station"
import { zquestClassicPlugin } from "./zquest-classic"

export const firstPartyLaunchIntegrations = [
  retroarchReadableLaunchIntegration,
  ryubingReadableLaunchIntegration,
  steamReadableLaunchIntegration,
  threeDSenReadableLaunchIntegration,
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

export interface KorriPluginDaemonHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export interface KorriPluginDaemonFactory {
  readonly pluginId: PluginId
  readonly create: () => KorriPluginDaemonHandle
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

export const firstPartyPluginDaemonFactories = [
  {
    pluginId: steamPlugin.id,
    create: createSteamLogObserverDaemon,
  },
] satisfies readonly KorriPluginDaemonFactory[]

export function firstPartyPluginDaemonsForRegistry(
  registry: Pick<PluginRegistry, "enabledPluginIds">,
): readonly KorriPluginDaemonHandle[] {
  return firstPartyPluginDaemonFactories
    .filter(factory => registry.enabledPluginIds.has(factory.pluginId))
    .map(factory => factory.create())
}

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
  box64RuntimePlugin,
  protonRuntimePlugin,
  protonGeRuntimePlugin,
  neverballPlugin,
  megaManArenaPlugin,
  megaManMakerPlugin,
  midasMachinePlugin,
  levelShareSquarePlugin,
  itchioPlugin,
  communityCatalogPlugin,
  xjltPlugin,
  tmntRescuePaloozaPlugin,
  am2rLauncherPlugin,
  sonic3AirPlugin,
  shipwrightPlugin,
  spelunkyClassicHdPlugin,
  srb2KartPlugin,
  stargroveScramblePlugin,
  domeRomantikPlugin,
  globebaPlugin,
  megaManRockNRollPlugin,
  tinyCratePlugin,
  sonicTimeTwistedPlugin,
  threeDSenPlugin,
  srb2Plugin,
  smbxGamePlugin,
  smwCentralPlugin,
  smbWonderland1987Plugin,
  steamPlugin,
  pico8Plugin,
  portmasterPlugin,
  psychoWaluigiPlugin,
  ryubingPlugin,
  superMarioBrosRemasteredPlugin,
  superMario127Plugin,
  turnipPlugin,
  yoshisFabricationStationPlugin,
  zquestClassicPlugin,
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
