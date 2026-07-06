import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import {
  createFirstPartyPluginState,
  createFirstPartyPluginStateWithLocalRoots,
} from "./state"

export function createFirstPartyAcquisitionPluginDefinitionsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return acquisitionPluginDefinitionsFromPluginRegistry(
    createFirstPartyPluginState({ env, mode: "runtime" }).registry,
  )
}

export async function createFirstPartyAcquisitionPluginDefinitionsFromConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const state = await createFirstPartyPluginStateWithLocalRoots({
    env,
    mode: "runtime",
  })
  return acquisitionPluginDefinitionsFromPluginRegistry(state.registry)
}
