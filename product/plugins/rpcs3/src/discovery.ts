import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
} from "./ids"

const PS3_DISC_MARKER = "PS3_DISC.SFB" as const
const SKIPPED_ROOT_FOLDERS = new Set(["_dev_hdd0"])

export const rpcs3Ps3DiscFolderDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  title: "RPCS3 PS3 disc folders",
  discover: ({ files }) =>
    files.flatMap(file => {
      const folderName = directChildDiscFolderName(file.relativePath)
      if (file.name !== PS3_DISC_MARKER || folderName === undefined) return []

      return [
        {
          kind: "file-release" as const,
          confidence: "high" as const,
          source: file,
          release: {
            id: localReleaseIdFromFolderName(folderName),
            title: folderName,
            system: KORRI_RPCS3_PS3_SYSTEM_ID,
            app: KORRI_RPCS3_APP_ID,
            runtime: KORRI_RPCS3_RUNTIME_ID,
          },
          evidence: [{ kind: "marker", value: PS3_DISC_MARKER }],
        },
      ]
    }),
})

function localReleaseIdFromFolderName(folderName: string): string {
  return (
    folderName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ps3-disc"
  )
}

function directChildDiscFolderName(relativePath: string): string | undefined {
  const parts = relativePath.split("/").filter(Boolean)
  if (parts.length !== 2) return undefined
  const [folderName, markerName] = parts
  if (folderName === undefined || markerName !== PS3_DISC_MARKER) {
    return undefined
  }
  if (SKIPPED_ROOT_FOLDERS.has(folderName)) return undefined
  return folderName
}
