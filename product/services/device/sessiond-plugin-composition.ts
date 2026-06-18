import { parseEnabledPluginIds } from "@platform/plugin/registry"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { createGamescopeSessionLifecycleHook } from "@product/plugins/gamescope/src/session/lifecycle-hook"
import type { KorriSessiondLifecycleHook } from "./sessiond"

export function sessionLifecycleHooksFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly KorriSessiondLifecycleHook[] {
  const enabledPluginIds = new Set(
    parseEnabledPluginIds(env.KORRI_ENABLED_PLUGINS),
  )
  if (!enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)) return []
  return [createGamescopeSessionLifecycleHook({ env })]
}
