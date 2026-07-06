import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartySessionLifecycleHooksForRegistry,
} from "@product/plugin-host"
import { createUnavailableSeatRuntime } from "@platform/input-seat/seat-runtime-port"
import type { KorriSessiondLifecycleHook } from "./sessiond"
import type { KorriSessiondPreSpawnGate } from "./sessiond-pre-spawn"
import { createSessiondInputSeatPreSpawnGate } from "./sessiond-input-seat"

export function sessionLifecycleHooksFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): readonly KorriSessiondLifecycleHook[] {
  const registry = createFirstPartyPluginRegistryFromEnv(env)
  return firstPartySessionLifecycleHooksForRegistry(registry, { env })
}

export function sessiondPreSpawnGatesFromEnv(
  _env: NodeJS.ProcessEnv = process.env,
): readonly KorriSessiondPreSpawnGate[] {
  return [
    createSessiondInputSeatPreSpawnGate({
      runtime: createUnavailableSeatRuntime(),
    }),
  ]
}
