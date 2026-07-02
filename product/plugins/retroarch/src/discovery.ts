import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "./ids"

export const KORRI_RETROARCH_GBA_DISCOVERY_PROVIDER_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/gba-files` as const

export const retroarchGbaDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_RETROARCH_GBA_DISCOVERY_PROVIDER_ID,
  title: "RetroArch mGBA files",
  discover: ({ files }) =>
    files.flatMap(file => {
      if (file.extension.toLowerCase() !== ".gba") return []
      return [
        {
          kind: "file-release" as const,
          confidence: "high" as const,
          source: file,
          release: {
            id: KORRI_RETROARCH_GBA_SYSTEM_ID,
            system: KORRI_RETROARCH_GBA_SYSTEM_ID,
            app: KORRI_RETROARCH_APP_ID,
            runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
          },
          evidence: [{ kind: "extension", value: ".gba" }],
        },
      ]
    }),
})
