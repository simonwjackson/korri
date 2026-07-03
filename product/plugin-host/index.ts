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
import {
  threeDSenPlugin,
  threeDSenReadableLaunchIntegration,
} from "@product/plugins/3dsen"
import { fixtureAcquisitionPlugins } from "@product/plugins/acquisition-fixtures"
import { am2rLauncherPlugin } from "@product/plugins/am2rlauncher"
import { box64RuntimePlugin } from "@product/plugins/box64-runtime"
import { communityCatalogPlugin } from "@product/plugins/community-catalog"
import { domeRomantikPlugin } from "@product/plugins/dome-romantik"
import { fexRuntimePlugin } from "@product/plugins/fex-runtime"
import { gamescopePlugin } from "@product/plugins/gamescope"
import { createGamescopeSessionLifecycleHook } from "@product/plugins/gamescope/src/session/lifecycle-hook"
import { globebaPlugin } from "@product/plugins/globeba"
import {
  gmloaderPlugin,
  gmloaderReadableLaunchIntegration,
} from "@product/plugins/gmloader"
import { itchioPlugin } from "@product/plugins/itchio"
import { levelShareSquarePlugin } from "@product/plugins/levelsharesquare"
import { megaManArenaPlugin } from "@product/plugins/mega-man-arena"
import { megaManMakerPlugin } from "@product/plugins/mega-man-maker"
import { megaManRockNRollPlugin } from "@product/plugins/mega-man-rock-n-roll"
import { midasMachinePlugin } from "@product/plugins/midas-machine"
import { neverballPlugin } from "@product/plugins/neverball"
import { pico8Plugin } from "@product/plugins/pico8"
import { portmasterPlugin } from "@product/plugins/portmaster"
import { protonGeRuntimePlugin } from "@product/plugins/proton-ge-runtime"
import { protonRuntimePlugin } from "@product/plugins/proton-runtime"
import { psychoWaluigiPlugin } from "@product/plugins/psycho-waluigi"
import { remapPlugin } from "@product/plugins/remap"
import {
  retroarchPlugin,
  retroarchReadableLaunchIntegration,
} from "@product/plugins/retroarch"
import {
  rpcs3Plugin,
  rpcs3ReadableLaunchIntegration,
} from "@product/plugins/rpcs3"
import {
  ryubingPlugin,
  ryubingReadableLaunchIntegration,
} from "@product/plugins/ryubing"
import { shipwrightPlugin } from "@product/plugins/shipwright"
import { smbWonderland1987Plugin } from "@product/plugins/smb-wonderland-1987"
import { smbxGamePlugin } from "@product/plugins/smbxgame"
import { smwCentralPlugin } from "@product/plugins/smwcentral"
import { sonic3AirPlugin } from "@product/plugins/sonic-3-air"
import { sonicTimeTwistedPlugin } from "@product/plugins/sonic-time-twisted"
import { spelunkyClassicHdPlugin } from "@product/plugins/spelunky-classic-hd"
import { srb2Plugin } from "@product/plugins/srb2"
import { srb2KartPlugin } from "@product/plugins/srb2kart"
import { stargroveScramblePlugin } from "@product/plugins/stargrove-scramble"
import {
  createSteamLogObserverDaemon,
  createSteamSessionLifecycleHook,
  steamPlugin,
  steamReadableLaunchIntegration,
} from "@product/plugins/steam"
import { superMario127Plugin } from "@product/plugins/super-mario-127"
import { superMarioBrosRemasteredPlugin } from "@product/plugins/super-mario-bros-remastered"
import { tinyCratePlugin } from "@product/plugins/tiny-crate"
import { tmntRescuePaloozaPlugin } from "@product/plugins/tmnt-rescue-palooza"
import { turnipPlugin } from "@product/plugins/turnip"
import { webCanvasPlugin } from "@product/plugins/web-canvas"
import { webpagePlugin } from "@product/plugins/webpage"
import { xjltPlugin } from "@product/plugins/xjlt"
import { yoshisFabricationStationPlugin } from "@product/plugins/yoshis-fabrication-station"
import {
  zquestClassicPlugin,
  zquestClassicReadableLaunchIntegration,
} from "@product/plugins/zquest-classic"

export const firstPartyLaunchIntegrations = [
  retroarchReadableLaunchIntegration,
  rpcs3ReadableLaunchIntegration,
  ryubingReadableLaunchIntegration,
  steamReadableLaunchIntegration,
  threeDSenReadableLaunchIntegration,
  zquestClassicReadableLaunchIntegration,
  gmloaderReadableLaunchIntegration,
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
  rpcs3Plugin,
  gamescopePlugin,
  webpagePlugin,
  webCanvasPlugin,
  remapPlugin,
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
  gmloaderPlugin,
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
