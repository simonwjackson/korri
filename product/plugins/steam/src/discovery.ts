import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import { KORRI_STEAM_APP_ID, KORRI_STEAM_PLUGIN_ID } from "./ids"
import { parseVdf } from "./state-materializer"

export const KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID =
  `${KORRI_STEAM_PLUGIN_ID}/installed-apps` as const

const steamManifestPattern = /^steamapps\/appmanifest_(\d+)\.acf$/i

export const steamInstalledAppsDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID,
  title: "Steam installed apps",
  discover: async ({ files, readText }) => {
    if (readText === undefined) return []

    const observations = []
    for (const file of files) {
      const match = steamManifestPattern.exec(file.relativePath)
      if (match === null) continue
      const appIdFromPath = match[1]
      if (appIdFromPath === undefined) continue
      const content = await readText(file.absolutePath)
      if (content === undefined) continue

      let appState: Record<string, unknown>
      try {
        const parsed = parseVdf(content)
        appState = recordField(parsed, "AppState") ?? parsed
      } catch {
        continue
      }

      const appId = stringField(appState, "appid") ?? appIdFromPath
      if (appId !== appIdFromPath) continue
      const stateFlags = numberField(appState, "StateFlags")
      if (stateFlags !== 4) continue
      const manifestType = stringField(appState, "type")
      if (isKnownNonGameType(manifestType)) continue

      const title =
        nonEmptyString(stringField(appState, "name")) ?? `Steam App ${appId}`
      const buildId =
        nonEmptyString(stringField(appState, "buildid")) ??
        nonEmptyString(stringField(appState, "BuildID"))
      observations.push({
        kind: "provider-ref-release" as const,
        confidence: "high" as const,
        source: file,
        target: { provider: KORRI_STEAM_PLUGIN_ID, ref: appId },
        release: { id: "steam", title, system: "steam" },
        launch: { use: KORRI_STEAM_APP_ID },
        evidence: [
          { kind: "manifest", value: file.relativePath },
          { kind: "state-flags", value: String(stateFlags) },
          ...(manifestType !== undefined
            ? [{ kind: "type", value: manifestType }]
            : []),
          ...(buildId !== undefined
            ? [{ kind: "build-id", value: buildId }]
            : []),
        ],
      })
    }
    return observations
  },
})

function recordField(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key]
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key]
  if (typeof value === "number") return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function nonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function isKnownNonGameType(value: string | undefined): boolean {
  if (value === undefined) return false
  return value.toLowerCase() !== "game"
}
