import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { createFirstPartyPluginState } from "./state"

export function createFirstPartyAcquisitionPluginDefinitionsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return acquisitionPluginDefinitionsFromPluginRegistry(
    createFirstPartyPluginState({ env, mode: "runtime" }).registry,
  )
}
