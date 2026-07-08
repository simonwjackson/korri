import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
  KORRI_MELONDS_NDS_SYSTEM_ID,
} from "./ids"

export const melonDsNdsDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
  title: "melonDS Nintendo DS ROM files",
  discover: ({ files }) =>
    files.flatMap(file => {
      if (file.extension.toLowerCase() !== ".nds") return []

      return [
        {
          kind: "file-release" as const,
          confidence: "high" as const,
          source: file,
          release: {
            id: KORRI_MELONDS_NDS_SYSTEM_ID,
            system: KORRI_MELONDS_NDS_SYSTEM_ID,
            app: KORRI_MELONDS_APP_ID,
          },
          evidence: [{ kind: "extension", value: ".nds" }],
        },
      ]
    }),
})
