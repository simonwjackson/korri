import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartySessionLifecycleHooksForRegistry,
} from "@product/plugins"
import type { KorriSessiondLifecycleHook } from "./sessiond"

export function sessionLifecycleHooksFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly KorriSessiondLifecycleHook[] {
  const registry = createFirstPartyPluginRegistryFromEnv(env)
  return firstPartySessionLifecycleHooksForRegistry(registry, { env })
}
