import type { ReadableLaunchIntegration } from "@platform/library/proseql/library-repository"
import type { PluginDaemonHandle, PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  type PluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import type {
  KorriSessionLifecycleHook,
  KorriSessionLifecycleHookFactoryOptions,
} from "@platform/plugin/session-lifecycle"
import { threeDSenReadableLaunchIntegration } from "@product/plugins/3dsen"
import { gmloaderReadableLaunchIntegration } from "@product/plugins/gmloader"
import { retroarchReadableLaunchIntegration } from "@product/plugins/retroarch"
import { rpcs3ReadableLaunchIntegration } from "@product/plugins/rpcs3"
import { ryubingReadableLaunchIntegration } from "@product/plugins/ryubing"
import { steamReadableLaunchIntegration } from "@product/plugins/steam"
import { zquestClassicReadableLaunchIntegration } from "@product/plugins/zquest-classic"
import { bundledFirstPartyPlugins } from "./roots"

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

export type KorriPluginDaemonHandle = PluginDaemonHandle

export function firstPartyPluginDaemonsForRegistry(
  registry: Pick<PluginRegistry, "daemons">,
): readonly PluginDaemonHandle[] {
  return registry.daemons.map(factory => factory.create())
}

export function firstPartySessionLifecycleHooksForRegistry(
  registry: Pick<PluginRegistry, "lifecycleHooks">,
  options: KorriSessionLifecycleHookFactoryOptions = {},
): readonly KorriSessionLifecycleHook[] {
  return registry.lifecycleHooks.map(factory => factory.create(options))
}

export const firstPartyPlugins = bundledFirstPartyPlugins

export function createFirstPartyPluginRegistryFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return createPluginRegistry(firstPartyPlugins, {
    enabledPluginIds: enabledFirstPartyPluginIds(env.KORRI_ENABLED_PLUGINS),
  })
}

/**
 * Registry for interactive first-party surfaces (the on-device `korri` CLI).
 * KORRI_ENABLED_PLUGINS is unit-level composition: login shells do not inherit
 * it, and an interactive operator tool must not silently do less than the
 * shipped product because of that. When the variable is absent, the full
 * first-party set is enabled; when present, it stays authoritative (including
 * narrowing). Daemons keep using createFirstPartyPluginRegistryFromEnv.
 */
export function createInteractiveFirstPartyPluginRegistry(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured = env.KORRI_ENABLED_PLUGINS?.trim()
  return configured
    ? createFirstPartyPluginRegistryFromEnv(env)
    : createPluginRegistry(firstPartyPlugins, {
        enabledPluginIds: firstPartyPlugins.map(plugin => plugin.id),
      })
}

const enabledFirstPartyPluginIds = (
  enabledPlugins: string | undefined,
): readonly PluginId[] => [...new Set(parseEnabledPluginIds(enabledPlugins))]
