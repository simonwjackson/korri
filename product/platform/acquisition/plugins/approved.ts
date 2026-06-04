import type { AcquisitionPluginDefinition } from "./registry"

const approvedTypeScriptSources = [
  ["chip8archive", "CHIP-8 Archive", "low"],
  ["homebrewhub", "Homebrew Hub", "low"],
  ["itchio", "itch.io", "medium"],
  ["pico8bbs", "PICO-8 BBS", "medium"],
  ["portmaster", "PortMaster", "low"],
  ["puzzlescript", "PuzzleScript", "low"],
  ["retrobrews", "RetroBrews", "low"],
  ["tic80gallery", "TIC-80 Gallery", "low"],
  ["wasm4gallery", "WASM-4 Gallery", "low"],
] as const

export const approvedTypeScriptPluginDefinitions: readonly AcquisitionPluginDefinition[] =
  approvedTypeScriptSources.map(([sourceName, displayName, legalRisk]) => ({
    metadata: {
      sourceName,
      displayName,
      module: `product/platform/acquisition/plugins/${sourceName}`,
      builtIn: true,
      enabledByDefault: true,
      legalRisk,
      credentialRequired: sourceName === "itchio",
    },
  }))
