import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { createFirstPartyPluginRegistryFromEnv } from "."

export function createFirstPartyAcquisitionPluginDefinitionsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return acquisitionPluginDefinitionsFromPluginRegistry(
    createFirstPartyPluginRegistryFromEnv(env),
  )
}
