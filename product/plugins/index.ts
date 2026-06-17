import { KORRI_GAMESCOPE_PLUGIN_ID } from "@platform/plugin/ids"
import type { PluginId } from "@platform/plugin"
import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { gamescopePlugin } from "./gamescope"
import { neverballPlugin } from "./neverball"

export const firstPartyPlugins = [gamescopePlugin, neverballPlugin] as const

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
