import {
  type AcquisitionPluginDefinition,
  createAcquisitionPluginRegistry,
} from "./plugins/registry"

export const createStaticAcquisitionPluginRegistry = (
  plugins: readonly AcquisitionPluginDefinition[],
) => createAcquisitionPluginRegistry(plugins)
