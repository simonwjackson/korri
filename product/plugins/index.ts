import {
  createPluginRegistry,
  parseEnabledPluginIds,
} from "@platform/plugin/registry"
import { neverballPlugin } from "./neverball"

export const firstPartyPlugins = [neverballPlugin] as const

export function createFirstPartyPluginRegistryFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return createPluginRegistry(firstPartyPlugins, {
    enabledPluginIds: parseEnabledPluginIds(env.KORRI_ENABLED_PLUGINS),
  })
}
