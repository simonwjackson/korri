import { approvedFixturePluginDefinitions } from "./approved-fixtures"
import { chip8ArchivePluginDefinition } from "./chip8archive"
import type { AcquisitionPluginDefinition } from "./registry"

export const approvedTypeScriptPluginDefinitions: readonly AcquisitionPluginDefinition[] =
  [chip8ArchivePluginDefinition, ...approvedFixturePluginDefinitions]
