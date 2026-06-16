import {
  type AcquisitionPluginDefinition,
  createAcquisitionPluginRegistry,
} from "./plugins/registry"

export const createStaticAcquisitionPluginRegistry = (
  providers: readonly AcquisitionPluginDefinition[],
) => createAcquisitionPluginRegistry(providers)
